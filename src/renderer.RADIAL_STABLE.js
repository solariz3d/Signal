/**
 * SIGNAL AUDIO — Music-reactive cosmic web renderer
 */

// ============================================================
// BUTTON FIRST — register click handler before anything can fail
// ============================================================
const _startBtn = document.getElementById('start-btn');
const _startOverlay = document.getElementById('start-overlay');
const _diag = document.getElementById('diag');

let _capturedStream = null;
let _capturedCtx = null;
let _capturedAnalyser = null;
let _capturedFreqData = null;

// C key cycles color archetypes
document.addEventListener('keydown', (e) => {
  if (e.key === 'c' || e.key === 'C') {
    archetypeIndex = (archetypeIndex + 1) % ARCHETYPES.length;
  }
});

_startBtn.addEventListener('click', async () => {
  _startBtn.textContent = 'Requesting audio...';
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: { width: 320, height: 240, frameRate: 30 }
    });
    if (stream.getAudioTracks().length === 0) {
      _startBtn.textContent = 'NO AUDIO — share with audio checked';
      return;
    }
    stream.getVideoTracks().forEach(t => t.stop());

    _capturedStream = stream;
    _capturedCtx = new AudioContext();
    const source = _capturedCtx.createMediaStreamSource(stream);
    _capturedAnalyser = _capturedCtx.createAnalyser();
    _capturedAnalyser.fftSize = 2048;
    _capturedAnalyser.smoothingTimeConstant = 0.75;
    source.connect(_capturedAnalyser);
    _capturedFreqData = new Uint8Array(_capturedAnalyser.frequencyBinCount);

    _startOverlay.classList.add('hidden');
  } catch (err) {
    _startBtn.textContent = 'ERR: ' + (err.message || err.name).slice(0, 40);
    console.error(err);
  }
});

// ============================================================
// WebGL setup — native resolution for high-DPI displays
// ============================================================
const canvas = document.createElement('canvas');
const DPR = Math.min(window.devicePixelRatio || 1, 2); // cap at 2x for perf
let W = Math.round(window.innerWidth * DPR);
let H = Math.round(window.innerHeight * DPR);
canvas.width = W; canvas.height = H;
// CSS size stays as logical pixels so the layout fits the window
canvas.style.width = window.innerWidth + 'px';
canvas.style.height = window.innerHeight + 'px';
document.body.insertBefore(canvas, document.body.firstChild);
const gl = canvas.getContext('webgl', {
  antialias: false, alpha: false,
  preserveDrawingBuffer: false,
  powerPreference: 'high-performance'
});
if (!gl) throw new Error('No WebGL');

function mkS(src, type) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
  return s;
}
function mkP(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, mkS(vs, gl.VERTEX_SHADER));
  gl.attachShader(p, mkS(fs, gl.FRAGMENT_SHADER));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(p));
  return p;
}

// ============================================================
// Simplex noise (Ashima)
// ============================================================
const NOISE = `
vec3 mod289v3(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289v4(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289v4(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;
  vec3 i1=min(g,l.zxy);vec3 i2=max(g,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289v3(i);
  vec4 p=permute(permute(permute(
    i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;
  vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);
  m=m*m;return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

// ============================================================
// Fragment shader — music-reactive cosmic web
// ============================================================
const flowProg = mkP(
  `attribute vec2 aPos;varying vec2 vUv;
   void main(){vUv=aPos*.5+.5;gl_Position=vec4(aPos,0.,1.);}`,
  `precision highp float;
   ${NOISE}

   uniform float uTime, uSeed, uZoom;
   uniform vec3 uSoulColor1, uSoulColor2, uSoulColor3;
   uniform vec2 uRes;

   // Music uniforms
   uniform sampler2D uSpectrum;
   uniform float uBass, uLowMid, uMid, uHighMid, uAir;
   uniform float uRms, uOnset, uBeatPhase, uCentroid, uFlatness, uFlux;
   uniform float uSilence;

   varying vec2 vUv;

   void main() {
     vec2 st = (vUv - 0.5) * 2.0;
     st.x *= uRes.x / uRes.y;
     vec3 st3 = vec3(st, 0.0) * uZoom;

     // Radial coords — frequency maps to radius
     float rad = length(st);

     float t = uTime * 0.25;

     // === Band-weighted ridged noise ===
     // Each octave is owned by a frequency band. Bass thickens octave 0,
     // treble brightens octave 3. Silent music falls back to 0.7 baseline.
     float baseLine = 0.35 + 0.35 * uSilence;
     float bands[4];
     bands[0] = mix(baseLine, 1.3, uBass);
     bands[1] = mix(baseLine, 1.15, uLowMid);
     bands[2] = mix(baseLine, 1.05, uMid);
     bands[3] = mix(baseLine, 1.0, uHighMid);

     // Onset swells all bands together — the beat inhales the whole field
     float onsetBoost = 1.0 + uOnset * 0.7;

     float n = 0.0;
     float amp = 0.6;
     float freq = 1.0;
     for (int i = 0; i < 4; i++) {
       float raw = snoise(st3 * freq + vec3(0., 0., t + float(i) * 1.7 + uSeed));
       float ridge = 1.0 - abs(raw);
       float band = (i == 0) ? bands[0] :
                    (i == 1) ? bands[1] :
                    (i == 2) ? bands[2] : bands[3];
       n += amp * ridge * band * onsetBoost;
       freq *= 2.0;
       amp *= 0.5;
     }
     n = n * n * 0.25;

     // === Radial spectrum sample ===
     // Frequency content sculpts the field — bass pushes center, treble pushes edges
     float freqCoord = clamp(rad / 1.3, 0.0, 1.0);
     float specHere = texture2D(uSpectrum, vec2(freqCoord, 0.5)).r;
     float specContribution = specHere * 0.4 * (1.0 - uSilence);
     n += specContribution * exp(-abs(rad - freqCoord * 1.3) * 3.0);

     // === Color mixing with soul colors ===
     float mix1 = snoise(st3 * 0.4 + vec3(1., 0., t * 0.15 + uSeed * 3.)) * 0.5 + 0.5;
     float mix2 = snoise(st3 * 0.35 + vec3(-2., 0., t * 0.12 + uSeed * 5.)) * 0.5 + 0.5;
     vec3 soulHere = uSoulColor1 * mix1 + uSoulColor2 * (1.0 - mix1) * mix2 + uSoulColor3 * (1.0 - mix1) * (1.0 - mix2);

     // === Emergent color — soul absorbs audio, same as the original Signal ===
     // No designed mapping. Audio bytes feed the soul hues through the same
     // accumulation math that made Claude Code's JSONL produce the cosmic web's colors.
     // Whatever color emerges is whatever emerges.

     // === Breath ===
     // Silent: slow sin(time) drift. Playing: synced to beat phase.
     float silentBreath = sin(uTime * 0.4) * 0.15 + 0.85;
     float musicBreath = sin(uBeatPhase * 6.2831) * 0.2 + 0.8 + uOnset * 0.15;
     float breath = mix(musicBreath, silentBreath, uSilence);

     // === Compose ===
     vec3 col = vec3(0.006, 0.006, 0.012);

     // Ridges (main structure) — boosted saturation
     vec3 ridgeColor = soulHere * (0.6 + 1.1 * breath);
     col += ridgeColor * n * (1.3 + uRms * 0.8);

     // Void glow — more vivid secondary color
     vec3 voidColor = uSoulColor2 * (0.5 + uFlatness * 0.3);
     col += voidColor * max(0.0, 0.12 - n) * 3.5;

     // Ridge hot edges — flare on onset, brighter
     float ridgeEdge = smoothstep(0.15, 0.35, n) * smoothstep(0.6, 0.35, n);
     vec3 hotColor = max(uSoulColor1, max(uSoulColor2, uSoulColor3));
     col += hotColor * ridgeEdge * (0.8 + uOnset * 2.0);

     // Saturation boost — push color intensity while preserving hue
     float lum = dot(col, vec3(0.299, 0.587, 0.114));
     col = mix(vec3(lum), col, 1.35); // increase distance from gray

     // Global energy
     col *= 1.0 + uRms * 0.5;

     // Soft vignette — smooth gradient all the way to black at the edges
     // Uses smoothstep for a gentle falloff that fades completely
     float vigDist = length(vUv - 0.5) * 1.4;
     float vig = smoothstep(1.0, 0.1, vigDist);
     col *= vig;

     gl_FragColor = vec4(col, 1.0);
   }`
);

// ============================================================
// Cache locations
// ============================================================
const loc = {
  aPos: gl.getAttribLocation(flowProg, 'aPos'),
  uTime: gl.getUniformLocation(flowProg, 'uTime'),
  uSeed: gl.getUniformLocation(flowProg, 'uSeed'),
  uZoom: gl.getUniformLocation(flowProg, 'uZoom'),
  uSoulColor1: gl.getUniformLocation(flowProg, 'uSoulColor1'),
  uSoulColor2: gl.getUniformLocation(flowProg, 'uSoulColor2'),
  uSoulColor3: gl.getUniformLocation(flowProg, 'uSoulColor3'),
  uRes: gl.getUniformLocation(flowProg, 'uRes'),
  uSpectrum: gl.getUniformLocation(flowProg, 'uSpectrum'),
  uBass: gl.getUniformLocation(flowProg, 'uBass'),
  uLowMid: gl.getUniformLocation(flowProg, 'uLowMid'),
  uMid: gl.getUniformLocation(flowProg, 'uMid'),
  uHighMid: gl.getUniformLocation(flowProg, 'uHighMid'),
  uAir: gl.getUniformLocation(flowProg, 'uAir'),
  uRms: gl.getUniformLocation(flowProg, 'uRms'),
  uOnset: gl.getUniformLocation(flowProg, 'uOnset'),
  uBeatPhase: gl.getUniformLocation(flowProg, 'uBeatPhase'),
  uCentroid: gl.getUniformLocation(flowProg, 'uCentroid'),
  uFlatness: gl.getUniformLocation(flowProg, 'uFlatness'),
  uFlux: gl.getUniformLocation(flowProg, 'uFlux'),
  uSilence: gl.getUniformLocation(flowProg, 'uSilence'),
};

// ============================================================
// Quad + spectrum texture
// ============================================================
const quadBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);

// Spectrum texture: 64x1, luminance
const specTex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, specTex);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 64, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array(64));
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
const specByteData = new Uint8Array(64);

gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.viewport(0, 0, W, H);

// User zoom
let userZoom = 1.0;
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  userZoom *= e.deltaY > 0 ? 1.08 : 0.92;
  userZoom = Math.max(0.2, Math.min(5.0, userZoom));
}, { passive: false });

// ============================================================
// Soul state — evolves from audio
// ============================================================
const soul = {
  seed: 0,
  // Start at zero — colors earn themselves from the audio data
  hue1: 0, hue2: 0, hue3: 0,
  saturation: 0.1,
};

// === Song fingerprint — long-term spectrum averages ===
// These EMAs track the song's overall spectral character over ~15 seconds.
// Each song settles into its own unique fingerprint of ratios.
const songFingerprint = {
  bass: 0, lowMid: 0, mid: 0, highMid: 0, air: 0,
  centroid: 0, flatness: 0, peakBin: 0
};

function updateFingerprint(frame, dt) {
  if (!frame || frame.silence > 0.5) return;
  // Very slow EMA — settles over ~15 seconds
  const r = 1 - Math.exp(-dt * 0.08);
  songFingerprint.bass += (frame.bass - songFingerprint.bass) * r;
  songFingerprint.lowMid += (frame.lowMid - songFingerprint.lowMid) * r;
  songFingerprint.mid += (frame.mid - songFingerprint.mid) * r;
  songFingerprint.highMid += (frame.highMid - songFingerprint.highMid) * r;
  songFingerprint.air += (frame.air - songFingerprint.air) * r;
  songFingerprint.centroid += (frame.centroid - songFingerprint.centroid) * r;
  songFingerprint.flatness += (frame.flatness - songFingerprint.flatness) * r;
}

// Color archetypes — the one conscious layer of control.
// Each archetype defines a center hue and range within which the
// emergent song-specific colors are constrained.
const ARCHETYPES = [
  { name: 'EMERGENT',  center: 0.00, range: 1.00, vibrance: 1.7 }, // pure raw, vibrance cranked
  { name: 'SPECTRUM',  center: 0.00, range: 1.00, vibrance: 1.0 },
  { name: 'AURORA',    center: 0.42, range: 0.25, vibrance: 1.2 },
  { name: 'EMBER',     center: 0.05, range: 0.15, vibrance: 1.3 },
  { name: 'OCEAN',     center: 0.55, range: 0.18, vibrance: 1.2 },
  { name: 'COSMIC',    center: 0.78, range: 0.22, vibrance: 1.3 },
  { name: 'CHLOROPHYLL', center: 0.30, range: 0.12, vibrance: 1.2 },
  { name: 'VOID',      center: 0.00, range: 0.03, vibrance: 0.4 },
];
let archetypeIndex = 0;

// Target hues derived from the fingerprint using irrational constants,
// then mapped into the current archetype's hue range.
function fingerprintTargetHues() {
  const fp = songFingerprint;
  const PHI = 1.61803, E = 2.71828, PI = 3.14159, SQRT2 = 1.41421;

  // Raw emergent hues from the spectrum's ratios
  const r1 = Math.abs((fp.bass * E + fp.lowMid * PHI + fp.mid * 0.7) % 1);
  const r2 = Math.abs((fp.mid * PI + fp.highMid * SQRT2 + fp.centroid * 1.3) % 1);
  const r3 = Math.abs((fp.highMid * PHI + fp.air * E + fp.flatness * 0.9) % 1);

  // Map into the archetype's hue window
  const arch = ARCHETYPES[archetypeIndex];
  const wrap = x => (x + 1) % 1;
  const toArch = raw => wrap(arch.center + (raw - 0.5) * arch.range);
  return [toArch(r1), toArch(r2), toArch(r3)];
}

function feedSoulFromFingerprint(frame, dt, freqData) {
  updateFingerprint(frame, dt);

  if (!frame || frame.silence > 0.5) {
    soul.seed += dt * 0.005;
    return;
  }

  // SEED drifts from raw audio bytes — makes the music flow through the structure.
  // Gentler rate: sample every 16th bin, half the multiplier.
  if (freqData) {
    for (let i = 0; i < freqData.length; i += 16) {
      soul.seed += freqData[i] * 0.0000068;
    }
  }

  // Ease hues toward fingerprint targets — reaches them over ~5 seconds
  const [t1, t2, t3] = fingerprintTargetHues();
  const ease = 1 - Math.exp(-dt * 0.4);

  // Shortest-path lerp on the hue circle
  function lerpHue(current, target, t) {
    let d = target - current;
    if (d > 0.5) d -= 1;
    if (d < -0.5) d += 1;
    return (current + d * t + 1) % 1;
  }
  soul.hue1 = lerpHue(soul.hue1, t1, ease);
  soul.hue2 = lerpHue(soul.hue2, t2, ease);
  soul.hue3 = lerpHue(soul.hue3, t3, ease);

  // Saturation from spectral variance
  const satTarget = 0.4 + frame.flux * 0.4 + (1 - frame.flatness) * 0.2;
  soul.saturation += (satTarget - soul.saturation) * 0.02;
  soul.saturation = Math.max(0.3, Math.min(0.95, soul.saturation));
}

function hsl2rgb(h, s, l) {
  const q = l < 0.5 ? l*(1+s) : l+s-l*s;
  const p = 2*l-q;
  const f = (p,q,t) => {
    if(t<0)t+=1;if(t>1)t-=1;
    return t<1/6?p+(q-p)*6*t:t<1/2?q:t<2/3?p+(q-p)*(2/3-t)*6:p;
  };
  return [f(p,q,h+1/3), f(p,q,h), f(p,q,h-1/3)];
}
function soulColors() {
  const vibrance = ARCHETYPES[archetypeIndex].vibrance || 1.0;
  const s = Math.min(1, soul.saturation * 1.4 * vibrance);
  return {
    c1: hsl2rgb(soul.hue1, s, 0.58),
    c2: hsl2rgb(soul.hue2, s * 0.95, 0.52),
    c3: hsl2rgb(soul.hue3, s, 0.56),
  };
}

function feedSoul(frame, dt, freqData) {
  feedSoulFromFingerprint(frame, dt, freqData);
}

// ============================================================
// Analyzer
// ============================================================
const analyzer = new MusicAnalyzer();
let latestFrame = null;

function getFreqData() {
  if (!_capturedAnalyser) return null;
  _capturedAnalyser.getByteFrequencyData(_capturedFreqData);
  return _capturedFreqData;
}

// ============================================================
// Render loop
// ============================================================
let lastTime = performance.now();
let simTime = 0;
const diag = document.getElementById('diag');

function render(now) {
  requestAnimationFrame(render);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  simTime += dt;


  // Get audio frame
  const freqData = getFreqData();
  if (freqData) {
    latestFrame = analyzer.analyze(freqData, now, dt);
  }

  // Default frame if no audio yet
  const frame = latestFrame || {
    spectrum: new Float32Array(64),
    bass: 0, lowMid: 0, mid: 0, highMid: 0, air: 0,
    rms: 0, centroid: 0.5, flatness: 0, flux: 0,
    onset: 0, silence: 1, bpm: 120, beatPhase: 0
  };

  // Feed soul — audio bytes drift the hues, same math as the original Signal
  feedSoul(frame, dt, freqData);

  // Update spectrum texture
  for (let i = 0; i < 64; i++) {
    specByteData[i] = Math.min(255, Math.floor(frame.spectrum[i] * 255));
  }
  gl.bindTexture(gl.TEXTURE_2D, specTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 64, 1, gl.LUMINANCE, gl.UNSIGNED_BYTE, specByteData);

  // Render
  const sc = soulColors();
  gl.viewport(0, 0, W, H);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(flowProg);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, specTex);
  gl.uniform1i(loc.uSpectrum, 0);

  gl.uniform1f(loc.uTime, simTime);
  gl.uniform1f(loc.uSeed, soul.seed);
  gl.uniform1f(loc.uZoom, userZoom);
  gl.uniform3f(loc.uSoulColor1, sc.c1[0], sc.c1[1], sc.c1[2]);
  gl.uniform3f(loc.uSoulColor2, sc.c2[0], sc.c2[1], sc.c2[2]);
  gl.uniform3f(loc.uSoulColor3, sc.c3[0], sc.c3[1], sc.c3[2]);
  gl.uniform2f(loc.uRes, W, H);
  gl.uniform1f(loc.uBass, frame.bass);
  gl.uniform1f(loc.uLowMid, frame.lowMid);
  gl.uniform1f(loc.uMid, frame.mid);
  gl.uniform1f(loc.uHighMid, frame.highMid);
  gl.uniform1f(loc.uAir, frame.air);
  gl.uniform1f(loc.uRms, frame.rms);
  gl.uniform1f(loc.uOnset, frame.onset);
  gl.uniform1f(loc.uBeatPhase, frame.beatPhase);
  gl.uniform1f(loc.uCentroid, frame.centroid);
  gl.uniform1f(loc.uFlatness, frame.flatness);
  gl.uniform1f(loc.uFlux, frame.flux);
  gl.uniform1f(loc.uSilence, frame.silence);

  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(loc.aPos);
  gl.vertexAttribPointer(loc.aPos, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.disableVertexAttribArray(loc.aPos);

  // Diagnostic
  if (diag) {
    const b = Math.round(frame.bass * 100);
    const m = Math.round(frame.mid * 100);
    const h = Math.round(frame.highMid * 100);
    const r = Math.round(frame.rms * 100);
    const bpm = Math.round(frame.bpm);
    const silent = frame.silence > 0.5 ? 'SILENT' : 'LIVE';
    const arch = ARCHETYPES[archetypeIndex].name;
    diag.textContent = `[${arch}]  ${silent}  BASS ${b}  MID ${m}  HIGH ${h}  RMS ${r}  BPM ${bpm}  (press C to cycle)`;
  }
}

// ============================================================
// Resize
// ============================================================
window.addEventListener('resize', () => {
  W = Math.round(window.innerWidth * DPR);
  H = Math.round(window.innerHeight * DPR);
  canvas.width = W; canvas.height = H;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  gl.viewport(0, 0, W, H);
});

requestAnimationFrame(render);
