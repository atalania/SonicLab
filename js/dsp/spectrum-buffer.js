export class SpectrumBuffer {
  constructor(maxFrames, binCount) {
    this.maxFrames = maxFrames;
    this.binCount = binCount;
    this.frames = [];
    this.energies = [];
  }

  push(linearMags, energy) {
    if (this.frames.length >= this.maxFrames) {
      this.frames.shift();
      this.energies.shift();
    }
    this.frames.push(new Float32Array(linearMags));
    this.energies.push(energy);
  }

  getSpeechAverage(topN = 20) {
    if (this.frames.length === 0) return null;
    const indexed = this.energies.map((e, i) => ({ e, i }));
    indexed.sort((a, b) => b.e - a.e);
    const pick = indexed.slice(0, Math.min(topN, indexed.length));
    const avg = new Float32Array(this.binCount);
    for (const { i } of pick) {
      for (let k = 0; k < this.binCount; k++) avg[k] += this.frames[i][k];
    }
    for (let k = 0; k < this.binCount; k++) avg[k] /= pick.length;
    return avg;
  }

  clear() { this.frames = []; this.energies = []; }
}
