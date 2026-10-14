// Schedules PCM16 24kHz agent audio for playback and tracks active sources
// so barge-in can silence in-flight audio immediately.

import { pcm16ToFloat, base64ToPCM16 } from './pcm';

export const PLAYBACK_SAMPLE_RATE = 24000;

export class PlaybackQueue {
  private readonly ctx: AudioContext;
  private nextStartTime = 0;
  private readonly active = new Set<AudioBufferSourceNode>();

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  /** Decode and schedule one base64 PCM16 chunk right after the current tail. */
  enqueueBase64(data: string): void {
    if (!data) return;
    const int16 = base64ToPCM16(data);
    const float32 = pcm16ToFloat(int16);
    this.enqueue(float32);
  }

  enqueue(samples: Float32Array): void {
    if (samples.length === 0) return;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }

    const buffer = this.ctx.createBuffer(1, samples.length, PLAYBACK_SAMPLE_RATE);
    buffer.getChannelData(0).set(samples);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);

    const startAt = Math.max(this.nextStartTime, this.ctx.currentTime);
    source.onended = () => {
      this.active.delete(source);
    };
    this.active.add(source);
    source.start(startAt);
    this.nextStartTime = startAt + samples.length / PLAYBACK_SAMPLE_RATE;
  }

  /** Stop and discard every scheduled/active source immediately (barge-in, stop). */
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
    this.nextStartTime = this.ctx.currentTime;
  }

  get isPlaying(): boolean {
    return this.active.size > 0;
  }

  destroy(): void {
    this.flush();
  }
}
