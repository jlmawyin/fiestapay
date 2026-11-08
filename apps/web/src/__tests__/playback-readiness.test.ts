import { describe, expect, it, vi } from 'vitest';
import {
  PLAYBACK_BACKLOG_MAX_SAMPLES,
  PLAYBACK_BACKLOG_MAX_SEC,
  PLAYBACK_PREBUFFER_SEC,
  PLAYBACK_SAMPLE_RATE,
  PlaybackQueue,
  type PlaybackFault,
} from '../voice/playback';

type FakeSource = {
  buffer: unknown;
  onended: (() => void) | null;
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createFake(options?: {
  state?: AudioContextState;
  currentTime?: number;
  resume?: () => Promise<void> | void;
}) {
  const gate = deferred<void>();
  const sources: FakeSource[] = [];
  const channels: Float32Array[] = [];
  const raw = {
    state: options?.state ?? 'suspended',
    currentTime: options?.currentTime ?? 0,
    destination: {},
    sampleRate: 48000,
    resume: vi.fn(options?.resume ?? (() => gate.promise)),
    createBuffer: vi.fn((_channelCount: number, length: number) => {
      const data = new Float32Array(length);
      channels.push(data);
      return {
        getChannelData: (index: number) => {
          if (index !== 0) throw new Error('expected mono audio');
          return data;
        },
      };
    }),
    createBufferSource: vi.fn(() => {
      const source: FakeSource = {
        buffer: null,
        onended: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      sources.push(source);
      return source;
    }),
  };
  return { ctx: raw as unknown as AudioContext, raw, sources, channels, gate };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('PlaybackQueue readiness', () => {
  it('retains the first chunk while resume is deferred', async () => {
    const fake = createFake({ currentTime: 3 });
    const queue = new PlaybackQueue(fake.ctx);
    const first = new Float32Array([0.25, -0.5, 0.75, 0.125]);

    queue.enqueue(first);
    first[0] = 9;

    expect(fake.raw.resume).toHaveBeenCalledOnce();
    expect(fake.raw.createBuffer).not.toHaveBeenCalled();
    expect(queue.isPlaying).toBe(false);

    fake.raw.state = 'running';
    fake.gate.resolve();
    await fake.gate.promise;
    await flushMicrotasks();

    expect(fake.channels).toHaveLength(1);
    expect(fake.channels[0]).toEqual(new Float32Array([0.25, -0.5, 0.75, 0.125]));
    expect(fake.sources[0].start).toHaveBeenCalledWith(3 + PLAYBACK_PREBUFFER_SEC);
    expect(queue.isPlaying).toBe(true);
  });

  it('starts queued chunks immediately when running, without overlap', () => {
    expect(PLAYBACK_PREBUFFER_SEC).toBeCloseTo(0.1, 5);
    const fake = createFake({ state: 'running', currentTime: 10 });
    const queue = new PlaybackQueue(fake.ctx);
    const lengths = [2400, 4800, 1200];

    for (const length of lengths) {
      queue.enqueue(new Float32Array(length));
    }

    expect(fake.raw.resume).not.toHaveBeenCalled();
    expect(fake.sources).toHaveLength(lengths.length);

    let expected = 10 + PLAYBACK_PREBUFFER_SEC;
    for (let i = 0; i < lengths.length; i += 1) {
      const startAt = fake.sources[i].start.mock.calls[0][0] as number;
      expect(startAt).toBeCloseTo(expected, 5);
      if (i > 0) {
        const previous = fake.sources[i - 1].start.mock.calls[0][0] as number;
        expect(startAt).toBeGreaterThanOrEqual(previous + lengths[i - 1] / PLAYBACK_SAMPLE_RATE);
      }
      expected += lengths[i] / PLAYBACK_SAMPLE_RATE;
    }

    queue.flush();
    for (const source of fake.sources) {
      expect(source.stop).toHaveBeenCalledOnce();
    }
    expect(queue.isPlaying).toBe(false);
    expect(queue.isBusy).toBe(false);
  });

  it('does not play when destroyed before resume resolves', async () => {
    const fake = createFake({ currentTime: 1 });
    const queue = new PlaybackQueue(fake.ctx);

    queue.enqueue(new Float32Array([0.2, 0.4, 0.6]));
    expect(fake.raw.resume).toHaveBeenCalledOnce();
    queue.destroy();

    fake.raw.state = 'running';
    fake.gate.resolve();
    await fake.gate.promise;
    await flushMicrotasks();

    expect(fake.raw.createBuffer).not.toHaveBeenCalled();
    expect(fake.sources).toHaveLength(0);
    expect(queue.isPlaying).toBe(false);

    queue.enqueue(new Float32Array([0.1]));
    expect(fake.sources).toHaveLength(0);
  });

  it('does not play when resume fails or never reaches running', async () => {
    const rejectedFaults: PlaybackFault[] = [];
    const rejected = createFake();
    const rejectedQueue = new PlaybackQueue(rejected.ctx, {
      onFault: (fault) => rejectedFaults.push(fault),
    });
    rejectedQueue.enqueue(new Float32Array([0.2]));
    rejected.gate.reject(new Error('resume failed'));
    await rejected.gate.promise.catch(() => undefined);
    await flushMicrotasks();

    expect(rejected.sources).toHaveLength(0);
    expect(rejectedQueue.isPlaying).toBe(false);
    expect(rejectedQueue.isBusy).toBe(false);
    expect(rejectedFaults).toEqual([{ reason: 'resume', droppedSamples: 1 }]);
    rejectedQueue.enqueue(new Float32Array([0.3, 0.4]));
    expect(rejected.raw.resume).toHaveBeenCalledOnce();
    expect(rejected.sources).toHaveLength(0);
    expect(rejectedFaults).toHaveLength(1);

    const stuckFaults: PlaybackFault[] = [];
    const stuck = createFake();
    const stuckQueue = new PlaybackQueue(stuck.ctx, {
      onFault: (fault) => stuckFaults.push(fault),
    });
    stuckQueue.enqueue(new Float32Array([0.4, 0.5]));
    stuck.gate.resolve();
    await stuck.gate.promise;
    await flushMicrotasks();

    expect(stuck.raw.state).toBe('suspended');
    expect(stuck.sources).toHaveLength(0);
    expect(stuckFaults).toEqual([{ reason: 'resume', droppedSamples: 2 }]);
    stuck.raw.state = 'running';
    stuckQueue.enqueue(new Float32Array([0.5]));
    expect(stuck.sources).toHaveLength(0);
    expect(stuck.raw.resume).toHaveBeenCalledOnce();
    expect(stuckFaults).toHaveLength(1);

    const threwFaults: PlaybackFault[] = [];
    const threw = createFake({
      resume: () => {
        throw new Error('resume threw');
      },
    });
    const threwQueue = new PlaybackQueue(threw.ctx, {
      onFault: (fault) => threwFaults.push(fault),
    });
    threwQueue.enqueue(new Float32Array([0.6, 0.7, 0.8]));
    expect(threw.sources).toHaveLength(0);
    expect(threwQueue.isPlaying).toBe(false);
    expect(threwFaults).toEqual([{ reason: 'resume', droppedSamples: 3 }]);
    threwQueue.enqueue(new Float32Array([0.1]));
    expect(threwFaults).toHaveLength(1);
  });

  it('reports playback failure once and does not schedule a later chunk as if it played', () => {
    const faults: PlaybackFault[] = [];
    const fake = createFake({ state: 'running', currentTime: 1 });
    fake.raw.createBufferSource = vi.fn(() => {
      const source: FakeSource = {
        buffer: null,
        onended: null,
        connect: vi.fn(),
        start: vi.fn(() => {
          throw new Error('start failed');
        }),
        stop: vi.fn(),
      };
      fake.sources.push(source);
      return source;
    });
    const queue = new PlaybackQueue(fake.ctx, { onFault: (fault) => faults.push(fault) });
    const spoken = new Float32Array([0.2, 0.4, 0.6]);

    queue.enqueue(spoken);
    queue.enqueue(new Float32Array([0.8, 0.9]));

    expect(faults).toEqual([{ reason: 'playback', droppedSamples: spoken.length }]);
    expect(queue.isPlaying).toBe(false);
    expect(queue.isBusy).toBe(false);
    expect(fake.sources[0].start).toHaveBeenCalledOnce();
    expect(fake.sources).toHaveLength(1);
    expect(fake.channels.some((channel) => channel[0] === 0.8)).toBe(false);
  });

  it('keeps complete earlier audio and reports one overflow instead of trimming the tail', async () => {
    const fake = createFake({ currentTime: 4 });
    const faults: PlaybackFault[] = [];
    const queue = new PlaybackQueue(fake.ctx, { onFault: (fault) => faults.push(fault) });
    const head = new Float32Array(32);
    head[0] = 0.5;
    head[31] = -0.25;
    const overflow = new Float32Array(PLAYBACK_BACKLOG_MAX_SAMPLES);
    overflow[0] = 0.125;
    overflow[overflow.length - 1] = 0.9;

    queue.enqueue(head);
    head[0] = 9;
    queue.enqueue(overflow);
    queue.enqueue(new Float32Array([0.77, 0.66]));
    expect(fake.sources).toHaveLength(0);
    expect(faults).toEqual([{ reason: 'overflow', droppedSamples: overflow.length }]);

    fake.raw.state = 'running';
    fake.gate.resolve();
    await fake.gate.promise;
    await flushMicrotasks();

    expect(fake.channels).toHaveLength(1);
    expect(fake.channels[0]).toEqual(head.slice().fill(0.5, 0, 1));
    expect(fake.channels[0][0]).toBeCloseTo(0.5);
    expect(fake.channels[0][31]).toBeCloseTo(-0.25);
    expect(fake.channels[0]).toHaveLength(head.length);
    expect(fake.channels.some((channel) => channel[0] === 0.125 || channel.includes?.(0.9))).toBe(false);
    expect(fake.sources[0].start).toHaveBeenCalledWith(4 + PLAYBACK_PREBUFFER_SEC);
    expect(faults).toHaveLength(1);

    fake.sources[0].onended?.();
    queue.enqueue(new Float32Array([0.33]));
    expect(fake.sources).toHaveLength(2);
    expect(fake.channels[1][0]).toBeCloseTo(0.33);
  });

  it('plays a long ordinary reply in full, then signals when the backlog has drained', async () => {
    expect(PLAYBACK_BACKLOG_MAX_SEC).toBeGreaterThanOrEqual(60);
    expect(PLAYBACK_BACKLOG_MAX_SEC).toBeLessThanOrEqual(180);

    const seconds = 20;
    const length = PLAYBACK_SAMPLE_RATE * seconds;
    const reply = new Float32Array(length);
    reply[0] = 0.31;
    reply[length - 1] = -0.42;
    const follow = new Float32Array(PLAYBACK_SAMPLE_RATE);
    follow[0] = 0.15;
    follow[follow.length - 1] = -0.15;

    const fake = createFake({ currentTime: 5 });
    const faults: PlaybackFault[] = [];
    const activity: boolean[] = [];
    const queue = new PlaybackQueue(fake.ctx, {
      onFault: (fault) => faults.push(fault),
      onActivity: ({ speaking }) => activity.push(speaking),
    });

    queue.enqueue(reply);
    reply[0] = 99;

    expect(faults).toHaveLength(0);
    expect(queue.isPlaying).toBe(false);
    expect(queue.isBusy).toBe(true);
    expect(activity).toEqual([true]);
    expect(fake.raw.createBuffer).not.toHaveBeenCalled();

    fake.raw.state = 'running';
    fake.gate.resolve();
    await fake.gate.promise;
    await flushMicrotasks();

    queue.enqueue(follow);

    expect(faults).toHaveLength(0);
    expect(fake.channels).toHaveLength(2);
    expect(fake.channels[0]).toHaveLength(length);
    expect(fake.channels[0][0]).toBeCloseTo(0.31);
    expect(fake.channels[0][length - 1]).toBeCloseTo(-0.42);
    expect(fake.channels[1]).toHaveLength(follow.length);
    expect(fake.channels[1][0]).toBeCloseTo(0.15);
    expect(fake.channels[1][follow.length - 1]).toBeCloseTo(-0.15);

    const firstStart = fake.sources[0].start.mock.calls[0][0] as number;
    const secondStart = fake.sources[1].start.mock.calls[0][0] as number;
    expect(firstStart).toBeCloseTo(5 + PLAYBACK_PREBUFFER_SEC, 5);
    expect(secondStart).toBeCloseTo(firstStart + seconds, 5);
    expect(secondStart).toBeGreaterThanOrEqual(firstStart + length / PLAYBACK_SAMPLE_RATE);
    expect(activity).toEqual([true]);

    fake.sources[0].onended?.();
    expect(queue.isBusy).toBe(true);
    expect(activity).toEqual([true]);
    fake.sources[1].onended?.();
    expect(queue.isPlaying).toBe(false);
    expect(queue.isBusy).toBe(false);
    expect(activity).toEqual([true, false]);
  });

  it('bounds audio already scheduled while running and refuses the rest once', () => {
    const fake = createFake({ state: 'running', currentTime: 2 });
    const faults: PlaybackFault[] = [];
    const queue = new PlaybackQueue(fake.ctx, { onFault: (fault) => faults.push(fault) });
    const room = 4;
    const head = new Float32Array(PLAYBACK_BACKLOG_MAX_SAMPLES - room);
    head[0] = 0.21;
    head[head.length - 1] = 0.34;
    const overflow = new Float32Array(room + 1);
    overflow[0] = 0.77;
    overflow[overflow.length - 1] = 0.88;

    queue.enqueue(head);
    queue.enqueue(overflow);
    queue.enqueue(new Float32Array([0.63, 0.64]));

    expect(PLAYBACK_BACKLOG_MAX_SEC).toBeGreaterThan(8);
    expect(faults).toEqual([{ reason: 'overflow', droppedSamples: overflow.length }]);
    expect(fake.sources).toHaveLength(1);
    expect(fake.channels).toHaveLength(1);
    expect(fake.channels[0]).toHaveLength(head.length);
    expect(fake.channels[0][0]).toBeCloseTo(0.21);
    expect(fake.channels[0][head.length - 1]).toBeCloseTo(0.34);
    expect(fake.channels[0][head.length - 1]).not.toBeCloseTo(0.77);
    expect(queue.isPlaying).toBe(true);

    const oversized = new Float32Array(PLAYBACK_BACKLOG_MAX_SAMPLES + 1);
    oversized[0] = 0.51;
    queue.enqueue(oversized);
    expect(faults).toHaveLength(1);
    expect(fake.sources).toHaveLength(1);

    fake.sources[0].onended?.();
    expect(queue.isBusy).toBe(false);
    const again = new Float32Array([0.44]);
    queue.enqueue(again);
    expect(fake.sources).toHaveLength(2);
    expect(fake.channels[1][0]).toBeCloseTo(0.44);

    queue.enqueue(oversized);
    expect(faults).toHaveLength(2);
    expect(faults[1]).toEqual({ reason: 'overflow', droppedSamples: oversized.length });
    expect(fake.sources).toHaveLength(2);
    expect(fake.channels.every((channel) => channel[0] !== 0.51)).toBe(true);
  });
});
