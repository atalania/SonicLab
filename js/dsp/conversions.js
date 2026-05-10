export function dbToLinear(dB) {
  return Math.pow(10, Math.max(dB, -100) / 20);
}
