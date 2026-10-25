import { describe, it, expect, vi } from 'vitest';
import { floatToPCM16, pcm16ToFloat, pcm16ToBase64, base64ToPCM16 } from '../voice/pcm';
import { ContinuousResampler } from '../voice/resampler';
import { PlaybackQueue } from '../voice/playback';

describe('Voice Audio Processing (PCM16, Resampler, Playback)', () => {
  it('encodes and decodes Float32 to PCM16 base64 accurately', () => {
    const input = new Float32Array([0, 0.5, -0.5, 1.0, -1.0]);
    const pcm = floatToPCM16(input);
    expect(pcm[0]).toBe(0);
    expect(pcm[3]).toBe(0x7fff); // max int16
    expect(pcm[4]).toBe(-0x8000); // min int16

    const b64 = pcm16ToBase64(pcm);
    expect(typeof b64).toBe('string');
    expect(b64.length).toBeGreaterThan(0);

    const decoded = base64ToPCM16(b64);
    expect(decoded.length).toBe(input.length);
    expect(decoded[0]).toBe(0);
    expect(decoded[3]).toBe(0x7fff);

    const backToFloat = pcm16ToFloat(decoded);
    expect(backToFloat[0]).toBeCloseTo(0, 4);
    expect(backToFloat[3]).toBeCloseTo(1.0, 3);
    expect(backToFloat[4]).toBeCloseTo(-1.0, 3);
  });

  it('clamps out-of-range float samples to prevent integer overflow', () => {
    const outOfBounds = new Float32Array([1.5, -2.0]);
    const pcm = floatToPCM16(outOfBounds);
    expect(pcm[0]).toBe(0x7fff);
    expect(pcm[1]).toBe(-0x8000);
  });

  it('resamples streaming chunks linearly with continuous state', () => {
    // 48000Hz -> 24000Hz (downsampling 2:1)
    const resampler = new ContinuousResampler(48000, 24000);
    expect(resampler.ratio).toBe(2);

    const chunk1 = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const out1 = resampler.process(chunk1);
    expect(out1.length).toBe(2);

    const chunk2 = new Float32Array([0.5, 0.6, 0.7, 0.8]);
    const out2 = resampler.process(chunk2);
    expect(out2.length).toBe(2);
  });

  it('PlaybackQueue schedules audio and flushes immediately on barge-in', () => {
    const stoppedSources: any[] = [];
    const mockSource = {
      buffer: null as any,
      onended: null as any,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(() => stoppedSources.push(true)),
    };

    const mockCtx = {
      currentTime: 10,
      state: 'running',
      destination: {},
      createBuffer: vi.fn(() => ({
        getChannelData: vi.fn(() => new Float32Array(240)),
      })),
      createBufferSource: vi.fn(() => mockSource),
      resume: vi.fn(async () => {}),
    } as unknown as AudioContext;

    const queue = new PlaybackQueue(mockCtx);
    const pcm = new Int16Array([100, 200, 300]);
    const b64 = pcm16ToBase64(pcm);

    queue.enqueueBase64(b64);
    expect(mockSource.start).toHaveBeenCalled();
    expect(queue.isPlaying).toBe(true);

    // Trigger barge-in flush
    queue.flush();
    expect(mockSource.stop).toHaveBeenCalled();
    expect(queue.isPlaying).toBe(false);
  });
});
