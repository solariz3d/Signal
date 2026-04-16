/**
 * SPLASH — 5-second "The Awakening" startup animation
 * Timeline-driven version of the Wanderer raymarcher.
 * Uses Web Audio API to synthesize the stinger in real time — no external file.
 */

// ============================================================
// Canvas setup
// ============================================================
const canvas = document.createElement('canvas');
const W = window.innerWidth;
const H = window.innerHeight;
canvas.width = W;
canvas.height = H;
canvas.style.width = W + 'px';
canvas.style.height = H + 'px';
document.body.insertBefore(canvas, document.body.firstChild);

const gl = canvas.getContext('webgl', {
  antialias: false,
  alpha: true,             // transparent backing store — shader renders alpha
  premultipliedAlpha: false,
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
// Simplex noise (Ashima) — reused verbatim
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
// Timeline-driven 3D raymarcher shader
// ============================================================
const prog = mkP(
  `attribute vec2 aPos;varying vec2 vUv;
   void main(){vUv=aPos*.5+.5;gl_Position=vec4(aPos,0.,1.);}`,
  `precision highp float;
   ${NOISE}

   uniform float uT;             // timeline 0..5
   uniform vec2  uRes;
   uniform vec3  uSoul1, uSoul2, uSoul3;  // fixed soul colors for splash
   // Pre-computed timeline values (avoid duplicating smoothstep work)
   uniform float uShipEmerge;     // 0..1 over 0.8..1.2s
   uniform float uWebMaterialize; // 0..1 over 1.8..3.5s
   uniform float uWave1Age;       // -1 before 1.5s, else t - 1.5
   uniform float uWave2Age;       // -1 before 3.5s, else t - 3.5
   uniform float uKickPulse;      // transient brightness spikes
   uniform float uFakeBass;       // 0..1 emulating bass level across timeline

   varying vec2 vUv;

   float ridgedFBM(vec3 p) {
     float n = 0.0, amp = 0.6, freq = 0.4;
     for (int i = 0; i < 2; i++) {
       float raw = snoise(p * freq + vec3(0., 0., float(i) * 1.7));
       float ridge = 1.0 - abs(raw);
       n += amp * ridge;
       freq *= 2.0; amp *= 0.5;
     }
     return n * n * 0.25;
   }

   void main() {
     vec2 st = (vUv - 0.5) * 2.0;
     st.x *= uRes.x / uRes.y;

     // Camera: forward drift during materialization, then pulls BACK in final 1s
     // so the web grows outward to fill the screen — transitioning into the main app.
     float pullback = smoothstep(4.0, 5.0, uT);
     float camZ = uT * 0.3 - pullback * 1.8;   // reverse motion near end
     float fov = mix(0.85, 1.35, pullback);    // wider FOV = more web visible
     vec3 camPos = vec3(0.0, 0.0, camZ);
     vec3 camFwd = normalize(vec3(sin(uT * 0.1) * 0.15, cos(uT * 0.08) * 0.1, 1.0));
     vec3 camRight = normalize(cross(camFwd, vec3(0., 1., 0.)));
     vec3 camUp = cross(camRight, camFwd);
     vec3 rd = normalize(camFwd * fov + camRight * st.x + camUp * st.y);

     vec2 shipPos = vec2(0.0, 0.0);

     vec3 col = vec3(0.0);
     float totalDensity = 0.0;
     float stepSize = 0.28;

     for (int i = 0; i < 50; i++) {
       float marchDist = float(i) * stepSize;
       vec3 p = (camPos + rd * marchDist) * 1.35;

       // === Traveling wave pulses ===
       vec3 displaced_p = p;
       float brightMod = 1.0;
       vec3 chromShift = vec3(1.0);
       float waveSpeed = 2.5;
       float shellWidth = 0.22;

       if (uWave1Age >= 0.0) {
         float d = marchDist - uWave1Age * waveSpeed;
         float w = shellWidth * shellWidth * (d > 0.0 ? 0.15 : 1.8);
         float shell = exp(-d * d / w) * exp(-uWave1Age * 0.35);
         displaced_p += rd * shell * 0.12;
         brightMod += shell * 2.5;
         chromShift *= mix(vec3(1.0), vec3(1.5, 1.0, 0.45), shell * 0.6);
       }
       if (uWave2Age >= 0.0) {
         float d = marchDist - uWave2Age * waveSpeed;
         float w = shellWidth * shellWidth * (d > 0.0 ? 0.15 : 1.8);
         float shell = exp(-d * d / w) * exp(-uWave2Age * 0.35);
         displaced_p += rd * shell * 0.14;
         brightMod += shell * 3.0;
         chromShift *= mix(vec3(1.0), vec3(1.5, 1.0, 0.45), shell * 0.7);
       }

       float density = ridgedFBM(displaced_p);
       if (density < 0.05) continue;
       density = smoothstep(0.05, 0.30, density) * 1.2 * uWebMaterialize;
       if (density < 0.001) continue;

       float m1 = snoise(p * 0.3 + vec3(1., 0., uT * 0.15)) * 0.5 + 0.5;
       float m2 = snoise(p * 0.25 + vec3(-2., 0., uT * 0.12)) * 0.5 + 0.5;
       vec3 soulHere = uSoul1 * m1 + uSoul2 * (1.0 - m1) * m2 + uSoul3 * (1.0 - m1) * (1.0 - m2);
       vec3 filamentColor = soulHere;

       float depthFade = exp(-marchDist * 0.25);
       float alpha = min(density * stepSize * 3.0, 1.0 - totalDensity);
       float ambient = 2.5 + uKickPulse * 1.0;
       col += filamentColor * chromShift * density * alpha * depthFade * brightMod * ambient;
       totalDensity += alpha;
       if (totalDensity > 0.95) break;
     }

     // === Bass ship (pinpoint → plasma) ===
     vec2 sp = st - shipPos;
     float shipDist = length(sp);
     float expansion = 1.0 + uFakeBass * 15.0 + uKickPulse * 30.0;
     float falloff = 1500.0 / expansion;
     float coreGlow = exp(-shipDist * shipDist * falloff);
     coreGlow *= uShipEmerge * (1.2 + uFakeBass * 2.0 + uKickPulse * 2.8);

     // Plasma texture when bass is active
     vec2 plasmaCoord = sp * (14.0 / sqrt(expansion));
     float plasma1 = snoise(vec3(plasmaCoord, uT * 3.2)) * 0.5 + 0.5;
     float plasma2 = snoise(vec3(plasmaCoord * 0.55 + vec2(4.7, 1.9), uT * 2.1)) * 0.5 + 0.5;
     float plasmaField = plasma1 * plasma2;
     float plasmaMix = clamp(uFakeBass * 1.4 + uKickPulse * 0.6, 0.0, 1.0);
     coreGlow *= mix(1.0, 0.4 + plasmaField * 1.6, plasmaMix);

     float flareGlow = exp(-shipDist * shipDist * (8.0 / (1.0 + uFakeBass * 4.0 + uKickPulse * 8.0)));
     flareGlow *= (uFakeBass * 0.6 + uKickPulse * 1.0) * uShipEmerge;

     vec3 coreColor = mix(vec3(0.9, 0.95, 1.0), vec3(1.0, 0.7, 0.3), uKickPulse);
     vec3 flareColor = mix(uSoul1 * 0.5 + vec3(0.3, 0.4, 0.7), uSoul1.gbr, uKickPulse * 0.6);
     col += coreColor * coreGlow + flareColor * flareGlow;

     // Very subtle corner darkening so the alpha falls off at screen edges
     float vigDist = length(vUv - 0.5) * 1.4;
     float vig = smoothstep(1.3, 0.5, vigDist);
     col *= vig;

     // Write alpha from brightness so the window is genuinely transparent
     // where there's nothing rendered
     float luminance = max(max(col.r, col.g), col.b);
     float alphaOut = clamp(luminance * 1.2, 0.0, 1.0);
     gl_FragColor = vec4(col, alphaOut);
   }`
);

const loc = {
  aPos: gl.getAttribLocation(prog, 'aPos'),
  uT: gl.getUniformLocation(prog, 'uT'),
  uRes: gl.getUniformLocation(prog, 'uRes'),
  uSoul1: gl.getUniformLocation(prog, 'uSoul1'),
  uSoul2: gl.getUniformLocation(prog, 'uSoul2'),
  uSoul3: gl.getUniformLocation(prog, 'uSoul3'),
  uShipEmerge: gl.getUniformLocation(prog, 'uShipEmerge'),
  uWebMaterialize: gl.getUniformLocation(prog, 'uWebMaterialize'),
  uWave1Age: gl.getUniformLocation(prog, 'uWave1Age'),
  uWave2Age: gl.getUniformLocation(prog, 'uWave2Age'),
  uKickPulse: gl.getUniformLocation(prog, 'uKickPulse'),
  uFakeBass: gl.getUniformLocation(prog, 'uFakeBass'),
};

const quadBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);

gl.clearColor(0, 0, 0, 0);
gl.viewport(0, 0, W, H);

// ============================================================
// Web Audio stinger — synthesized in real time
// ============================================================
let audioCtx = null;
function startStinger() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    const master = audioCtx.createGain();
    master.gain.value = 0.45;
    master.connect(audioCtx.destination);

    // Sub drone — 30Hz, barely audible, swells and fades
    const drone = audioCtx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 30;
    const droneGain = audioCtx.createGain();
    droneGain.gain.setValueAtTime(0.0, now);
    droneGain.gain.linearRampToValueAtTime(0.25, now + 0.5);
    droneGain.gain.linearRampToValueAtTime(0.3, now + 2.5);
    droneGain.gain.linearRampToValueAtTime(0.0, now + 5.0);
    drone.connect(droneGain).connect(master);
    drone.start(now);
    drone.stop(now + 5.0);

    // Sub-bass swell — 50Hz rising to 200Hz from 1.0s to 1.5s
    const swell = audioCtx.createOscillator();
    swell.type = 'sine';
    swell.frequency.setValueAtTime(50, now + 1.0);
    swell.frequency.exponentialRampToValueAtTime(200, now + 1.5);
    const swellGain = audioCtx.createGain();
    swellGain.gain.setValueAtTime(0.0, now + 1.0);
    swellGain.gain.linearRampToValueAtTime(0.35, now + 1.5);
    swellGain.gain.linearRampToValueAtTime(0.0, now + 2.3);
    swell.connect(swellGain).connect(master);
    swell.start(now + 1.0);
    swell.stop(now + 2.3);

    // Kicks — sub 80Hz with quick pitch drop
    function kick(time, amp) {
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, time);
      osc.frequency.exponentialRampToValueAtTime(40, time + 0.08);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(amp, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
      osc.connect(g).connect(master);
      osc.start(time);
      osc.stop(time + 0.3);
    }
    kick(now + 1.5, 0.5);   // first wave
    kick(now + 3.5, 0.65);  // second wave (larger)
    kick(now + 4.0, 0.55);  // pulse follow-up

    // Warm pad — major 3rd layered (A = 220, C# = 277), enters at 2.3s
    function pad(freq, startTime, duration, amp) {
      const osc = audioCtx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0, startTime);
      g.gain.linearRampToValueAtTime(amp, startTime + 0.6);
      g.gain.setValueAtTime(amp, startTime + duration - 0.6);
      g.gain.linearRampToValueAtTime(0.0, startTime + duration);
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1200;
      osc.connect(filter).connect(g).connect(master);
      osc.start(startTime);
      osc.stop(startTime + duration);
    }
    pad(220, now + 2.3, 2.5, 0.12);  // A
    pad(277.18, now + 2.3, 2.5, 0.10); // C#
    pad(329.63, now + 3.5, 1.3, 0.09); // E (added on second pulse)

    // High shimmer — 500Hz descending sweep at crescendo (4.3s)
    const shim = audioCtx.createOscillator();
    shim.type = 'sine';
    shim.frequency.setValueAtTime(800, now + 4.3);
    shim.frequency.exponentialRampToValueAtTime(400, now + 4.8);
    const shimGain = audioCtx.createGain();
    shimGain.gain.setValueAtTime(0.0, now + 4.3);
    shimGain.gain.linearRampToValueAtTime(0.08, now + 4.5);
    shimGain.gain.linearRampToValueAtTime(0.0, now + 5.0);
    shim.connect(shimGain).connect(master);
    shim.start(now + 4.3);
    shim.stop(now + 5.0);

    // Sub-resonance at the drop — 60Hz boom at name-reveal
    const boom = audioCtx.createOscillator();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(80, now + 4.3);
    boom.frequency.exponentialRampToValueAtTime(40, now + 4.6);
    const boomGain = audioCtx.createGain();
    boomGain.gain.setValueAtTime(0.0, now + 4.3);
    boomGain.gain.linearRampToValueAtTime(0.55, now + 4.35);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 5.0);
    boom.connect(boomGain).connect(master);
    boom.start(now + 4.3);
    boom.stop(now + 5.0);
  } catch (e) {
    console.warn('audio stinger failed', e);
  }
}

// ============================================================
// Timeline + render loop
// ============================================================
const textEl = document.getElementById('signal-text');
const startTime = performance.now();
let textRevealed = false;
let textPassing = false;
let audioStarted = false;

// Fixed soul colors for the splash — elegant cool-warm palette
const SOUL_1 = [0.65, 0.80, 1.00];  // cool blue-white
const SOUL_2 = [0.75, 0.55, 0.95];  // violet
const SOUL_3 = [1.00, 0.80, 0.55];  // warm amber

function smoothstep(a, b, t) {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

function render() {
  const t = (performance.now() - startTime) / 1000;  // 0..5

  // Finish condition — main.js closes us after 5.5s; keep rendering until then
  if (t >= 5.5) return;

  requestAnimationFrame(render);

  // Extended fade-out from 4.5s → 5.5s (1 second) so the handoff is glassy
  if (t > 4.5) {
    const fadeProgress = (t - 4.5) / 1.0;
    // Ease-in-out cubic — slow start, quick middle, slow end
    const eased = fadeProgress < 0.5
      ? 4 * fadeProgress * fadeProgress * fadeProgress
      : 1 - Math.pow(-2 * fadeProgress + 2, 3) / 2;
    document.body.style.opacity = Math.max(0, 1.0 - eased).toFixed(3);
  }

  // Start audio on first frame (deferred so window is fully visible)
  if (!audioStarted && t > 0.05) {
    audioStarted = true;
    startStinger();
  }

  // Reveal text at 4.3s
  if (!textRevealed && t >= 4.3) {
    textRevealed = true;
    textEl.classList.add('visible');
  }
  // At 4.6s — text scales up and fades: we're passing through it into the app
  if (!textPassing && t >= 4.6) {
    textPassing = true;
    textEl.classList.remove('visible');
    textEl.classList.add('passing');
  }

  // Compute timeline phases
  const shipEmerge = smoothstep(0.8, 1.2, t);
  const webMaterialize = smoothstep(1.8, 3.5, t);
  const wave1Age = t >= 1.5 ? t - 1.5 : -1;
  const wave2Age = t >= 3.5 ? t - 3.5 : -1;

  // Fake bass — builds with ignition, sustains with web, final crescendo
  let fakeBass = 0;
  if (t >= 0.8) fakeBass = smoothstep(0.8, 1.5, t) * 0.7;
  if (t >= 2.3) fakeBass = 0.7 + smoothstep(2.3, 3.8, t) * 0.2;
  if (t >= 4.3) fakeBass = 0.9 + smoothstep(4.3, 4.6, t) * 0.1;

  // Kick pulses — short spikes at 1.5s, 3.5s, 4.0s, 4.3s (climax)
  function kickEnvelope(kickTime, amp) {
    const age = t - kickTime;
    if (age < 0 || age > 0.35) return 0;
    return amp * Math.exp(-age * 12);
  }
  const kickPulse = Math.max(
    kickEnvelope(1.5, 0.7),
    kickEnvelope(3.5, 0.85),
    kickEnvelope(4.0, 0.7),
    kickEnvelope(4.3, 1.0)
  );

  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(prog);

  gl.uniform1f(loc.uT, t);
  gl.uniform2f(loc.uRes, W, H);
  gl.uniform3f(loc.uSoul1, SOUL_1[0], SOUL_1[1], SOUL_1[2]);
  gl.uniform3f(loc.uSoul2, SOUL_2[0], SOUL_2[1], SOUL_2[2]);
  gl.uniform3f(loc.uSoul3, SOUL_3[0], SOUL_3[1], SOUL_3[2]);
  gl.uniform1f(loc.uShipEmerge, shipEmerge);
  gl.uniform1f(loc.uWebMaterialize, webMaterialize);
  gl.uniform1f(loc.uWave1Age, wave1Age);
  gl.uniform1f(loc.uWave2Age, wave2Age);
  gl.uniform1f(loc.uKickPulse, kickPulse);
  gl.uniform1f(loc.uFakeBass, fakeBass);

  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(loc.aPos);
  gl.vertexAttribPointer(loc.aPos, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.disableVertexAttribArray(loc.aPos);
}

requestAnimationFrame(render);
