/**
 * SIGNAL AUDIO — Music-reactive cosmic web renderer
 */

// ============================================================
// BUTTON FIRST — register click handler before anything can fail
// ============================================================
const _startBtn = document.getElementById('start-btn');
const _startOverlay = document.getElementById('start-overlay');
const _diag = document.getElementById('diag');

// Fade in the start overlay after the splash hands off
setTimeout(() => _startOverlay.classList.add('ready'), 1200);

_startBtn.addEventListener('click', async () => {
  _startBtn.textContent = 'Tuning…';
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: { width: 320, height: 240, frameRate: 30 }
    });
    if (stream.getAudioTracks().length === 0) {
      _startBtn.textContent = 'Share with audio enabled';
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
    _startBtn.textContent = 'Err: ' + (err.message || err.name).slice(0, 30);
    console.error(err);
  }
});

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

// Old "Begin Listening" button replaced by the source menu flow above.

// ============================================================
// WebGL setup — native resolution for high-DPI displays
// ============================================================
const canvas = document.createElement('canvas');
const DPR_2D = 1;       // full 1440p for Signal
const DPR_3D = 0.5;     // half-res for Wanderer — 4× fewer pixels, upscaled
let activeDPR = DPR_2D;
let W = Math.round(window.innerWidth * activeDPR);
let H = Math.round(window.innerHeight * activeDPR);
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
// Shared vertex shader
// ============================================================
const VS = `attribute vec2 aPos;varying vec2 vUv;
   void main(){vUv=aPos*.5+.5;gl_Position=vec4(aPos,0.,1.);}`;

// ============================================================
// 2D shader — HIM_V4 cosmic web
// ============================================================
const prog2D = mkP(VS,
  `precision highp float;
   ${NOISE}

   uniform float uTime, uSeed, uZoom, uChurnAmt, uKickTransient;
   uniform vec3 uSoulColor1, uSoulColor2, uSoulColor3, uSoulColor4;
   uniform vec2 uRes;

   // Music uniforms
   uniform sampler2D uSpectrum;
   uniform float uSubBass, uBass, uLowMid, uMid, uHighMid, uAir;
   uniform float uHolePulse;
   uniform float uRms, uOnset, uBeatPhase, uCentroid, uFlatness, uFlux;
   uniform float uSilence;

   // Traveling kick-pulse ages — 6 slots (two vec3s). Each kick spawns a
   // wavefront that radiates outward from the pull center.
   uniform vec3 uPulseAges;
   uniform vec3 uPulseAges2;
   // Visual sidechain — spikes to 1 on kick, decays ~200ms. Ducks bassline
   // visuals so the kick cuts through.
   uniform float uSidechain;

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
     bands[0] = mix(baseLine, 1.245, uBass);
     bands[1] = mix(baseLine, 1.0925, uLowMid);
     bands[2] = mix(baseLine, 0.9975, uMid);
     bands[3] = mix(baseLine, 0.95, uHighMid);

     float onsetBoost = 1.0 + uOnset * 0.665;

     // Center perturbation — offset downward so the pull origin sits
     // where the apparent core of the structure is, not geometric (0,0).
     vec2 pullCenter = vec2(0.0, 0.0);
     float pullRad = length(st - pullCenter);
     // Kick expands the pulse radius — breathes larger on transients
     float pulseRadius = 0.32 + uKickTransient * 0.15;
     float centerWeight = smoothstep(pulseRadius, 0.0, pullRad);
     centerWeight = pow(centerWeight, 1.6);
     // Churn amplitude is smoothed in JS (uChurnAmt) with a fast-attack /
     // slow-decay envelope, so the noise time-shift flows smoothly even
     // when bass spikes hard. No more frame-to-frame jitter.
     // Scaled down so the ripples at the pull center stay thin during heavy
     // bass instead of exploding into thick chaotic distortion.
     float centerChurn = centerWeight * uChurnAmt * 0.45;

     float n = 0.0;
     float amp = 0.6;
     float freq = 1.0;
     for (int i = 0; i < 4; i++) {
       // Time offset includes center churn — noise evolves faster at center on bass
       float raw = snoise(st3 * freq + vec3(0., 0., t + float(i) * 1.7 + uSeed + centerChurn));
       float ridge = 1.0 - abs(raw);
       float band = (i == 0) ? bands[0] :
                    (i == 1) ? bands[1] :
                    (i == 2) ? bands[2] : bands[3];
       n += amp * ridge * band * onsetBoost;
       freq *= 2.0;
       amp *= 0.5;
     }
     n = n * n * 0.25;

     // === Spiral spectrum — hourglass / double-pear ===
     // One continuous radial field with two foci (above and below the pull).
     // The specRad is the min distance to either focus, so each half of the
     // shape radiates from its own center. The lower pear's angular frame is
     // inverted (negate y) so its asymmetry mirrors the upper's — the stems
     // meet at the pull and the bulbs are at y=+0.20 and y=-0.20.
     float specHoleMask = smoothstep(0.14, 0.30, pullRad);
     vec2 stA = st - vec2(0.0, 0.20);
     vec2 stB = st - vec2(0.0, -0.20);
     float distA = length(stA);
     float distB = length(stB);
     float specRad = min(distA, distB);
     // Angle computed from whichever focus is closer — lower pear uses
     // negated y so its pear shape is rotated 180° (stem points up).
     vec2 localSt = (distA < distB) ? stA : vec2(stB.x, -stB.y);
     float specAng = atan(localSt.y, localSt.x);
     float specAngShift = sin(specAng) * 0.1 + cos(specAng * 2.0) * 0.05;
     float spiralCoord = clamp((specRad + specAngShift) / 1.3, 0.0, 1.0);
     float specHere = texture2D(uSpectrum, vec2(spiralCoord, 0.5)).r;
     float specContribution = specHere * 0.38 * (1.0 - uSilence) * specHoleMask;
     n += specContribution * exp(-abs(specRad - spiralCoord * 1.3) * 3.0);

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

     // Ridges (main structure) — center region gets a hue-shifted tint.
     // Color region extends wider than the physical pull so the color
     // gradient softly bleeds into the surrounding structure.
     vec3 centerTint = soulHere.gbr;
     float centerColorRegion = smoothstep(1.15, 0.0, pullRad);
     vec3 ridgeTint = mix(soulHere, centerTint, centerColorRegion);
     // On kicks, shift the center color toward a distinct hue (brg = ~240° rotation).
     // Clamp so it doesn't oversaturate — just a clear tint shift.
     vec3 kickColor = soulHere.brg;
     float kickColorMix = clamp(uKickTransient * 4.0, 0.0, 0.85) * centerWeight;
     ridgeTint = mix(ridgeTint, kickColor, kickColorMix);
     vec3 ridgeColor = ridgeTint * (0.6 + 1.1 * breath);
     // centerDim removed — the black hole now handles center darkening cleanly.
     // Previous gradient halo was leaving a lingering shadow around the hole.
     // Visual sidechain duck — gentle multiplier on bassline brightness.
     // Sqrt curve means small kickness still ducks a bit; peak kickness
     // ducks to ~0.32. Makes room for the kick pulse without over-dimming.
     float duck = 1.0 - sqrt(uSidechain) * 0.68;

     col += ridgeColor * n * (1.3 + uRms * 0.8) * duck;

     // === Traveling kick pulses — radiate outward through the network ===
     // Each kick spawns a wavefront that expands at waveSpeed. Asymmetric
     // shell (sharp leading edge, soft trailing decay). Tinted with kickColor
     // — the same hue that appears at the equalizer center on bass.
     float waveSpeed = 1.1;
     float shellWidth = 0.14;
     float pulseShell = 0.0;

     // Unrolled — WebGL1 can't dynamic-index vec3
     vec3 pulsesA = uPulseAges;
     vec3 pulsesB = uPulseAges2;

     if (pulsesA.x < 6.0) {
       float d = pullRad - pulsesA.x * waveSpeed;
       float w = shellWidth * shellWidth * (d > 0.0 ? 0.25 : 1.8);
       pulseShell += exp(-d * d / w) * exp(-pulsesA.x * 0.35);
     }
     if (pulsesA.y < 6.0) {
       float d = pullRad - pulsesA.y * waveSpeed;
       float w = shellWidth * shellWidth * (d > 0.0 ? 0.25 : 1.8);
       pulseShell += exp(-d * d / w) * exp(-pulsesA.y * 0.35);
     }
     if (pulsesA.z < 6.0) {
       float d = pullRad - pulsesA.z * waveSpeed;
       float w = shellWidth * shellWidth * (d > 0.0 ? 0.25 : 1.8);
       pulseShell += exp(-d * d / w) * exp(-pulsesA.z * 0.35);
     }
     if (pulsesB.x < 6.0) {
       float d = pullRad - pulsesB.x * waveSpeed;
       float w = shellWidth * shellWidth * (d > 0.0 ? 0.25 : 1.8);
       pulseShell += exp(-d * d / w) * exp(-pulsesB.x * 0.35);
     }
     if (pulsesB.y < 6.0) {
       float d = pullRad - pulsesB.y * waveSpeed;
       float w = shellWidth * shellWidth * (d > 0.0 ? 0.25 : 1.8);
       pulseShell += exp(-d * d / w) * exp(-pulsesB.y * 0.35);
     }
     if (pulsesB.z < 6.0) {
       float d = pullRad - pulsesB.z * waveSpeed;
       float w = shellWidth * shellWidth * (d > 0.0 ? 0.25 : 1.8);
       pulseShell += exp(-d * d / w) * exp(-pulsesB.z * 0.35);
     }

     // Add pulse tint. Multiply by n so the wavefront only illuminates where
     // filaments exist — it travels THROUGH the network, not across empty space.
     // Sidechain boost cranked — the kick flashes dramatically brighter while
     // the bassline only dips mildly. Relative brightness puts kick on top.
     col += kickColor * pulseShell * n * (1.6 + uBass * 1.3 + uSidechain * 7.0);

     // Center kick flash — bright burst AT the pull center, NOT subject to
     // sidechain ducking. Solves the destructive-interference problem where
     // the pulse was starting from a just-ducked center, making the kick look
     // like a subtraction rather than an addition. This flash is purely
     // additive and pops ON kick regardless of bassline state.
     float kickFlashMass = pow(smoothstep(0.38, 0.0, pullRad), 1.8);
     col += kickColor * kickFlashMass * uSidechain * 2.2 * (0.8 + uBass * 0.7);

     // Ride pulse — concentric rings traveling outward, tinted with the 4th
     // palette color. Masked away from center (rad < 0.25) to avoid phase
     // accumulation at the pull, where rings would converge infinitely dense.
     float rideWave = max(0.0, sin(rad * 5.0 - uTime * 2.5));
     float rideMask = smoothstep(0.18, 0.42, rad);
     col += uSoulColor4 * rideWave * n * 0.55 * rideMask;

     // Void glow — more vivid secondary color (KICK_REFINED values)
     vec3 voidColor = uSoulColor2 * (0.5 + uFlatness * 0.3);
     col += voidColor * max(0.0, 0.12 - n) * 3.5 * duck;

     // Ridge hot edges — flare on onset, brighter. NOT ducked — these are
     // where color pops come from, and dimming them washes the scene.
     float ridgeEdge = smoothstep(0.15, 0.35, n) * smoothstep(0.6, 0.35, n);
     vec3 hotColor = max(uSoulColor1, max(uSoulColor2, uSoulColor3));
     col += hotColor * ridgeEdge * (0.8 + uOnset * 2.0);

     // Saturation boost — push color intensity while preserving hue
     float lum = dot(col, vec3(0.299, 0.587, 0.114));
     col = mix(vec3(lum), col, 1.55); // more vibrant, pushed further from gray

     // Global energy
     col *= 1.0 + uRms * 0.35;

     // Vignette — fades corners toward dark so the void glow doesn't fill
     // the entire frame. Without this, the × 3.5 void glow turns the
     // whole image into a dense cellular tissue. Fades to ~0.2 at the
     // far corners, not fully black, so edges still have presence.
     float vigDist = length(vUv - 0.5) * 1.4;
     float vig = smoothstep(1.1, 0.45, vigDist);
     col *= vig;

     gl_FragColor = vec4(col, 1.0);
   }`
);

// ============================================================
// 3D shader — FLYTHROUGH raymarched cosmic web
// ============================================================
const prog3D = mkP(VS,
  `precision highp float;
   ${NOISE}

   uniform float uTime, uSeed, uZoom, uChurnAmt, uKickTransient;
   uniform float uCameraZ, uCameraAngle, uFov;
   uniform vec3 uCamPos, uCamDir;
   uniform float uTimeSinceKick, uShipDeathAge;
   uniform vec3 uPulseAges;   // ages of 3 most recent kick pulses
   uniform vec3 uPulseAges2;  // ages of 3 older pulses — 6 total so long-lived waves don't get evicted
   uniform vec3 uSoulColor1, uSoulColor2, uSoulColor3, uSoulColor4;
   uniform vec2 uRes;
   uniform sampler2D uSpectrum;
   uniform float uSubBass, uBass, uLowMid, uMid, uHighMid, uAir;
   uniform float uHolePulse;
   uniform float uRms, uOnset, uBeatPhase, uCentroid, uFlatness, uFlux;
   uniform float uSilence;
   varying vec2 vUv;

   float ridgedFBM(vec3 p, float t, float seed, float churn, float dist) {
     float baseLine = 0.35 + 0.35 * uSilence;
     float band0 = mix(baseLine, 1.245, uBass);
     float onsetBoost = 1.0 + uOnset * 0.665;
     // First octave — always evaluated
     float raw0 = snoise(p * 0.4 + vec3(0., 0., t + seed + churn));
     float n = 0.6 * (1.0 - abs(raw0)) * band0 * onsetBoost;
     // Second octave — skipped at far distances where high-freq detail
     // is sub-sample-size anyway. Big perf win for far march samples.
     if (dist < 10.0) {
       float band1 = mix(baseLine, 1.0925, uLowMid);
       float raw1 = snoise(p * 0.8 + vec3(0., 0., t + 1.7 + seed + churn));
       n += 0.3 * (1.0 - abs(raw1)) * band1 * onsetBoost;
     }
     return n * n * 0.25;
   }

   void main() {
     vec2 st = (vUv - 0.5) * 2.0;
     st.x *= uRes.x / uRes.y;
     float t = uTime * 0.25;

     vec3 camPos = uCamPos;
     vec3 camFwd = normalize(uCamDir);
     vec3 camRight = normalize(cross(camFwd, vec3(0., 1., 0.)));
     vec3 camUp = cross(camRight, camFwd);
     vec3 rd = normalize(camFwd * uFov + camRight * st.x + camUp * st.y);

     // Ship position — three harmonics per axis with irrational multipliers
     // (PHI, E) for a non-repeating, more dynamic path. Rates ~2x faster for
     // more active lateral drift while staying graceful (not frenetic).
     float PHI_S = 1.61803;
     float E_S = 2.71828;
     vec2 shipPos = vec2(
       sin(uTime * 0.15 * PHI_S) * 0.14 + cos(uTime * 0.09 * E_S) * 0.1 + sin(uTime * 0.05) * 0.07,
       cos(uTime * 0.11 * PHI_S) * 0.12 + sin(uTime * 0.08 * E_S) * 0.1 + cos(uTime * 0.06) * 0.08
     );

     vec3 col = vec3(0.0);
     float totalDensity = 0.0;
     // Step 0.36 × 70 iters = 25.2 units draw distance (was 19.6). Lets
     // pulses travel further into the visible network before fading.
     float stepSize = 0.36;

     for (int i = 0; i < 70; i++) {
       float marchDist = float(i) * stepSize;
       vec3 p = (camPos + rd * marchDist) * uZoom;

       // === Traveling wave pulses — distort the structure itself ===
       // Each kick spawns a wavefront that expands outward at waveSpeed.
       // Within a narrow shell at the current wavefront distance, we:
       //   1) Displace the noise sample coords radially (the filaments RIPPLE)
       //   2) Multiplicatively boost brightness (Weber's law perception)
       //   3) Shift color toward warm (chromatic cue for propagation)
       // Asymmetric shell: sharp leading edge, soft trailing decay.
       float waveSpeed = 5.0;
       float shellWidth = 0.26;
       // Scale pulse amplitude inversely with RMS — quiet sections get full punch,
       // loud sections get a softer pulse so close filaments don't overblow.
       // Light scaling — keeps wavefronts visible during loud music instead
       // of crushing them. Final tone-mapping handles any real over-exposure.
       float pulseAmp = 1.0 / (1.0 + uRms * 0.4);
       vec3 displaced_p = p;
       float brightMod = 1.0;
       vec3 chromShift = vec3(1.0);

       // Unrolled explicitly for WebGL1 — no loops or dynamic indexing
       vec3 pulses = uPulseAges;
       // Pulse 1 — extended life so light reverberates through the network
       // even during quiet passages between kicks. Distance-based energy
       // dispersion (1/r²) so far wavefronts are naturally dimmer than near.
       if (pulses.x < 20.0) {
         float d1 = marchDist - pulses.x * waveSpeed;
         float w = shellWidth * shellWidth * (d1 > 0.0 ? 0.15 : 2.4);
         float frontDist1 = max(pulses.x * waveSpeed, 0.5);
         float distFade1 = 1.0 / (1.0 + frontDist1 * frontDist1 * 0.009);
         float shell = exp(-d1 * d1 / w) * exp(-pulses.x * 0.08) * distFade1;
         displaced_p += rd * shell * 0.12 * pulseAmp;
         brightMod += shell * 3.8 * pulseAmp;
         chromShift *= mix(vec3(1.0), vec3(1.5, 1.0, 0.45), shell * 0.6 * pulseAmp);
       }
       // Pulse 2
       if (pulses.y < 20.0) {
         float d2 = marchDist - pulses.y * waveSpeed;
         float w = shellWidth * shellWidth * (d2 > 0.0 ? 0.15 : 2.4);
         float frontDist2 = max(pulses.y * waveSpeed, 0.5);
         float distFade2 = 1.0 / (1.0 + frontDist2 * frontDist2 * 0.009);
         float shell = exp(-d2 * d2 / w) * exp(-pulses.y * 0.08) * distFade2;
         displaced_p += rd * shell * 0.12 * pulseAmp;
         brightMod += shell * 3.8 * pulseAmp;
         chromShift *= mix(vec3(1.0), vec3(1.5, 1.0, 0.45), shell * 0.6 * pulseAmp);
       }
       // Pulse 3
       if (pulses.z < 20.0) {
         float d3 = marchDist - pulses.z * waveSpeed;
         float w = shellWidth * shellWidth * (d3 > 0.0 ? 0.15 : 2.4);
         float frontDist3 = max(pulses.z * waveSpeed, 0.5);
         float distFade3 = 1.0 / (1.0 + frontDist3 * frontDist3 * 0.009);
         float shell = exp(-d3 * d3 / w) * exp(-pulses.z * 0.08) * distFade3;
         displaced_p += rd * shell * 0.12 * pulseAmp;
         brightMod += shell * 3.8 * pulseAmp;
         chromShift *= mix(vec3(1.0), vec3(1.5, 1.0, 0.45), shell * 0.6 * pulseAmp);
       }
       // Older pulses — second ring of three so long-lived waves
       // aren't evicted while still traveling through the network
       vec3 pulses2 = uPulseAges2;
       // Pulse 4
       if (pulses2.x < 20.0) {
         float d4 = marchDist - pulses2.x * waveSpeed;
         float w = shellWidth * shellWidth * (d4 > 0.0 ? 0.15 : 2.4);
         float frontDist4 = max(pulses2.x * waveSpeed, 0.5);
         float distFade4 = 1.0 / (1.0 + frontDist4 * frontDist4 * 0.009);
         float shell = exp(-d4 * d4 / w) * exp(-pulses2.x * 0.08) * distFade4;
         displaced_p += rd * shell * 0.12 * pulseAmp;
         brightMod += shell * 3.8 * pulseAmp;
         chromShift *= mix(vec3(1.0), vec3(1.5, 1.0, 0.45), shell * 0.6 * pulseAmp);
       }
       // Pulse 5
       if (pulses2.y < 20.0) {
         float d5 = marchDist - pulses2.y * waveSpeed;
         float w = shellWidth * shellWidth * (d5 > 0.0 ? 0.15 : 2.4);
         float frontDist5 = max(pulses2.y * waveSpeed, 0.5);
         float distFade5 = 1.0 / (1.0 + frontDist5 * frontDist5 * 0.009);
         float shell = exp(-d5 * d5 / w) * exp(-pulses2.y * 0.08) * distFade5;
         displaced_p += rd * shell * 0.12 * pulseAmp;
         brightMod += shell * 3.8 * pulseAmp;
         chromShift *= mix(vec3(1.0), vec3(1.5, 1.0, 0.45), shell * 0.6 * pulseAmp);
       }
       // Pulse 6
       if (pulses2.z < 20.0) {
         float d6 = marchDist - pulses2.z * waveSpeed;
         float w = shellWidth * shellWidth * (d6 > 0.0 ? 0.15 : 2.4);
         float frontDist6 = max(pulses2.z * waveSpeed, 0.5);
         float distFade6 = 1.0 / (1.0 + frontDist6 * frontDist6 * 0.009);
         float shell = exp(-d6 * d6 / w) * exp(-pulses2.z * 0.08) * distFade6;
         displaced_p += rd * shell * 0.12 * pulseAmp;
         brightMod += shell * 3.8 * pulseAmp;
         chromShift *= mix(vec3(1.0), vec3(1.5, 1.0, 0.45), shell * 0.6 * pulseAmp);
       }

       // Network self-pulse — during breaks (mids/highs present, no bass)
       // the structure reveals its own gentle energy traveling outward.
       // Suppressed by bass (kicks dominate) and by silence (darkness).
       float breakEnergy = clamp((uMid * 0.5 + uHighMid + uAir * 0.8) - uBass * 4.0, 0.0, 1.0);
       float networkPulse = max(0.0, sin(marchDist * 1.2 - uTime * 1.8));
       float breakActive = breakEnergy * (1.0 - uSilence);
       // Strong self-pulse on brightMod so the traveling waves are actually visible
       brightMod += networkPulse * breakActive * 2.8;
       // Baseline break luminosity — lifts filaments out of darkness so the pulses
       // have something to modulate. Without this, dim filaments × bright pulse = still dim.
       brightMod += breakActive * 0.9;

       // Churn ramps in with distance so near filaments stay stable and sharp
       // during high bass. Near noise pattern is coherent (you can actually see
       // it); mid/far gets the kick-driven temporal evolution.
       float churn = uChurnAmt * 0.15 * smoothstep(0.5, 3.0, marchDist);
       float density = ridgedFBM(displaced_p, t, uSeed, churn, marchDist);
       if (density < 0.05) continue;
       // Capped at 0.85 (was 1.2) so no single near sample can dominate
       // the accumulation during loud bass, leaving room for far structure.
       density = smoothstep(0.05, 0.30, density) * 0.85;

       float m1 = snoise(p * 0.3 + vec3(1., 0., t * 0.15 + uSeed * 3.)) * 0.5 + 0.5;
       float m2 = snoise(p * 0.25 + vec3(-2., 0., t * 0.12 + uSeed * 5.)) * 0.5 + 0.5;
       vec3 soulHere = uSoulColor1 * m1 + uSoulColor2 * (1.0 - m1) * m2 + uSoulColor3 * (1.0 - m1) * (1.0 - m2);
       vec3 kickCol = soulHere.brg;
       float kickMix = clamp(uKickTransient * 4.0, 0.0, 0.7) * exp(-marchDist * 1.5);
       vec3 filamentColor = mix(soulHere, kickCol, kickMix);

       // Persistent pulse ride — a faint continuous traveling wave that gives
       // the "we're moving through the network" feeling even without kicks.
       // Tinted with the archetype's 4th color for contrast. Always present.
       float rideWave = max(0.0, sin(marchDist * 0.65 - uTime * 1.3));
       filamentColor += uSoulColor4 * rideWave * 0.4;

       // Close proximity glow — eased in from low bass (ship's steady halo)
       float shipVisibility = smoothstep(0.04, 0.15, uBass);
       float loudnessFade = 1.0 / (1.0 + uRms * 2.5);
       float closeGlow = exp(-marchDist * marchDist * 0.35) * (uBass * 0.6 + uKickTransient * 0.8);
       float shipLight = closeGlow * shipVisibility * loudnessFade;
       vec3 shipLightColor = mix(vec3(0.5, 0.7, 1.0), vec3(1.0, 0.6, 0.3), clamp(uKickTransient * 4.0, 0.0, 1.0));
       filamentColor += shipLightColor * shipLight * 0.1;

       // Gentler depth fade so distant filaments remain visible when a traveling
       // pulse arrives — the wave can actually illuminate far structure.
       float depthFade = exp(-marchDist * 0.14);

       float alpha = min(density * stepSize * 3.0, 1.0 - totalDensity);
       // Base visibility always — structures are seen in silence.
       // Music lights them up brighter on top.
       float ambient = 3.0;
       float musicLight = uRms * 1.5 + uBass * 0.8;
       col += filamentColor * chromShift * density * alpha * depthFade * brightMod * (ambient + musicLight);
       totalDensity += alpha;
       if (totalDensity > 0.95) break;
     }

     float silentBreath = sin(uTime * 0.4) * 0.15 + 0.85;
     float musicBreath = sin(uBeatPhase * 6.2831) * 0.2 + 0.8 + uOnset * 0.15;
     float breath = mix(musicBreath, silentBreath, uSilence);
     col *= 0.6 + 1.1 * breath;

     float lum = dot(col, vec3(0.299, 0.587, 0.114));
     col = mix(vec3(lum), col, 1.55);

     vec3 voidColor = uSoulColor2 * (0.3 + uFlatness * 0.2);
     col += voidColor * max(0.0, 0.15 - totalDensity) * 1.5;

     // === BASS SHIP ===
     // Driven by uSubBass (0-85 Hz) ONLY — kick fundamentals and sub drops.
     // Vocals, snares, mids don't trigger it.
     float shipDist = length(st - shipPos);
     float kickPulse = clamp(uKickTransient * 5.0, 0.0, 1.0);

     float expansion = 1.0 + uSubBass * 15.0 + kickPulse * 30.0;
     // Sharper falloff (2500 vs 1500) — tighter core with crisper outline
     float falloff = 2500.0 / expansion;
     float shipEmerge = smoothstep(0.03, 0.1, uSubBass);

     // Plasma field — silent ship = clean pinpoint, loud sub-bass = roiling plasma
     vec2 plasmaCoord = (st - shipPos) * (14.0 / sqrt(expansion));
     float plasma1 = snoise(vec3(plasmaCoord, uTime * 3.2)) * 0.5 + 0.5;
     float plasma2 = snoise(vec3(plasmaCoord * 0.55 + vec2(4.7, 1.9), uTime * 2.1)) * 0.5 + 0.5;
     float plasmaField = plasma1 * plasma2;
     float plasmaMix = clamp(0.08 + uSubBass * 1.3 + kickPulse * 0.5, 0.0, 1.0);

     // Body — the ship's sustained radiance. Heavily plasma-modulated so
     // the roiling texture is fully expressed during loud sub-bass.
     float coreBody = exp(-shipDist * shipDist * falloff);
     coreBody *= shipEmerge * (2.0 + uSubBass * 3.0);
     coreBody *= mix(1.0, 0.4 + plasmaField * 1.6, plasmaMix);

     // Kick flash — separate component, NOT plasma-modulated, slightly
     // wider falloff so it reads as a clean punch cutting through the roil.
     // This is what makes the bass pulse visible even during hot plasma.
     float kickFlash = exp(-shipDist * shipDist * falloff * 0.75);
     kickFlash *= shipEmerge * kickPulse * 4.2;

     float coreGlow = coreBody + kickFlash;

     // Aura — reduced amplitude so it reads as a subtle local coherence of
     // light around the core, not as the ship's primary visual signature.
     float flareGlow = exp(-shipDist * shipDist * (8.0 / (1.0 + uSubBass * 4.0 + kickPulse * 8.0)));
     flareGlow *= uSubBass * 0.25 + kickPulse * 0.4;

     vec2 trailSt = st - shipPos;
     float trailY = trailSt.y + 0.15;
     float trailDist = abs(trailSt.x) * 3.0 + max(0.0, trailY) * 1.5;
     float trail = exp(-trailDist * trailDist * 6.0) * max(0.0, trailY);
     trail *= uSubBass * 1.0;

     vec3 coreColor = mix(vec3(0.9, 0.95, 1.0), vec3(1.0, 0.7, 0.3), kickPulse);
     vec3 flareColor = mix(uSoulColor1 * 0.5 + vec3(0.3, 0.4, 0.7), uSoulColor1.gbr, kickPulse * 0.6);
     vec3 trailColor = mix(vec3(0.2, 0.4, 0.8), uSoulColor2, 0.4);

     // Tone-map the FILAMENT scene only — prevents near-bass blow-out
     // without crushing the ship core which is designed to internally go HDR
     // and produce a searing white-hot radiance on output clip.
     col = vec3(1.0) - exp(-col * 0.6);

     // Ship added after tone-mapping so its full internal brightness
     // (up to ~9x) still clips to brilliant white-hot on the display.
     col += coreColor * coreGlow + flareColor * flareGlow + trailColor * trail;

     float vigDist = length(vUv - 0.5) * 1.4;
     float vig = smoothstep(1.1, 0.45, vigDist);
     col *= vig;

     gl_FragColor = vec4(col, 1.0);
   }`
);

// ============================================================
// Cache uniform locations for BOTH programs
// ============================================================
function getLocs(prog) {
  return {
    aPos: gl.getAttribLocation(prog, 'aPos'),
    uTime: gl.getUniformLocation(prog, 'uTime'),
    uSeed: gl.getUniformLocation(prog, 'uSeed'),
    uZoom: gl.getUniformLocation(prog, 'uZoom'),
    uChurnAmt: gl.getUniformLocation(prog, 'uChurnAmt'),
    uHolePulse: gl.getUniformLocation(prog, 'uHolePulse'),
    uKickTransient: gl.getUniformLocation(prog, 'uKickTransient'),
    uCameraZ: gl.getUniformLocation(prog, 'uCameraZ'),
    uCameraAngle: gl.getUniformLocation(prog, 'uCameraAngle'),
    uFov: gl.getUniformLocation(prog, 'uFov'),
    uCamPos: gl.getUniformLocation(prog, 'uCamPos'),
    uCamDir: gl.getUniformLocation(prog, 'uCamDir'),
    uTimeSinceKick: gl.getUniformLocation(prog, 'uTimeSinceKick'),
    uShipDeathAge: gl.getUniformLocation(prog, 'uShipDeathAge'),
    uPulseAges: gl.getUniformLocation(prog, 'uPulseAges'),
    uPulseAges2: gl.getUniformLocation(prog, 'uPulseAges2'),
    uSoulColor1: gl.getUniformLocation(prog, 'uSoulColor1'),
    uSoulColor2: gl.getUniformLocation(prog, 'uSoulColor2'),
    uSoulColor3: gl.getUniformLocation(prog, 'uSoulColor3'),
    uSoulColor4: gl.getUniformLocation(prog, 'uSoulColor4'),
    uRes: gl.getUniformLocation(prog, 'uRes'),
    uSpectrum: gl.getUniformLocation(prog, 'uSpectrum'),
    uSubBass: gl.getUniformLocation(prog, 'uSubBass'),
    uBass: gl.getUniformLocation(prog, 'uBass'),
    uLowMid: gl.getUniformLocation(prog, 'uLowMid'),
    uMid: gl.getUniformLocation(prog, 'uMid'),
    uHighMid: gl.getUniformLocation(prog, 'uHighMid'),
    uAir: gl.getUniformLocation(prog, 'uAir'),
    uRms: gl.getUniformLocation(prog, 'uRms'),
    uOnset: gl.getUniformLocation(prog, 'uOnset'),
    uBeatPhase: gl.getUniformLocation(prog, 'uBeatPhase'),
    uCentroid: gl.getUniformLocation(prog, 'uCentroid'),
    uFlatness: gl.getUniformLocation(prog, 'uFlatness'),
    uFlux: gl.getUniformLocation(prog, 'uFlux'),
    uSilence: gl.getUniformLocation(prog, 'uSilence'),
    uSidechain: gl.getUniformLocation(prog, 'uSidechain'),
  };
}
const loc2D = getLocs(prog2D);
const loc3D = getLocs(prog3D);
let currentMode = '2d';
let loc = loc2D;

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
let userZoom = 5.0;
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (currentMode === '2d') {
    userZoom *= e.deltaY > 0 ? 1.08 : 0.92;
    userZoom = Math.max(0.2, Math.min(5.0, userZoom));
  }
  // 3D mode: scroll disabled — fixed zoom
}, { passive: false });

// ============================================================
// Soul state — evolves from audio
// ============================================================
const soul = {
  seed: 0,
  // Start at zero — colors earn themselves from the audio data
  hue1: 0, hue2: 0, hue3: 0, hue4: 0,
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

// Color archetypes — each defines a 4-hue palette.
// The fourth hue is reserved for the traveling pulse ride — a contrasting
// color so the pulse reads as distinctly "the pulse" riding through the scene.
const ARCHETYPES = [
  // EMERGENT — curated jewel-tone palette. Skips muddy yellow-green (0.15-0.22)
  // and harsh ochre (0.08-0.12). Favors high-chroma violet/magenta/teal/crimson.
  { name: 'EMERGENT', mode: 'curated', vibrance: 1.7,
    palette: [0.78, 0.55, 0.03, 0.93, 0.42, 0.66, 0.98, 0.30] },
  // SPECTRUM — pure raw triadic from fingerprint, no palette constraint
  { name: 'SPECTRUM', mode: 'triadic', vibrance: 1.0 },
  // Styled palettes — four base hues. Fourth is intentionally contrasting
  // for pulse ride. Fingerprint nudges each within jitter range.
  { name: 'AURORA',   baseHues: [0.40, 0.78, 0.55, 0.08], jitter: 0.05, vibrance: 1.2 }, // green-violet-cyan / amber
  { name: 'EMBER',    baseHues: [0.02, 0.08, 0.96, 0.55], jitter: 0.04, vibrance: 1.3 }, // red-orange-crimson / teal
  { name: 'OCEAN',    baseHues: [0.52, 0.60, 0.45, 0.03], jitter: 0.05, vibrance: 1.2 }, // cyan-indigo-teal / coral
  { name: 'COSMIC',   baseHues: [0.75, 0.92, 0.63, 0.38], jitter: 0.06, vibrance: 1.3 }, // violet-magenta-deep blue / emerald
  { name: 'CHLOROPHYLL', baseHues: [0.30, 0.38, 0.22, 0.92], jitter: 0.04, vibrance: 1.2 }, // green-teal-lime / magenta
  { name: 'VOID',     baseHues: [0.00, 0.00, 0.00, 0.00], jitter: 0.00, vibrance: 0.4 }, // grayscale
];
let archetypeIndex = 0;

// Target hues derived via SIMILARITY-PRESERVING mapping (Lipschitz-continuous).
// Similar songs → similar colors; different songs → different colors.
// Replaces the old chaotic irrational-constant hash.
//
// Design (synthesized from color perception + MIR research):
//   - centroid + high bands → hue via tanh (warps narrow-music-range to fill wheel)
//   - bass vs air balance → secondary hue rotation (two songs with same centroid
//     but different low/high emphasis land in different regions)
//   - triadic siblings at 120° and 240° → three perceptually distinct output hues
//   - archetype window wraps the result (EMERGENT archetype uses full range)
function fingerprintTargetHues() {
  const fp = songFingerprint;
  const wrap = x => ((x % 1) + 1) % 1;

  // === Shared fingerprint signals — same methodology for all archetypes ===
  const total = fp.bass + fp.lowMid + fp.mid + fp.highMid + fp.air + 0.01;
  const r0 = fp.bass / total;
  const r1 = fp.lowMid / total;
  const r2 = fp.mid / total;
  const r3 = fp.highMid / total;
  const r4 = fp.air / total;

  // Spectral tilt — weighted center of mass [0,1]. Primary axis.
  const tilt = (r1 * 0.25 + r2 * 0.5 + r3 * 0.75 + r4 * 1.0);
  // Peakiness — how concentrated the spectrum is. Secondary axis.
  const peakiness = Math.max(r0, r1, r2, r3, r4);
  const spread = Math.max(0, (peakiness - 0.25) * 1.5);
  // Centroid shift — tertiary axis.
  const centroidShift = fp.centroid - 0.15;

  const arch = ARCHETYPES[archetypeIndex];

  // === EMERGENT — curated jewel-tone palette, analogous triad ===
  // h1 lerps between adjacent palette entries as fingerprint shifts.
  // h2 and h3 are ANALOGOUS to h1 (close on the wheel, ±0.09) so the shader's
  // 3-way blend doesn't average distant hues into gray — colors stay saturated.
  // h4 comes from the opposite side of the palette for pulse-ride contrast.
  if (arch.mode === 'curated') {
    const p = arch.palette;
    const pos = wrap(tilt * 1.2 + spread * 0.15 + centroidShift * 0.1);
    const idxF = pos * p.length;
    const i0 = Math.floor(idxF) % p.length;
    const f = idxF - Math.floor(idxF);
    const lerpP = (a, b, t) => {
      let d = p[b] - p[a];
      if (d > 0.5) d -= 1; if (d < -0.5) d += 1;
      return wrap(p[a] + d * t);
    };
    // h1 from the palette — the song's signature hue this moment.
    // h2, h3 are analogous (±0.09 on the wheel = ~32°) so they blend into
    // the same hue family instead of averaging to gray when mixed.
    // h4 from the opposite side for pulse-ride contrast.
    const h1 = lerpP(i0, (i0 + 1) % p.length, f);
    const h2 = wrap(h1 + 0.09);
    const h3 = wrap(h1 - 0.09);
    const h4 = lerpP((i0 + 4) % p.length, (i0 + 5) % p.length, f);
    return [h1, h2, h3, h4];
  }

  // === SPECTRUM — pure triadic + complementary for pulse ===
  if (arch.mode === 'triadic') {
    const hueBase = 0.5 + 0.5 * Math.tanh((tilt - 0.35) * 5.0);
    const h1 = wrap(hueBase + 0.12 * spread + 0.08 * centroidShift);
    return [h1, wrap(h1 + 0.333), wrap(h1 + 0.666), wrap(h1 + 0.5)];
  }

  // === Styled palettes ===
  const [b1, b2, b3, b4] = arch.baseHues;
  const j = arch.jitter;
  const n1 = (tilt - 0.5) * 2 * j;
  const n2 = (spread - 0.5) * 2 * j * 0.8;
  const n3 = centroidShift * 2 * j * 0.6;
  const n4 = (tilt - 0.5) * 2 * j * 0.5;
  return [wrap(b1 + n1), wrap(b2 + n2), wrap(b3 + n3), wrap(b4 + n4)];
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
  const [t1, t2, t3, t4] = fingerprintTargetHues();
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
  soul.hue4 = lerpHue(soul.hue4, t4, ease);

  // Saturation from spectral variance
  const satTarget = 0.55 + frame.flux * 0.35 + (1 - frame.flatness) * 0.15;
  soul.saturation += (satTarget - soul.saturation) * 0.02;
  soul.saturation = Math.max(0.45, Math.min(0.95, soul.saturation));
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
  // Flatness-driven saturation: tonal music → saturated, noisy → desaturated.
  // flatSat ranges ~0.6 (noisy) to ~1.0 (pure tonal) since flatness is usually < 0.4
  const flatSat = 1.0 - 0.6 * (songFingerprint.flatness || 0.3);
  const s = Math.min(1, Math.max(0.3, soul.saturation * flatSat * 1.4 * vibrance));
  return {
    c1: hsl2rgb(soul.hue1, s, 0.58),
    c2: hsl2rgb(soul.hue2, s * 0.95, 0.52),
    c3: hsl2rgb(soul.hue3, s, 0.56),
    c4: hsl2rgb(soul.hue4, Math.min(1, s * 1.05), 0.60), // pulse ride — slightly brighter + saturated
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
// Resolution switching for mode changes
// ============================================================
function setResolution(dpr) {
  activeDPR = dpr;
  W = Math.round(window.innerWidth * activeDPR);
  H = Math.round(window.innerHeight * activeDPR);
  canvas.width = W; canvas.height = H;
  // CSS stays fullscreen — GPU renders at internal res, browser upscales
  gl.viewport(0, 0, W, H);
}

// ============================================================
// Render loop
// ============================================================
let lastTime = performance.now();
let simTime = 0;
let churnAmt = 0;   // smoothed churn amplitude with fast attack / slow decay
let churnSlow = 0;  // slow follower of churnAmt — lags behind so (churnAmt - churnSlow) undershoots after peak
let bassFloor = 0;  // slow EMA tracking sustained bassline
let timeSinceKick = 10;  // seconds since last kick — drives traveling sonar wave
let pulseAges = [99, 99, 99, 99, 99, 99];  // 6 active kick-pulses so long-lived waves aren't evicted
// Signal (2D) uses a SEPARATE pulse tracker — only deep sub-bass hits spawn
// pulses, AND a cooldown ensures each wave fully travels before the next fires.
let pulseAgesDeep = [99, 99, 99, 99, 99, 99];
let timeSinceDeepKick = 999;
// Visual sidechain — ducks non-pulse visuals on kicks so the kick cuts
// through the bassline (same idea as audio sidechain compression).
let sidechainEnv = 0;
let shipAlive = false;   // tracks bass presence
let shipDeathAge = 10;   // seconds since ship dissipated — drives death flash
let camX = 0, camY = 0, camZ = 0;    // camera position in noise space
let camDirX = 0, camDirY = 0, camDirZ = 1;  // smoothed heading direction
let fpsEMA = 60;    // exponentially-smoothed FPS
const diag = document.getElementById('diag');

// Mode switching UI + info strip elements
const btn2D = document.getElementById('mode-2d');
const btn3D = document.getElementById('mode-3d');
const _archEl = document.getElementById('info-arch');
const _fpsEl = document.getElementById('info-fps');
if (_archEl) _archEl.addEventListener('click', () => {
  archetypeIndex = (archetypeIndex + 1) % ARCHETYPES.length;
});
btn2D.addEventListener('click', () => { currentMode = '2d'; loc = loc2D; setResolution(DPR_2D); btn2D.classList.add('active'); btn3D.classList.remove('active'); });
btn3D.addEventListener('click', () => { currentMode = '3d'; loc = loc3D; setResolution(DPR_3D); btn3D.classList.add('active'); btn2D.classList.remove('active'); });

function render(now) {
  requestAnimationFrame(render);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  simTime += dt;

  // FPS — EMA of instantaneous 1/dt
  if (dt > 0) {
    const instFps = 1 / dt;
    fpsEMA += (instFps - fpsEMA) * 0.05;
  }


  // Get audio frame
  const freqData = getFreqData();
  if (freqData) {
    latestFrame = analyzer.analyze(freqData, now, dt);
  }

  // Default frame if no audio yet
  const frame = latestFrame || {
    spectrum: new Float32Array(64),
    subBass: 0, bass: 0, bassRaw: 0, subBassRaw: 0,
    lowMid: 0, mid: 0, highMid: 0, air: 0,
    rms: 0, centroid: 0.5, flatness: 0, flux: 0,
    onset: 0, silence: 1, bpm: 120, beatPhase: 0,
    kickness: 0, isKick: false
  };

  // Feed soul — audio bytes drift the hues, same math as the original Signal
  feedSoul(frame, dt, freqData);

  // === Churn amplitude envelope ===
  // Bass-gated onset so only kicks punch through, not snares/hi-hats.
  // Asymmetric envelope: fast attack (~40ms), slow decay (~250ms) so
  // kicks BOOM and flow out smoothly without frame jitter.
  const bassGate = frame.bass < 0.18 ? 0 :
                   frame.bass > 0.55 ? 1 :
                   (frame.bass - 0.18) / (0.55 - 0.18);
  const gatedOnset = frame.onset * bassGate;

  // Track sustained bass floor (~500ms EMA)
  bassFloor += (frame.bass - bassFloor) * (1 - Math.exp(-dt * 2));
  // Kick = spike above the floor
  const kickTransient = Math.max(0, frame.bass - bassFloor);

  // Reset wave age on each kick, otherwise the wave keeps traveling outward
  if (kickTransient > 0.06) timeSinceKick = 0;
  timeSinceKick += dt;

  // 6-slot pulse ring buffer — Wanderer uses the original kickTransient
  // threshold (more responsive on fast kick patterns) while 2D Signal below
  // uses the adaptive detector.
  if (kickTransient > 0.08) {
    pulseAges = [0, pulseAges[0], pulseAges[1], pulseAges[2], pulseAges[3], pulseAges[4]];
  }
  pulseAges = pulseAges.map(a => a + dt);

  // Deep-hit pulses (for Signal 2D only) — require strong sub-bass presence
  // AND a cooldown (1.1s ~ wave travel time) so each pulse fully expands
  // before the next one fires. Still uses adaptive detector — the sub-bass
  // threshold just gates to songs where there's real sub content.
  timeSinceDeepKick += dt;
  if (frame.isKick && frame.subBass > 0.35 && timeSinceDeepKick > 1.1) {
    pulseAgesDeep = [0, pulseAgesDeep[0], pulseAgesDeep[1], pulseAgesDeep[2], pulseAgesDeep[3], pulseAgesDeep[4]];
    timeSinceDeepKick = 0;
  }
  pulseAgesDeep = pulseAgesDeep.map(a => a + dt);

  // Visual sidechain — driven by continuous `kickness` from adaptive detector.
  // Fast attack (~18ms), standard decay (~200ms).
  const sidechainTarget = frame.kickness;
  if (sidechainTarget > sidechainEnv) {
    sidechainEnv += (sidechainTarget - sidechainEnv) * (1 - Math.exp(-dt * 55));
  } else {
    sidechainEnv += (sidechainTarget - sidechainEnv) * (1 - Math.exp(-dt * 5));
  }

  // Ship death detection — when bass falls, spawn an expanding radiant burst
  const currentlyAlive = frame.bass > 0.08;
  if (shipAlive && !currentlyAlive) shipDeathAge = 0;
  shipAlive = currentlyAlive;
  shipDeathAge += dt;

  // Original GLORIOUS formula + extra kick transient punch on top.
  // Bass oscillation (sin) prevents freeze during sustained bass —
  // bounded, never drifts, just sways the center gently.
  const bassOsc = Math.sin(simTime * 2.0) * bassFloor * 2.5;
  const churnTarget = frame.bass * 13.0 + frame.lowMid * 1.5 + gatedOnset * 14.0
                    + kickTransient * 36.0 + bassOsc;
  const churnRate = churnTarget > churnAmt
    ? (1 - Math.exp(-dt * 55))   // attack ~18ms — faster response to rapid kicks
    : (1 - Math.exp(-dt * 55));  // decay ~18ms — pulse fully resets between fast kicks
  churnAmt += (churnTarget - churnAmt) * churnRate;
  churnAmt = Math.min(churnAmt, 30);  // hard cap — prevents phase distortion on heavy kicks

  // Slow-following twin of churnAmt — lags behind. On spike: fast > slow (positive pulse).
  // On decay: fast drops fast, slow lags → (fast - slow) goes NEGATIVE → rebound/undershoot.
  // Result: hole grows on kick, snaps back, undershoots below baseline, settles.
  churnSlow += (churnAmt - churnSlow) * (1 - Math.exp(-dt * 6));

  // === 3D camera — wanders through noise space ===
  // Target direction via slow irrational-rate oscillations — never repeats
  const PHI = 1.61803, EU = 2.71828;
  let tgtX = Math.sin(simTime * 0.071 * PHI) * Math.cos(simTime * 0.13);
  let tgtY = Math.cos(simTime * 0.093) * Math.sin(simTime * 0.11 * EU);
  const tgtZ = 0.6 + Math.sin(simTime * 0.053) * 0.35;

  // Bias the camera heading toward the ship's current screen position so
  // the ship more often lands in the forward/center of the view — reads as
  // "we're following the ship." Ship position mirrored from the shader.
  const shipX = Math.sin(simTime * 0.15 * PHI) * 0.14 + Math.cos(simTime * 0.09 * EU) * 0.1 + Math.sin(simTime * 0.05) * 0.07;
  const shipY = Math.cos(simTime * 0.11 * PHI) * 0.12 + Math.sin(simTime * 0.08 * EU) * 0.1 + Math.cos(simTime * 0.06) * 0.08;
  tgtX += shipX * 0.8;
  tgtY += shipY * 0.8;

  // Smooth heading — graceful turns
  const dirEase = 1 - Math.exp(-dt * 0.8);
  camDirX += (tgtX - camDirX) * dirEase;
  camDirY += (tgtY - camDirY) * dirEase;
  camDirZ += (tgtZ - camDirZ) * dirEase;

  // Normalize
  const dirLen = Math.sqrt(camDirX * camDirX + camDirY * camDirY + camDirZ * camDirZ) || 1;
  const nX = camDirX / dirLen, nY = camDirY / dirLen, nZ = camDirZ / dirLen;

  // Reverse modulation — occasionally the camera flies backwards through the
  // noise so filaments stream toward us. Since the ship is a screen-space
  // overlay that stays put, this reads as the ship traveling toward the camera
  // instead of away from it. Biased toward forward (spends more time at +1).
  const reverseCycle =
    Math.sin(simTime * 0.031) * 0.7 +
    Math.cos(simTime * 0.013 * PHI) * 0.5 +
    Math.sin(simTime * 0.019 * EU) * 0.3 +
    0.35;  // bias toward forward — reverse is occasional, not half the time
  const reverseScalar = Math.tanh(reverseCycle * 1.4);

  // Separate wander speed (can reverse) from kick boost (always forward).
  // Kick boost in reverse direction would fly the camera backward faster than
  // the pulse's forward wavespeed, making the wavefront appear to regress.
  // Reverse is also capped at 40% to keep world-flow slower than wave-travel.
  const wanderScalar = reverseScalar < 0 ? reverseScalar * 0.4 : reverseScalar;
  const baseSpeed = (0.25 + bassFloor * 1.0) * wanderScalar;
  const kickBoost = kickTransient * 6.0 * Math.max(0, reverseScalar);
  const speed = baseSpeed + kickBoost;
  camX += dt * speed * nX;
  camY += dt * speed * nY;
  camZ += dt * speed * nZ;

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
  const prog = currentMode === '3d' ? prog3D : prog2D;
  gl.useProgram(prog);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, specTex);
  gl.uniform1i(loc.uSpectrum, 0);

  gl.uniform1f(loc.uTime, simTime);
  gl.uniform1f(loc.uSeed, soul.seed);
  // 3D gets a fixed zoom — no scroll. 2D uses userZoom.
  const zoom = currentMode === '3d' ? 1.35 : userZoom;
  gl.uniform1f(loc.uZoom, zoom);
  gl.uniform1f(loc.uChurnAmt, churnAmt);
  gl.uniform1f(loc.uHolePulse, churnAmt - churnSlow);
  gl.uniform1f(loc.uKickTransient, kickTransient);
  gl.uniform3f(loc.uSoulColor1, sc.c1[0], sc.c1[1], sc.c1[2]);
  gl.uniform3f(loc.uSoulColor2, sc.c2[0], sc.c2[1], sc.c2[2]);
  gl.uniform3f(loc.uSoulColor3, sc.c3[0], sc.c3[1], sc.c3[2]);
  if (loc.uSoulColor4) gl.uniform3f(loc.uSoulColor4, sc.c4[0], sc.c4[1], sc.c4[2]);
  gl.uniform2f(loc.uRes, W, H);
  gl.uniform1f(loc.uSubBass, frame.subBass || 0);
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
  if (loc.uSidechain) gl.uniform1f(loc.uSidechain, sidechainEnv);

  // 3D-specific uniforms (harmlessly ignored by 2D program)
  if (loc.uCameraZ) gl.uniform1f(loc.uCameraZ, camZ);
  if (loc.uCameraAngle) gl.uniform1f(loc.uCameraAngle, Math.atan2(camDirX, camDirZ));
  if (loc.uCamPos) gl.uniform3f(loc.uCamPos, camX, camY, camZ);
  if (loc.uCamDir) gl.uniform3f(loc.uCamDir, camDirX, camDirY, camDirZ);
  if (loc.uTimeSinceKick) gl.uniform1f(loc.uTimeSinceKick, timeSinceKick);
  if (loc.uShipDeathAge) gl.uniform1f(loc.uShipDeathAge, shipDeathAge);
  // 2D Signal uses deep-hit-only pulses; Wanderer uses the standard ring
  const activePulses = currentMode === '2d' ? pulseAgesDeep : pulseAges;
  if (loc.uPulseAges) gl.uniform3f(loc.uPulseAges, activePulses[0], activePulses[1], activePulses[2]);
  if (loc.uPulseAges2) gl.uniform3f(loc.uPulseAges2, activePulses[3], activePulses[4], activePulses[5]);
  if (loc.uFov) gl.uniform1f(loc.uFov, 0.8);

  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(loc.aPos);
  gl.vertexAttribPointer(loc.aPos, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.disableVertexAttribArray(loc.aPos);

  // Info strip — elegant, minimal
  if (_archEl) _archEl.textContent = ARCHETYPES[archetypeIndex].name;
  if (_fpsEl) _fpsEl.textContent = Math.round(fpsEMA) + ' fps';
}

// ============================================================
// Resize
// ============================================================
window.addEventListener('resize', () => {
  W = Math.round(window.innerWidth * activeDPR);
  H = Math.round(window.innerHeight * activeDPR);
  canvas.width = W; canvas.height = H;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  gl.viewport(0, 0, W, H);
});

requestAnimationFrame(render);
