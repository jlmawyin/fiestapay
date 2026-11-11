import { describe, it, expect, vi } from 'vitest';
import { floatToPCM16, pcm16ToFloat, pcm16ToBase64, base64ToPCM16 } from '../voice/pcm';
import { ContinuousResampler } from '../voice/resampler';
import {
  DEFAULT_PLAYBACK_GAIN,
  SOFT_CLIP_CEILING,
  PlaybackQueue,
  boostVoiceSamples,
  softClipSample,
} from '../voice/playback';

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

  it('boosts quiet Gemini Live voice chunks and soft-limits peaks without clipping', () => {
    // Quiet speech chunk (~0.18 peak, -15 dBFS)
    const quiet = new Float32Array([0.05, -0.12, 0.18, -0.15]);
    const boosted = boostVoiceSamples(quiet, DEFAULT_PLAYBACK_GAIN, true);
    const boostedPeak = Math.max(...Array.from(boosted, Math.abs));
    expect(boostedPeak).toBeGreaterThan(0.5);
    expect(boostedPeak).toBeLessThanOrEqual(SOFT_CLIP_CEILING);

    // Near-silent noise floor (< 0.008) is not over-amplified by AGC
    const silence = new Float32Array([0.001, -0.002, 0.0005]);
    const boostedSilence = boostVoiceSamples(silence, DEFAULT_PLAYBACK_GAIN, true);
    expect(Math.abs(boostedSilence[1])).toBeCloseTo(0.002 * DEFAULT_PLAYBACK_GAIN, 4);

    // High-amplitude peaks are smoothly limited below 1.0
    const loud = new Float32Array([0.9, -0.95]);
    const limited = boostVoiceSamples(loud, 3.2, true);
    expect(limited[0]).toBeGreaterThan(0.8);
    expect(limited[0]).toBeLessThanOrEqual(Math.fround(SOFT_CLIP_CEILING));
    expect(limited[1]).toBeLessThan(-0.8);
    expect(limited[1]).toBeGreaterThanOrEqual(-Math.fround(SOFT_CLIP_CEILING));
    expect(softClipSample(5)).toBeLessThanOrEqual(SOFT_CLIP_CEILING);
  });

  it('updates live GainNode and compressor chain when setGain is called', () => {
    const gainNode = {
      gain: { value: 1 },
      connect: vi.fn(),
    };
    const compressorNode = {
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 0 },
      attack: { value: 0 },
      release: { value: 0 },
      connect: vi.fn(),
    };
    const mockCtx = {
      currentTime: 0,
      state: 'running',
      destination: {},
      createGain: vi.fn(() => gainNode),
      createDynamicsCompressor: vi.fn(() => compressorNode),
      createBuffer: vi.fn(() => ({
        getChannelData: vi.fn(() => new Float32Array(10)),
      })),
      createBufferSource: vi.fn(() => ({
        buffer: null,
        onended: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
      resume: vi.fn(async () => {}),
    } as unknown as AudioContext;

    const queue = new PlaybackQueue(mockCtx, { gain: DEFAULT_PLAYBACK_GAIN });
    expect(compressorNode.connect).toHaveBeenCalledWith(gainNode);
    expect(gainNode.connect).toHaveBeenCalledWith(mockCtx.destination);
    expect(gainNode.gain.value).toBeCloseTo(1, 3);

    queue.setGain(3.2);
    expect(queue.gain).toBeCloseTo(3.2, 3);
    expect(gainNode.gain.value).toBeCloseTo(3.2 / DEFAULT_PLAYBACK_GAIN, 3);
  });
});
