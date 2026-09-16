const BINS = 64;

export function spectrumFromAnalyser(analyser: AnalyserNode, scratch: Uint8Array): Float32Array {
  analyser.getByteFrequencyData(scratch as Uint8Array<ArrayBuffer>);
  const out = new Float32Array(BINS);
  const step = Math.max(1, Math.floor(scratch.length / BINS));
  for (let i = 0; i < BINS; i++) {
    let sum = 0;
    for (let j = 0; j < step; j++) sum += scratch[i * step + j] ?? 0;
    out[i] = sum / step / 255;
  }
  return out;
}

export function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

export function rmsFromAnalyser(analyser: AnalyserNode, scratch: Uint8Array): number {
  analyser.getByteTimeDomainData(scratch as Uint8Array<ArrayBuffer>);
  let sum = 0;
  for (let i = 0; i < scratch.length; i++) {
    const v = (scratch[i]! - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / scratch.length);
}
