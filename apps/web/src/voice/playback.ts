// Schedules PCM16 24kHz agent audio back-to-back.
// Samples that arrive before the context is running stay queued, including
// the first chunk, and start ~100ms ahead of currentTime after resume.
// Pending and already scheduled audio share one generous backlog cap. A chunk
// that would pass the cap, or a resume/playback failure, is reported once and
// is not trimmed into a tail that sounds like the full reply.
// Speech and reply events do not flush; stop/destroy does.

import { pcm16ToFloat, base64ToPCM16 } from './pcm';

export const PLAYBACK_SAMPLE_RATE = 24000;

/** Lead time applied when the schedule has caught up to the audio clock. */
export const PLAYBACK_PREBUFFER_SEC = 0.1;

/**
 * Default makeup gain for streamed voice chunks (+6.85 dB). Native-audio streams
 * from Gemini Live (Kore/Puck) have generous headroom (-18 to -12 dBFS) and are
 * further attenuated by OS/WebRTC communications ducking when the mic is open.
 */
export const DEFAULT_PLAYBACK_GAIN = 2.2;
export const MIN_PLAYBACK_GAIN = 0.5;
export const MAX_PLAYBACK_GAIN = 4.0;

/** Automatic loudness target peak (-1.1 dBFS) and noise gate floor (-42 dBFS). */
export const AGC_TARGET_PEAK = 0.88;
export const AGC_NOISE_FLOOR = 0.008;
export const SOFT_CLIP_KNEE = 0.8;
export const SOFT_CLIP_CEILING = 0.98;

export function clampPlaybackGain(gain: number): number {
  if (!Number.isFinite(gain)) return DEFAULT_PLAYBACK_GAIN;
  if (gain < MIN_PLAYBACK_GAIN) return MIN_PLAYBACK_GAIN;
  if (gain > MAX_PLAYBACK_GAIN) return MAX_PLAYBACK_GAIN;
  return gain;
}

/**
 * Transparent soft-knee limiter. Linear inside [-0.80, 0.80] and smooth tanh
 * saturation above the knee, approaching ±0.98 so boosted speech never hard-clips.
 */
export function softClipSample(sample: number): number {
  if (!Number.isFinite(sample)) return 0;
  const abs = Math.abs(sample);
  if (abs <= SOFT_CLIP_KNEE) return sample;
  const span = SOFT_CLIP_CEILING - SOFT_CLIP_KNEE;
  const compressed = Math.min(
    SOFT_CLIP_CEILING,
    SOFT_CLIP_KNEE + span * Math.tanh((abs - SOFT_CLIP_KNEE) / span),
  );
  return sample < 0 ? -compressed : compressed;
}

/**
 * Applies makeup gain, adaptive peak normalization (for spoken chunks above the
 * noise floor), and soft-knee limiting so quiet Gemini Live turns sound full and
 * clear without distorting louder syllables.
 */
export function boostVoiceSamples(
  samples: Float32Array,
  gain = DEFAULT_PLAYBACK_GAIN,
  agcEnabled = true,
): Float32Array {
  if (samples.length === 0) return samples;
  const safeGain = clampPlaybackGain(gain);
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }

  let effectiveGain = safeGain;
  if (agcEnabled && peak >= AGC_NOISE_FLOOR) {
    const neededForTarget = AGC_TARGET_PEAK / peak;
    const maxAdaptive = Math.min(MAX_PLAYBACK_GAIN, safeGain * 1.65);
    effectiveGain = Math.max(safeGain, Math.min(maxAdaptive, neededForTarget));
  }

  if (effectiveGain === 1 && peak <= SOFT_CLIP_KNEE) {
    return samples;
  }

  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    out[i] = softClipSample(samples[i] * effectiveGain);
  }
  return out;
}

/**
 * Max user audio waiting to be heard, counting samples not yet scheduled and
 * sources already scheduled. 90s covers a long spoken answer that arrives
 * while the context is suspended or while chunks run ahead of the clock.
 * A reply that plays as it streams stays under this. It is not a cap on how
 * long a reply may be when playback keeps up.
 */
export const PLAYBACK_BACKLOG_MAX_SEC = 90;
export const PLAYBACK_BACKLOG_MAX_SAMPLES = PLAYBACK_SAMPLE_RATE * PLAYBACK_BACKLOG_MAX_SEC;

export type PlaybackFaultReason = 'overflow' | 'resume' | 'playback';

export interface PlaybackFault {
  reason: PlaybackFaultReason;
  /** Length of the chunk that was refused whole. No prefix of it was played. */
  droppedSamples: number;
}

export interface PlaybackActivity {
  /** True while samples are waiting or a scheduled source has not ended. */
  speaking: boolean;
}

export interface PlaybackQueueOptions {
  onFault?: (fault: PlaybackFault) => void;
  onActivity?: (activity: PlaybackActivity) => void;
  /** Makeup gain for voice playback (default 2.2x on base64 voice chunks). */
  gain?: number;
  /** Automatic peak normalization for quiet voice chunks (default true). */
  agc?: boolean;
}

export class PlaybackQueue {
  private readonly ctx: AudioContext;
  private readonly onFault?: PlaybackQueueOptions['onFault'];
  private readonly onActivity?: PlaybackQueueOptions['onActivity'];
  private currentGain: number;
  private readonly agcEnabled: boolean;
  private outputNode: AudioNode | null = null;
  private gainNode: GainNode | null = null;
  private nextStartTime = 0;
  private readonly active = new Set<AudioBufferSourceNode>();
  private pending: Float32Array[] = [];
  private pendingSamples = 0;
  private scheduledSamples = 0;
  private readyWait: Promise<void> | null = null;
  private destroyed = false;
  private resumeFailed = false;
  private playbackFailed = false;
  private overflowNotified = false;
  /** Once a chunk is refused, later chunks wait until the accepted audio ends. */
  private holdFurther = false;
  private resumeFaultNotified = false;
  private playbackFaultNotified = false;
  private lastSpeaking = false;

  constructor(ctx: AudioContext, options?: PlaybackQueueOptions) {
    this.ctx = ctx;
    this.onFault = options?.onFault;
    this.onActivity = options?.onActivity;
    this.currentGain = clampPlaybackGain(options?.gain ?? DEFAULT_PLAYBACK_GAIN);
    this.agcEnabled = options?.agc ?? true;
    this.initOutputChain();
  }

  get gain(): number {
    return this.currentGain;
  }

  /** Updates playback makeup gain immediately for upcoming and active chunks. */
  setGain(nextGain: number): void {
    this.currentGain = clampPlaybackGain(nextGain);
    if (this.gainNode && this.gainNode.gain) {
      // Buffer samples are already boosted by DEFAULT_PLAYBACK_GAIN; scale relative to it
      // so live volume changes also affect chunks already scheduled in Web Audio.
      const relative = this.currentGain / DEFAULT_PLAYBACK_GAIN;
      this.gainNode.gain.value = Math.max(0.25, Math.min(2.0, relative));
    }
  }

  private initOutputChain(): void {
    try {
      const maybeCtx = this.ctx as AudioContext & {
        createGain?: () => GainNode;
        createDynamicsCompressor?: () => DynamicsCompressorNode;
      };
      if (typeof maybeCtx.createGain !== 'function') return;
      const gainNode = maybeCtx.createGain();
      if (!gainNode || typeof gainNode.connect !== 'function') return;
      if (gainNode.gain) {
        const relative = this.currentGain / DEFAULT_PLAYBACK_GAIN;
        gainNode.gain.value = Math.max(0.25, Math.min(2.0, relative));
      }
      gainNode.connect(this.ctx.destination);
      this.gainNode = gainNode;
      this.outputNode = gainNode;

      if (typeof maybeCtx.createDynamicsCompressor === 'function') {
        const compressor = maybeCtx.createDynamicsCompressor();
        if (compressor && typeof compressor.connect === 'function') {
          if (compressor.threshold) compressor.threshold.value = -22;
          if (compressor.knee) compressor.knee.value = 12;
          if (compressor.ratio) compressor.ratio.value = 3.5;
          if (compressor.attack) compressor.attack.value = 0.003;
          if (compressor.release) compressor.release.value = 0.15;
          compressor.connect(gainNode);
          this.outputNode = compressor;
        }
      }
    } catch {
      this.outputNode = null;
      this.gainNode = null;
    }
  }

  /** Decode, normalize/boost and schedule one base64 PCM16 chunk right after the current tail. */
  enqueueBase64(data: string): void {
    if (!data || this.destroyed || this.resumeFailed || this.playbackFailed) return;
    const int16 = base64ToPCM16(data);
    const float32 = pcm16ToFloat(int16);
    const boosted = boostVoiceSamples(float32, this.currentGain, this.agcEnabled);
    this.enqueue(boosted);
  }

  enqueue(samples: Float32Array): void {
    if (this.destroyed || this.resumeFailed || this.playbackFailed || samples.length === 0) return;

    // Hold the backlog, including the first chunk, until resume settles so a
    // later chunk cannot start ahead of audio that arrived first.
    if (this.ctx.state !== 'running' || this.readyWait || this.pendingSamples > 0) {
      this.retain(samples);
      if (this.ctx.state !== 'running') {
        this.armResume();
      } else if (!this.readyWait) {
        this.drainPending();
      }
      return;
    }

    if (!this.accepts(samples.length)) {
      this.rejectOverflow(samples.length);
      return;
    }
    if (!this.schedule(samples)) {
      this.retain(samples);
      this.armResume();
    }
  }

  /** Stop and discard every scheduled, active, or not-yet-ready chunk. */
  flush(): void {
    for (const source of this.active) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    this.active.clear();
    this.pending = [];
    this.pendingSamples = 0;
    this.scheduledSamples = 0;
    this.overflowNotified = false;
    this.holdFurther = false;
    this.playbackFailed = false;
    this.playbackFaultNotified = false;
    let now: number;
    try {
      now = this.ctx.currentTime;
    } catch {
      now = 0;
    }
    this.nextStartTime = now;
    this.emitActivity();
  }

  get isPlaying(): boolean {
    return this.active.size > 0;
  }

  /** True while reply audio is still waiting or scheduled to be heard. */
  get isBusy(): boolean {
    return this.pendingSamples > 0 || this.active.size > 0;
  }

  destroy(): void {
    this.destroyed = true;
    this.pending = [];
    this.pendingSamples = 0;
    this.flush();
  }

  private backlogSamples(): number {
    return this.pendingSamples + this.scheduledSamples;
  }

  private accepts(sampleCount: number): boolean {
    if (this.holdFurther) return false;
    return this.backlogSamples() + sampleCount <= PLAYBACK_BACKLOG_MAX_SAMPLES;
  }

  private retain(samples: Float32Array): void {
    if (!this.accepts(samples.length)) {
      this.rejectOverflow(samples.length);
      return;
    }
    const copy = new Float32Array(samples.length);
    copy.set(samples);
    this.pending.push(copy);
    this.pendingSamples += copy.length;
    this.noteAccepted();
    this.emitActivity();
  }

  private rejectOverflow(droppedSamples: number): void {
    if (this.destroyed) return;
    if (this.pendingSamples > 0 || this.active.size > 0) {
      this.holdFurther = true;
    }
    if (this.overflowNotified) return;
    this.overflowNotified = true;
    this.emitFault({ reason: 'overflow', droppedSamples });
  }

  private noteAccepted(): void {
    if (!this.holdFurther) this.overflowNotified = false;
  }

  private emitFault(fault: PlaybackFault): void {
    try {
      this.onFault?.(fault);
    } catch {
      // A listener error must not break the audio graph.
    }
  }

  private emitActivity(): void {
    if (this.destroyed) return;
    const speaking = this.pendingSamples > 0 || this.active.size > 0;
    if (speaking === this.lastSpeaking) return;
    this.lastSpeaking = speaking;
    try {
      this.onActivity?.({ speaking });
    } catch {
      // A listener error must not break the audio graph.
    }
  }

  private armResume(): void {
    if (this.readyWait || this.destroyed || this.resumeFailed || this.playbackFailed) return;
    let ready: Promise<void>;
    try {
      const pending = this.ctx.resume();
      // Attach both handlers so a rejected resume cannot surface as unhandled.
      ready = new Promise((resolve, reject) => {
        Promise.resolve(pending).then(() => resolve(), reject);
      });
    } catch {
      this.failPending();
      return;
    }
    this.readyWait = ready.then(
      () => {
        this.readyWait = null;
        if (this.destroyed) return;
        try {
          if (this.ctx.state !== 'running') {
            this.failPending();
            return;
          }
          this.drainPending();
        } catch {
          this.failPending();
        }
      },
      () => {
        this.readyWait = null;
        this.failPending();
      },
    );
    void this.readyWait.catch(() => {});
  }

  private failPending(): void {
    const dropped = this.pendingSamples;
    this.resumeFailed = true;
    this.pending = [];
    this.pendingSamples = 0;
    if (!this.destroyed && !this.resumeFaultNotified) {
      this.resumeFaultNotified = true;
      this.emitFault({ reason: 'resume', droppedSamples: dropped });
    }
    this.emitActivity();
  }

  private failPlayback(droppedSamples: number): void {
    this.playbackFailed = true;
    if (!this.destroyed && !this.playbackFaultNotified) {
      this.playbackFaultNotified = true;
      this.emitFault({ reason: 'playback', droppedSamples });
    }
    this.emitActivity();
  }

  private drainPending(): void {
    const chunks = this.pending;
    this.pending = [];
    this.pendingSamples = 0;
    for (let i = 0; i < chunks.length; i += 1) {
      if (this.destroyed || this.resumeFailed || this.playbackFailed) return;
      if (!this.schedule(chunks[i])) {
        const rest = chunks.slice(i);
        this.pending = rest;
        this.pendingSamples = rest.reduce((sum, chunk) => sum + chunk.length, 0);
        this.armResume();
        this.emitActivity();
        return;
      }
    }
    this.emitActivity();
  }

  /** @returns false when the context is not running and the caller still owns the samples. */
  private schedule(samples: Float32Array): boolean {
    if (this.destroyed || this.resumeFailed || this.playbackFailed || samples.length === 0) return true;
    if (this.ctx.state !== 'running') return false;

    let source: AudioBufferSourceNode;
    try {
      const buffer = this.ctx.createBuffer(1, samples.length, PLAYBACK_SAMPLE_RATE);
      buffer.getChannelData(0).set(samples);
      source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.outputNode ?? this.ctx.destination);
    } catch {
      this.failPlayback(samples.length);
      return true;
    }

    const startAt = Math.max(this.nextStartTime, this.ctx.currentTime + PLAYBACK_PREBUFFER_SEC);
    const duration = samples.length / PLAYBACK_SAMPLE_RATE;
    source.onended = () => {
      this.active.delete(source);
      this.scheduledSamples = Math.max(0, this.scheduledSamples - samples.length);
      if (this.pendingSamples === 0 && this.active.size === 0) {
        this.holdFurther = false;
        this.overflowNotified = false;
      }
      this.emitActivity();
    };
    this.active.add(source);
    try {
      source.start(startAt);
    } catch {
      this.active.delete(source);
      source.onended = null;
      this.failPlayback(samples.length);
      return true;
    }
    this.scheduledSamples += samples.length;
    this.nextStartTime = startAt + duration;
    this.noteAccepted();
    this.emitActivity();
    return true;
  }
}
