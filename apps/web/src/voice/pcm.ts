// PCM16 mono encode/decode helpers for the AssemblyAI Voice Agent protocol.
// Wire format is base64-encoded, little-endian, signed 16-bit PCM (24kHz).

function clampSample(x: number): number {
  if (x > 1) return 1;
  if (x < -1) return -1;
  return x;
}

/** Convert Float32 [-1, 1] audio to Int16 PCM, clamping out-of-range input. */
export function floatToPCM16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = clampSample(input[i]);
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

/** Convert Int16 PCM back to Float32 [-1, 1] for playback buffers. */
export function pcm16ToFloat(input: Int16Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = input[i];
    out[i] = s < 0 ? s / 0x8000 : s / 0x7fff;
  }
  return out;
}

/** Encode Int16 PCM as a little-endian base64 string. */
export function pcm16ToBase64(input: Int16Array): string {
  const bytes = new Uint8Array(input.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < input.length; i++) {
    view.setInt16(i * 2, input[i], true);
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Decode a little-endian base64 PCM16 string into an Int16Array. */
export function base64ToPCM16(b64: string): Int16Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const out = new Int16Array(bytes.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true);
  return out;
}
