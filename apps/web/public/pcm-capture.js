// AudioWorkletProcessor: captures mono microphone samples at the device's
// native sample rate and forwards them to the main thread in batches.
// Resampling to 24kHz happens on the main thread via ContinuousResampler.

class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const batchSize = options?.processorOptions?.batchSize ?? 2048;
    this.batchSize = batchSize;
    this.buffer = new Float32Array(batchSize);
    this.writeIndex = 0;
    this.stopped = false;
    this.port.onmessage = (ev) => {
      if (ev.data === 'stop') this.stopped = true;
    };
  }

  process(inputs) {
    if (this.stopped) return false;
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.writeIndex++] = channel[i];
      if (this.writeIndex >= this.batchSize) {
        this.flush();
      }
    }
    return true;
  }

  flush() {
    if (this.writeIndex === 0) return;
    const chunk = this.buffer.slice(0, this.writeIndex);
    this.port.postMessage({ type: 'pcm-chunk', samples: chunk }, [chunk.buffer]);
    this.buffer = new Float32Array(this.batchSize);
    this.writeIndex = 0;
  }
}

registerProcessor('pcm-capture', PCMCaptureProcessor);
