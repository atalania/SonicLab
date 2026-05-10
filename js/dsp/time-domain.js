export function computeZCR(timeData) {
  let c = 0;
  for (let i = 1; i < timeData.length; i++) {
    if ((timeData[i] >= 0) !== (timeData[i - 1] >= 0)) c++;
  }
  return c / (timeData.length - 1);
}

export function computeRMSdB(timeData) {
  let s = 0;
  for (let i = 0; i < timeData.length; i++) s += timeData[i] * timeData[i];
  const rms = Math.sqrt(s / timeData.length);
  return rms > 0 ? 20 * Math.log10(rms) : -100;
}
