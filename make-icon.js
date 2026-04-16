/**
 * Generate a Signal Audio icon — tiny cosmic web in 64x64 ICO.
 * Uses the same ridged noise concept as the visualizer.
 */
const fs = require('fs');
const SIZE = 64;

// Simple 2D value noise (good enough for a tiny icon)
function hash(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff;
}

function smoothNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function ridgedFbm(x, y, octaves) {
  let n = 0, amp = 0.6, freq = 1;
  for (let i = 0; i < octaves; i++) {
    const raw = smoothNoise(x * freq + i * 7.3, y * freq + i * 3.1);
    const ridge = 1 - Math.abs(raw * 2 - 1);
    n += amp * ridge;
    freq *= 2.1;
    amp *= 0.5;
  }
  return n * n * 0.3;
}

// HSL to RGB
function hsl(h, s, l) {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    return t < 1/6 ? p + (q - p) * 6 * t : t < 1/2 ? q : t < 2/3 ? p + (q - p) * (2/3 - t) * 6 : p;
  };
  return [Math.round(f(p, q, h + 1/3) * 255), Math.round(f(p, q, h) * 255), Math.round(f(p, q, h - 1/3) * 255)];
}

// Generate pixel data (BGRA, bottom-up for BMP)
const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let py = 0; py < SIZE; py++) {
  for (let px = 0; px < SIZE; px++) {
    const x = (px / SIZE - 0.5) * 4;
    const y = (py / SIZE - 0.5) * 4;
    const rad = Math.sqrt(x * x + y * y);

    // Ridged noise — cosmic web
    const n = ridgedFbm(x + 2.5, y + 1.7, 4);

    // Vignette
    const vig = Math.max(0, 1 - rad * 0.45);

    // Color — teal/purple/gold cosmic palette
    const hue1 = 0.52;  // teal
    const hue2 = 0.78;  // purple
    const hue3 = 0.12;  // gold
    const mix1 = smoothNoise(x * 0.5 + 3, y * 0.5 + 1);
    const hue = hue1 * mix1 + hue2 * (1 - mix1) * 0.7 + hue3 * 0.3;
    const brightness = n * vig;
    const [r, g, b] = hsl(hue % 1, 0.7, Math.min(0.7, brightness * 0.9));

    // Center glow — shifted hue
    const centerGlow = Math.max(0, 1 - rad * 0.7) * n * 0.5;
    const [gr, gg, gb] = hsl((hue + 0.33) % 1, 0.8, Math.min(0.5, centerGlow));

    // BMP is bottom-up, BGRA
    const bmpY = SIZE - 1 - py;
    const idx = (bmpY * SIZE + px) * 4;
    pixels[idx + 0] = Math.min(255, b + gb);     // B
    pixels[idx + 1] = Math.min(255, g + gg);     // G
    pixels[idx + 2] = Math.min(255, r + gr);     // R
    pixels[idx + 3] = brightness > 0.01 ? 255 : 0; // A
  }
}

// Build ICO file
// ICO header: 6 bytes
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0);     // reserved
icoHeader.writeUInt16LE(1, 2);     // type: icon
icoHeader.writeUInt16LE(1, 4);     // count: 1 image

// BMP info header: 40 bytes (BITMAPINFOHEADER)
const bmpHeader = Buffer.alloc(40);
bmpHeader.writeUInt32LE(40, 0);           // header size
bmpHeader.writeInt32LE(SIZE, 4);          // width
bmpHeader.writeInt32LE(SIZE * 2, 8);      // height (doubled for ICO — includes mask)
bmpHeader.writeUInt16LE(1, 12);           // planes
bmpHeader.writeUInt16LE(32, 14);          // bpp
bmpHeader.writeUInt32LE(0, 16);           // compression: none
bmpHeader.writeUInt32LE(pixels.length, 20); // image size

// AND mask (all transparent — we use alpha channel)
const andMask = Buffer.alloc(SIZE * Math.ceil(SIZE / 32) * 4, 0);

const imageData = Buffer.concat([bmpHeader, pixels, andMask]);

// Directory entry: 16 bytes
const dirEntry = Buffer.alloc(16);
dirEntry.writeUInt8(SIZE, 0);             // width
dirEntry.writeUInt8(SIZE, 1);             // height
dirEntry.writeUInt8(0, 2);               // palette
dirEntry.writeUInt8(0, 3);               // reserved
dirEntry.writeUInt16LE(1, 4);            // planes
dirEntry.writeUInt16LE(32, 6);           // bpp
dirEntry.writeUInt32LE(imageData.length, 8); // size
dirEntry.writeUInt32LE(6 + 16, 12);      // offset (after header + dir)

const ico = Buffer.concat([icoHeader, dirEntry, imageData]);
const outPath = require('path').join(__dirname, 'signal-audio.ico');
fs.writeFileSync(outPath, ico);
console.log('Icon written to', outPath, '(' + ico.length + ' bytes)');
