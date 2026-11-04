// Continuous linear-interpolation resampler for streaming microphone audio.
// State persists across process() calls so chunk boundaries do not introduce
// clicks or dropped samples.

export class ContinuousResampler {
  private readonly inputRate: number;
  private readonly outputRate: number;
  private position = 0; // fractional index into virtual stream in input-sample units
  private prevSample = 0;
  private havePrev = false;

  constructor(inputRate: number, outputRate = 24000) {
    if (inputRate <= 0 || outputRate <= 0) {
      throw new Error('sample rates must be positive');
    }
    this.inputRate = inputRate;
    this.outputRate = outputRate;
  }

  get ratio(): number {
    return this.inputRate / this.outputRate;
  }

  process(input: Float32Array): Float32Array {
    if (this.inputRate === this.outputRate) {
      this.havePrev = input.length > 0;
      if (this.havePrev) this.prevSample = input[input.length - 1];
      return input.slice();
    }

    const ratio = this.ratio;
    const out: number[] = [];
    let pos = this.position;

    while (true) {
      const idx0 = Math.floor(pos);
      const idx1 = idx0 + 1;
      if (idx1 >= input.length) break;

      const frac = pos - idx0;
      const s0 = idx0 < 0 ? this.prevSample : input[idx0];
      const s1 = input[idx1];
      out.push(s0 + (s1 - s0) * frac);
      pos += ratio;
    }

    this.position = pos - input.length;
    if (input.length > 0) {
      this.prevSample = input[input.length - 1];
      this.havePrev = true;
    }

    return Float32Array.from(out);
  }

  reset(): void {
    this.position = 0;
    this.prevSample = 0;
    this.havePrev = false;
  }
}
