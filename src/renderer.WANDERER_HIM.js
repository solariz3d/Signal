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
     bands[0] = mix(baseLine, 1.245, uBass);
     bands[1] = mix(baseLine, 1.0925, uLowMid);
     bands[2] = mix(baseLine, 0.9975, uMid);
     bands[3] = mix(baseLine, 0.95, uHighMid);

     float onsetBoost = 1.0 + uOnset * 0.665;

     // Center perturbation — offset downward so the pull origin sits
     // where the apparent core of the structure is, not geometric (0,0).
     vec2 pullCenter = vec2(0.0, -0.10);
     float pullRad = length(st - pullCenter);
     // Kick expands the pulse radius — breathes larger on transients
     float pulseRadius = 0.32 + uKickTransient * 0.15;
     float centerWeight = smoothstep(pulseRadius, 0.0, pullRad);
     centerWeight = pow(centerWeight, 1.6);
     // Churn amplitude is smoothed in JS (uChurnAmt) with a fast-attack /
     // slow-decay envelope, so the noise time-shift flows smoothly even
     // when bass spikes hard. No more frame-to-frame jitter.
     float centerChurn = centerWeight * uChurnAmt;

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

     // === Spiral spectrum — smooth, no seam ===
     // Combine radius with a periodic (sin/cos) function of angle so there's
     // no atan discontinuity. Low freq at center, high freq outward, spiraling.
     float ang = atan(st.y, st.x);
     float angShift = sin(ang) * 0.1 + cos(ang * 2.0) * 0.05;
     float spiralCoord = clamp((rad + angShift) / 1.3, 0.0, 1.0);
     float specHere = texture2D(uSpectrum, vec2(spiralCoord, 0.5)).r;
     float specContribution = specHere * 0.38 * (1.0 - uSilence);
     n += specContribution * exp(-abs(rad - spiralCoord * 1.3) * 3.0);

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
     // Dim the center region slightly so it doesn't out-blow the edges —
     // churn + saturation boost was stacking too much brightness there.
     float centerDim = mix(0.72, 1.0, smoothstep(0.0, 0.55, pullRad));
     col += ridgeColor * n * (1.3 + uRms * 0.8) * centerDim;

     // Void glow — more vivid secondary color (KICK_REFINED values)
     vec3 voidColor = uSoulColor2 * (0.5 + uFlatness * 0.3);
     col += voidColor * max(0.0, 0.12 - n) * 3.5;

     // Ridge hot edges — flare on onset, brighter
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
   uniform vec3 uSoulColor1, uSoulColor2, uSoulColor3;
   uniform vec2 uRes;
   uniform sampler2D uSpectrum;
   uniform float uBass, uLowMid, uMid, uHighMid, uAir;
   uniform float uRms, uOnset, uBeatPhase, uCentroid, uFlatness, uFlux;
   uniform float uSilence;
   varying vec2 vUv;

   float ridgedFBM(vec3 p, float t, float seed, float churn) {
     float baseLine = 0.35 + 0.35 * uSilence;
     float bands[4];
     bands[0] = mix(baseLine, 1.245, uBass);
     bands[1] = mix(baseLine, 1.0925, uLowMid);
     bands[2] = mix(baseLine, 0.9975, uMid);
     bands[3] = mix(baseLine, 0.95, uHighMid);
     float onsetBoost = 1.0 + uOnset * 0.665;
     // Start at lower frequency (0.5) so structures are bigger/chunkier
     // like the 2D mode. 3 octaves instead of 4 — less fine mist.
     float n = 0.0, amp = 0.6, freq = 0.4;
     for (int i = 0; i < 2; i++) {
       float raw = snoise(p * freq + vec3(0., 0., t + float(i) * 1.7 + seed + churn));
       float ridge = 1.0 - abs(raw);
       float band = (i == 0) ? bands[0] : (i == 1) ? bands[1] : (i == 2) ? bands[2] : bands[3];
       n += amp * ridge * band * onsetBoost;
       freq *= 2.0; amp *= 0.5;
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

     // Ship position — defined early so the raymarcher can use it for lighting
     vec2 shipPos = vec2(
       sin(uTime * 0.13) * 0.15 + cos(uTime * 0.07) * 0.08,
       cos(uTime * 0.11) * 0.12 + sin(uTime * 0.09) * 0.06
     );

     vec3 col = vec3(0.0);
     float totalDensity = 0.0;
     float stepSize = 0.28;

     for (int i = 0; i < 70; i++) {
       float marchDist = float(i) * stepSize;
       vec3 p = (camPos + rd * marchDist) * uZoom;
       float churn = uChurnAmt * 0.15 * exp(-marchDist * 0.5);
       float density = ridgedFBM(p, t, uSeed, churn);
       if (density < 0.05) continue;
       density = smoothstep(0.05, 0.30, density) * 1.2;

       float m1 = snoise(p * 0.3 + vec3(1., 0., t * 0.15 + uSeed * 3.)) * 0.5 + 0.5;
       float m2 = snoise(p * 0.25 + vec3(-2., 0., t * 0.12 + uSeed * 5.)) * 0.5 + 0.5;
       vec3 soulHere = uSoulColor1 * m1 + uSoulColor2 * (1.0 - m1) * m2 + uSoulColor3 * (1.0 - m1) * (1.0 - m2);
       vec3 kickCol = soulHere.brg;
       float kickMix = clamp(uKickTransient * 4.0, 0.0, 0.7) * exp(-marchDist * 1.5);
       vec3 filamentColor = mix(soulHere, kickCol, kickMix);

       // === Sonar wave + close glow ===
       // Wave lives its own life once launched — doesn't disappear when
       // bass drops between kicks. Close glow eased in from low bass so
       // the ship has presence even at moderate volumes.
       float shipVisibility = smoothstep(0.04, 0.15, uBass);
       float loudnessFade = 1.0 / (1.0 + uRms * 2.5);

       // Expanding shell — only gated by age, not by current bass
       float waveSpeed = 3.0;
       float waveFrontDist = uTimeSinceKick * waveSpeed;
       float waveWidth = 1.4;
       float shell = exp(-pow(marchDist - waveFrontDist, 2.0) / (waveWidth * waveWidth));
       float waveFade = exp(-uTimeSinceKick * 0.5);  // ~4 second lifespan

       // Close proximity glow — eased in from low bass
       float closeGlow = exp(-marchDist * marchDist * 0.35) * (uBass * 0.6 + uKickTransient * 0.8);

       // Wave travels independent of current bass (survives even if bass drops)
       // Close glow gated by shipVisibility so it fades cleanly in silence
       float shipLight = shell * waveFade * 2.5 + closeGlow * shipVisibility;
       shipLight *= loudnessFade;

       vec3 shipLightColor = mix(vec3(0.5, 0.7, 1.0), vec3(1.0, 0.6, 0.3), clamp(uKickTransient * 4.0, 0.0, 1.0));
       filamentColor += shipLightColor * shipLight * 0.18;

       float depthFade = exp(-marchDist * 0.25);

       float alpha = min(density * stepSize * 3.0, 1.0 - totalDensity);
       // Base visibility always — structures are seen in silence.
       // Music lights them up brighter on top.
       float ambient = 3.0;
       float musicLight = uRms * 1.5 + uBass * 0.8;
       col += filamentColor * density * alpha * depthFade * (ambient + musicLight);
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
     // Quiet: tiny bright radiant dot. Loud: violently expands into full glow.
     // The dot IS always there — bass just explodes it outward.
     float shipDist = length(st - shipPos);
     float kickPulse = clamp(uKickTransient * 5.0, 0.0, 1.0);

     // Dot falloff coefficient — high (tight dot) at silence, low (wide glow) at bass.
     // Bass pulls the spread wider; kicks violently dilate it.
     float expansion = 1.0 + uBass * 15.0 + kickPulse * 30.0;
     // Very high falloff at silence = true pinpoint. Spreads as bass grows.
     float falloff = 1500.0 / expansion;
     float coreGlow = exp(-shipDist * shipDist * falloff);
     // Sharp emergence threshold: silence = 0, but the moment bass arrives
     // the pinpoint snaps in at a respectable baseline. Bass/kicks push it
     // further upward from there — the MAX is what gets emphasized.
     float shipEmerge = smoothstep(0.03, 0.1, uBass);
     coreGlow *= shipEmerge * (1.2 + uBass * 2.0 + kickPulse * 2.8);

     // Outer flare — only appears with bass, expands dramatically with it
     float flareGlow = exp(-shipDist * shipDist * (8.0 / (1.0 + uBass * 4.0 + kickPulse * 8.0)));
     flareGlow *= uBass * 0.6 + kickPulse * 1.0;

     // Trail — only when bass is present
     vec2 trailSt = st - shipPos;
     float trailY = trailSt.y + 0.15;
     float trailDist = abs(trailSt.x) * 3.0 + max(0.0, trailY) * 1.5;
     float trail = exp(-trailDist * trailDist * 6.0) * max(0.0, trailY);
     trail *= uBass * 1.0;

     vec3 coreColor = mix(vec3(0.9, 0.95, 1.0), vec3(1.0, 0.7, 0.3), kickPulse);
     vec3 flareColor = mix(uSoulColor1 * 0.5 + vec3(0.3, 0.4, 0.7), uSoulColor1.gbr, kickPulse * 0.6);
     vec3 trailColor = mix(vec3(0.2, 0.4, 0.8), uSoulColor2, 0.4);

     col += coreColor * coreGlow + flareColor * flareGlow + trailColor * trail;


     // Ship already has its own bassGate — filaments stay visible always

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
    uKickTransient: gl.getUniformLocation(prog, 'uKickTransient'),
    uCameraZ: gl.getUniformLocation(prog, 'uCameraZ'),
    uCameraAngle: gl.getUniformLocation(prog, 'uCameraAngle'),
    uFov: gl.getUniformLocation(prog, 'uFov'),
    uCamPos: gl.getUniformLocation(prog, 'uCamPos'),
    uCamDir: gl.getUniformLocation(prog, 'uCamDir'),
    uTimeSinceKick: gl.getUniformLocation(prog, 'uTimeSinceKick'),
    uShipDeathAge: gl.getUniformLocation(prog, 'uShipDeathAge'),
    uSoulColor1: gl.getUniformLocation(prog, 'uSoulColor1'),
    uSoulColor2: gl.getUniformLocation(prog, 'uSoulColor2'),
    uSoulColor3: gl.getUniformLocation(prog, 'uSoulColor3'),
    uRes: gl.getUniformLocation(prog, 'uRes'),
    uSpectrum: gl.getUniformLocation(prog, 'uSpectrum'),
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
let bassFloor = 0;  // slow EMA tracking sustained bassline
let timeSinceKick = 10;  // seconds since last kick — drives traveling sonar wave
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
    bass: 0, lowMid: 0, mid: 0, highMid: 0, air: 0,
    rms: 0, centroid: 0.5, flatness: 0, flux: 0,
    onset: 0, silence: 1, bpm: 120, beatPhase: 0
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
  if (kickTransient > 0.1) timeSinceKick = 0;
  timeSinceKick += dt;

  // Ship death detection — when bass falls, spawn an expanding radiant burst
  const currentlyAlive = frame.bass > 0.08;
  if (shipAlive && !currentlyAlive) shipDeathAge = 0;
  shipAlive = currentlyAlive;
  shipDeathAge += dt;

  // Original GLORIOUS formula + extra kick transient punch on top.
  // Bass oscillation (sin) prevents freeze during sustained bass —
  // bounded, never drifts, just sways the center gently.
  const bassOsc = Math.sin(simTime * 2.0) * bassFloor * 2.5;
  const churnTarget = frame.bass * 13.0 + frame.lowMid * 1.5 + gatedOnset * 10.0
                    + kickTransient * 24.0 + bassOsc;
  const churnRate = churnTarget > churnAmt
    ? (1 - Math.exp(-dt * 40))   // attack ~25ms — instant slam
    : (1 - Math.exp(-dt * 40));  // decay ~25ms — razor sharp on 360Hz OLED
  churnAmt += (churnTarget - churnAmt) * churnRate;
  churnAmt = Math.min(churnAmt, 22);  // hard cap — prevents phase distortion on heavy kicks

  // === 3D camera — wanders through noise space ===
  // Target direction via slow irrational-rate oscillations — never repeats
  const PHI = 1.61803, EU = 2.71828;
  const tgtX = Math.sin(simTime * 0.071 * PHI) * Math.cos(simTime * 0.13);
  const tgtY = Math.cos(simTime * 0.093) * Math.sin(simTime * 0.11 * EU);
  const tgtZ = 0.6 + Math.sin(simTime * 0.053) * 0.35;

  // Smooth heading — graceful turns
  const dirEase = 1 - Math.exp(-dt * 0.8);
  camDirX += (tgtX - camDirX) * dirEase;
  camDirY += (tgtY - camDirY) * dirEase;
  camDirZ += (tgtZ - camDirZ) * dirEase;

  // Normalize
  const dirLen = Math.sqrt(camDirX * camDirX + camDirY * camDirY + camDirZ * camDirZ) || 1;
  const nX = camDirX / dirLen, nY = camDirY / dirLen, nZ = camDirZ / dirLen;

  const speed = 0.25 + bassFloor * 1.0 + kickTransient * 6.0;
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
  gl.uniform1f(loc.uKickTransient, kickTransient);
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

  // 3D-specific uniforms (harmlessly ignored by 2D program)
  if (loc.uCameraZ) gl.uniform1f(loc.uCameraZ, camZ);
  if (loc.uCameraAngle) gl.uniform1f(loc.uCameraAngle, Math.atan2(camDirX, camDirZ));
  if (loc.uCamPos) gl.uniform3f(loc.uCamPos, camX, camY, camZ);
  if (loc.uCamDir) gl.uniform3f(loc.uCamDir, camDirX, camDirY, camDirZ);
  if (loc.uTimeSinceKick) gl.uniform1f(loc.uTimeSinceKick, timeSinceKick);
  if (loc.uShipDeathAge) gl.uniform1f(loc.uShipDeathAge, shipDeathAge);
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
