import {
  computeSpectralCentroid,
  computeSpectralBandwidth,
  computeSpectralRolloff,
  computeSpectralFlatness,
} from './spectral.js';
import { computeZCR, computeRMSdB } from './time-domain.js';
import { findDominantFrequencies, estimateFormants } from './peaks-formants.js';
import { computeBandEnergies } from './bands.js';
import { detectPitchAutocorrelation } from './pitch.js';

export function computeAllFeatures(magnitudes, timeData, sampleRate, fftSize) {
  const centroid = computeSpectralCentroid(magnitudes, sampleRate, fftSize);
  const pitch = detectPitchAutocorrelation(timeData, sampleRate);
  return {
    pitchHz: pitch.pitchHz,
    pitchClarity: pitch.clarity,
    spectralCentroid: Math.round(centroid * 10) / 10,
    spectralBandwidth: Math.round(computeSpectralBandwidth(magnitudes, centroid, sampleRate, fftSize) * 10) / 10,
    spectralRolloff: Math.round(computeSpectralRolloff(magnitudes, sampleRate, fftSize) * 10) / 10,
    spectralFlatness: Math.round(computeSpectralFlatness(magnitudes) * 1000) / 1000,
    rmsDb: Math.round(computeRMSdB(timeData) * 10) / 10,
    zcr: Math.round(computeZCR(timeData) * 10000) / 10000,
    dominantFreqs: findDominantFrequencies(magnitudes, sampleRate, fftSize),
    formants: estimateFormants(magnitudes, sampleRate, fftSize),
    bandEnergies: computeBandEnergies(magnitudes, sampleRate, fftSize)
  };
}
