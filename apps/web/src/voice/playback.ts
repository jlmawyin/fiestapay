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
}

export class PlaybackQueue {
  private readonly ctx: AudioContext;
  private readonly onFault?: PlaybackQueueOptions['onFault'];
  private readonly onActivity?: PlaybackQueueOptions['onActivity'];
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
  }

  /** Decode and schedule one base64 PCM16 chunk right after the current tail. */
  enqueueBase64(data: string): void {
    if (!data || this.destroyed || this.resumeFailed || this.playbackFailed) return;
    const int16 = base64ToPCM16(data);
    const float32 = pcm16ToFloat(int16);
    this.enqueue(float32);
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
      source.connect(this.ctx.destination);
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
