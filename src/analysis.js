/**
 * ANALYSIS — FFT bytes → MusicFrame
 *
 * Pure functions that take the raw frequency data and produce
 * meaningful musical features: bands, RMS, onset, beat phase,
 * spectral centroid, flux, flatness.
 */

// ============================================================
// Band definitions (at 44.1kHz sample rate, fftSize 2048):
// bin 0-5: sub-bass + bass (0-215 Hz)
// bin 5-12: low-mid (215-517 Hz)
// bin 12-40: mid (517-1720 Hz)
// bin 40-100: high-mid (1720-4300 Hz)
// bin 100-400: treble/air (4300-17200 Hz)
// ============================================================

const BAND_RANGES = {
  subBass: [0, 4],    // 0-85 Hz — true low end (kick fundamentals, sub drops)
  bass: [0, 6],
  lowMid: [6, 14],
  mid: [14, 45],
  highMid: [45, 110],
  air: [110, 400]
};

function bandEnergy(freqData, [start, end]) {
  let sum = 0;
  const n = Math.min(end, freqData.length) - start;
  if (n <= 0) return 0;
  for (let i = start; i < start + n; i++) sum += freqData[i];
  return (sum / n) / 255; // 0..1
}

// ============================================================
// Log-binned spectrum — 64 bins for the visual texture
// ============================================================
const SPEC_BINS = 64;
function logSpectrum(freqData, out) {
  const n = freqData.length;
  for (let i = 0; i < SPEC_BINS; i++) {
    // Logarithmic mapping — each output bin spans more input bins at high freq
    const lo = Math.floor(Math.pow(i / SPEC_BINS, 2.2) * n);
    const hi = Math.floor(Math.pow((i + 1) / SPEC_BINS, 2.2) * n);
    let sum = 0, count = 0;
    for (let j = lo; j <= hi && j < n; j++) { sum += freqData[j]; count++; }
    out[i] = count > 0 ? (sum / count) / 255 : 0;
  }
}

// ============================================================
// RMS (overall loudness)
// ============================================================
function computeRMS(freqData) {
  let sum = 0;
  for (let i = 0; i < freqData.length; i++) {
    const v = freqData[i] / 255;
    sum += v * v;
  }
  return Math.sqrt(sum / freqData.length);
}

// ============================================================
// Spectral centroid — brightness of sound (0 = dark, 1 = bright)
// ============================================================
function computeCentroid(freqData) {
  let weighted = 0, total = 0;
  for (let i = 0; i < freqData.length; i++) {
    const v = freqData[i];
    weighted += v * i;
    total += v;
  }
  if (total === 0) return 0;
  return (weighted / total) / freqData.length;
}

// ============================================================
// Spectral flatness — 0 = tonal, 1 = noisy
// ============================================================
function computeFlatness(freqData) {
  let logSum = 0, linSum = 0, n = 0;
  for (let i = 1; i < freqData.length; i++) {
    const v = freqData[i] / 255 + 0.0001;
    logSum += Math.log(v);
    linSum += v;
    n++;
  }
  if (n === 0 || linSum === 0) return 0;
  const geomMean = Math.exp(logSum / n);
  const arithMean = linSum / n;
  return geomMean / arithMean;
}

// ============================================================
// Spectral flux — total change between frames
// ============================================================
function computeFlux(freqData, prevFreqData) {
  let flux = 0;
  for (let i = 0; i < freqData.length; i++) {
    const d = (freqData[i] - prevFreqData[i]) / 255;
    if (d > 0) flux += d;
  }
  return Math.min(1, flux / Math.sqrt(freqData.length));
}

// ============================================================
// Onset detection — bass energy vs running history
// ============================================================
class OnsetDetector {
  constructor() {
    this.history = [];
    this.HIST = 43; // ~1s at 60fps
    this.lastOnsetTime = 0;
    this.beatIntervals = [];
    this.bpm = 120;
    this.beatPhase = 0;
  }

  update(bassEnergy, now, dt) {
    this.history.push(bassEnergy);
    if (this.history.length > this.HIST) this.history.shift();

    const mean = this.history.reduce((a, b) => a + b, 0) / this.history.length;
    const variance = this.history.reduce((a, b) => a + (b - mean) ** 2, 0) / this.history.length;
    const std = Math.sqrt(variance);
    const threshold = mean * 1.35 + std * 1.2 + 0.02;

    const isOnset = bassEnergy > threshold && (now - this.lastOnsetTime) > 200; // max 300bpm

    if (isOnset) {
      const interval = now - this.lastOnsetTime;
      if (interval > 200 && interval < 1500) { // 40-300 bpm
        this.beatIntervals.push(interval);
        if (this.beatIntervals.length > 8) this.beatIntervals.shift();

        // Median BPM
        const sorted = [...this.beatIntervals].sort((a, b) => a - b);
        const med = sorted[Math.floor(sorted.length / 2)];
        this.bpm = 60000 / med;
      }
      this.lastOnsetTime = now;
      this.beatPhase = 0;
    } else {
      // Advance beat phase at BPM rate
      this.beatPhase += dt * (this.bpm / 60);
      if (this.beatPhase > 1) this.beatPhase -= 1;
    }

    return isOnset ? 1.0 : 0;
  }
}

// ============================================================
// KickDetector — cross-genre self-calibrating kick detection
// ============================================================
// Four-stage algorithm synthesized from spectral flux + STA/LTA + adaptive
// percentile research. Produces continuous `kickness` in [0,1] and discrete
// `isKick` events. Auto-calibrates to any song within ~5s, volume-invariant,
// distinguishes kicks from bass notes via mid-band penalty.
class KickDetector {
  constructor() {
    // Stage 1: prev-frame magnitude storage for HWR spectral flux
    this.prevSub = new Float32Array(8);   // bins 1..5 plus margin
    this.prevMid = new Float32Array(16);  // bins 7..20

    // Stage 2: STA/LTA ring buffers. At ~46ms FFT hop but updated every
    // renderer frame (~2.8ms @ 360fps), so use longer buffers in frames.
    // STA ≈ 50ms, LTA ≈ 3s. Tune by target hop rate — using 60fps nominal.
    this.STA_N = 3;    // ~50ms at 60fps
    this.LTA_N = 180;  // ~3s at 60fps
    this.staBuf = new Float32Array(this.STA_N);
    this.ltaBuf = new Float32Array(this.LTA_N);
    this.staIdx = 0; this.ltaIdx = 0;
    this.staSum = 0; this.ltaSum = 0;

    // Stage 3: log-spaced histogram of ratio values for adaptive percentile.
    // Covers ratio range [0.1, 100] logarithmically across 64 bins.
    this.HIST_N = 64;
    this.hist = new Float32Array(this.HIST_N);
    this.HIST_DECAY = 0.995; // ~200 frames memory (~3.3s at 60fps)

    // Stage 4: event state
    this.frozen = false;
    this.lastTrig = -Infinity;

    // Outputs
    this.kickness = 0;
    this.isKick = false;
    this.novelty = 0; // exposed for diagnostics
  }

  _histBin(ratio) {
    // Log-space bins covering [0.1, 100]: 3 decades across HIST_N bins.
    const r = Math.max(0.1, Math.min(100, ratio));
    const idx = Math.floor((Math.log(r) - Math.log(0.1)) / (Math.log(100) - Math.log(0.1)) * this.HIST_N);
    return Math.max(0, Math.min(this.HIST_N - 1, idx));
  }

  _histAdd(ratio) {
    // Decay all bins, then increment the one matching the current ratio.
    for (let i = 0; i < this.HIST_N; i++) this.hist[i] *= this.HIST_DECAY;
    this.hist[this._histBin(ratio)] += 1;
  }

  _histPercentile(p) {
    // Cumulative scan — find the log-bin where cumulative count reaches p.
    let total = 0;
    for (let i = 0; i < this.HIST_N; i++) total += this.hist[i];
    if (total < 1) return 1; // not enough history yet — neutral
    const target = total * p;
    let running = 0;
    for (let i = 0; i < this.HIST_N; i++) {
      running += this.hist[i];
      if (running >= target) {
        // Convert bin index back to ratio (bin center)
        const logLo = Math.log(0.1), logHi = Math.log(100);
        const logR = logLo + ((i + 0.5) / this.HIST_N) * (logHi - logLo);
        return Math.exp(logR);
      }
    }
    return 100;
  }

  update(freqData, now) {
    // --- Stage 1: sub-band HWR spectral flux + mid-band penalty ---
    let subFlux = 0, midFlux = 0;
    for (let k = 1; k <= 5; k++) {
      const v = freqData[k] / 255;
      const d = v - this.prevSub[k];
      if (d > 0) subFlux += d;
      this.prevSub[k] = v;
    }
    for (let k = 7; k <= 20; k++) {
      const v = freqData[k] / 255;
      const d = v - this.prevMid[k - 7];
      if (d > 0) midFlux += d;
      this.prevMid[k - 7] = v;
    }
    // Bass-note onsets spike midFlux too; kicks are sub-heavy.
    // Penalty exp(-0.5 * mid/sub) reduces novelty when mid-flux competes.
    // 0.5 balances rejection of bass-notes with catching real kicks.
    const novelty = subFlux * Math.exp(-0.5 * midFlux / (subFlux + 1e-6));
    this.novelty = novelty;

    // --- Stage 2: STA/LTA with LTA freeze during active trigger ---
    this.staSum += novelty - this.staBuf[this.staIdx];
    this.staBuf[this.staIdx] = novelty;
    this.staIdx = (this.staIdx + 1) % this.STA_N;
    const sta = this.staSum / this.STA_N;

    if (!this.frozen) {
      this.ltaSum += novelty - this.ltaBuf[this.ltaIdx];
      this.ltaBuf[this.ltaIdx] = novelty;
      this.ltaIdx = (this.ltaIdx + 1) % this.LTA_N;
    }
    const lta = this.ltaSum / this.LTA_N;
    const ratio = sta / (lta + 1e-6);

    // --- Stage 3: adaptive threshold via rolling percentile ---
    this._histAdd(ratio);
    const theta_hi = Math.max(2.5, this._histPercentile(0.90) * 1.4);
    const theta_lo = 1.3;

    // --- Stage 4: continuous kickness + discrete isKick with hysteresis ---
    this.kickness = Math.max(0, Math.min(1, (ratio - theta_lo) / (theta_hi - theta_lo)));
    const refractoryOK = (now - this.lastTrig) > 60;
    this.isKick = !this.frozen && ratio > theta_hi && refractoryOK;
    if (this.isKick) {
      this.lastTrig = now;
      this.frozen = true;
    }
    // Release freeze when ratio drops back below detrigger threshold
    if (this.frozen && ratio < theta_lo) this.frozen = false;

    return { kickness: this.kickness, isKick: this.isKick };
  }
}

// ============================================================
// Main analyzer — builds MusicFrame each call
// ============================================================
class MusicAnalyzer {
  constructor() {
    this.spectrum = new Float32Array(SPEC_BINS);
    this._prevFreq = null;
    this.onsetDetector = new OnsetDetector();
    this.kickDetector = new KickDetector();

    // Smoothed values
    this.s = {
      subBass: 0, bass: 0, lowMid: 0, mid: 0, highMid: 0, air: 0,
      rms: 0, centroid: 0, flatness: 0, flux: 0,
      onset: 0, silence: 1
    };
  }

  analyze(freqData, now, dt) {
    if (!this._prevFreq) this._prevFreq = new Uint8Array(freqData.length);

    // Raw features
    const raw = {
      subBass: bandEnergy(freqData, BAND_RANGES.subBass),
      bass: bandEnergy(freqData, BAND_RANGES.bass),
      lowMid: bandEnergy(freqData, BAND_RANGES.lowMid),
      mid: bandEnergy(freqData, BAND_RANGES.mid),
      highMid: bandEnergy(freqData, BAND_RANGES.highMid),
      air: bandEnergy(freqData, BAND_RANGES.air),
      rms: computeRMS(freqData),
      centroid: computeCentroid(freqData),
      flatness: computeFlatness(freqData),
      flux: computeFlux(freqData, this._prevFreq),
    };

    // Smooth (different time constants per feature)
    const smoothFast = 0.35, smoothSlow = 0.15;
    this.s.subBass += (raw.subBass - this.s.subBass) * smoothFast;
    this.s.bass += (raw.bass - this.s.bass) * smoothFast;
    this.s.lowMid += (raw.lowMid - this.s.lowMid) * smoothFast;
    this.s.mid += (raw.mid - this.s.mid) * smoothFast;
    this.s.highMid += (raw.highMid - this.s.highMid) * smoothFast;
    this.s.air += (raw.air - this.s.air) * smoothFast;
    this.s.rms += (raw.rms - this.s.rms) * smoothFast;
    this.s.centroid += (raw.centroid - this.s.centroid) * smoothSlow;
    this.s.flatness += (raw.flatness - this.s.flatness) * smoothSlow;
    this.s.flux += (raw.flux - this.s.flux) * smoothFast;

    // Log spectrum
    logSpectrum(freqData, this.spectrum);

    // Onset detection
    const onsetHit = this.onsetDetector.update(raw.bass, now, dt);
    this.s.onset = Math.max(this.s.onset - dt * 3, onsetHit); // decay over ~300ms

    // Kick detection — cross-genre self-calibrating detector
    const kd = this.kickDetector.update(freqData, now);

    // Silence detection
    const silentTarget = raw.rms < 0.01 ? 1 : 0;
    this.s.silence += (silentTarget - this.s.silence) * 0.05;

    // Save for next flux calculation
    this._prevFreq.set(freqData);

    return {
      spectrum: this.spectrum,
      subBass: this.s.subBass,
      bass: this.s.bass,
      bassRaw: raw.bass,
      subBassRaw: raw.subBass,
      lowMid: this.s.lowMid,
      mid: this.s.mid,
      highMid: this.s.highMid,
      air: this.s.air,
      rms: this.s.rms,
      centroid: this.s.centroid,
      flatness: this.s.flatness,
      flux: this.s.flux,
      onset: this.s.onset,
      kickness: kd.kickness,
      isKick: kd.isKick,
      silence: this.s.silence,
      bpm: this.onsetDetector.bpm,
      beatPhase: this.onsetDetector.beatPhase,
      t: now
    };
  }
}

window.MusicAnalyzer = MusicAnalyzer;
window.SPEC_BINS = SPEC_BINS;
