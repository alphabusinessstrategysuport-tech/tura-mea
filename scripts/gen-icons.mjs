// Generates the PWA PNG icons without any image library.
// Run: node scripts/gen-icons.mjs
// Design: dark rounded square, green progress ring (3/4), amber dot = "target".
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [11, 15, 20];
const RING = [52, 211, 153];
const TRACK = [35, 45, 58];
const DOT = [251, 191, 36];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, maskable) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const c = size / 2;
  const scale = maskable ? 0.72 : 0.9; // maskable icons need a safe zone
  const rOuter = (size / 2) * scale * 0.82;
  const rInner = rOuter * 0.72;
  const corner = size * 0.22;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let col = BG;
      let alpha = 255;
      if (!maskable) {
        // rounded square mask
        const dx = Math.max(corner - x, x - (size - 1 - corner), 0);
        const dy = Math.max(corner - y, y - (size - 1 - corner), 0);
        if (dx * dx + dy * dy > corner * corner) alpha = 0;
      }
      const px = x - c + 0.5, py = y - c + 0.5;
      const d = Math.hypot(px, py);
      if (d <= rOuter && d >= rInner) {
        // angle from top, clockwise
        const a = (Math.atan2(px, -py) + 2 * Math.PI) % (2 * Math.PI);
        col = a <= Math.PI * 1.5 ? RING : TRACK;
      }
      if (d < rInner * 0.38) col = DOT;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = col[0]; raw[o + 1] = col[1]; raw[o + 2] = col[2]; raw[o + 3] = alpha;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public', { recursive: true });
writeFileSync('public/icon-192.png', png(192, false));
writeFileSync('public/icon-512.png', png(512, false));
writeFileSync('public/icon-512-maskable.png', png(512, true));
writeFileSync(
  'public/icon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#0b0f14"/>
  <circle cx="50" cy="50" r="31" fill="none" stroke="#232d3a" stroke-width="10"/>
  <circle cx="50" cy="50" r="31" fill="none" stroke="#34d399" stroke-width="10"
    stroke-dasharray="146 195" transform="rotate(-90 50 50)"/>
  <circle cx="50" cy="50" r="8.5" fill="#fbbf24"/>
</svg>
`,
);
console.log('Icons written to public/');
