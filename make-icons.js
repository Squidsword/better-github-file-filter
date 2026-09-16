// Generates icon16/48/128.png from scratch (no deps): a GitHub-blue rounded
// square with a white check, 4x4 supersampled for clean edges. Neutral art —
// no GitHub logo/Octocat — so it's safe for the store listing.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const BG = [9, 105, 218]; // GitHub accent blue (#0969DA)
const FG = [255, 255, 255];
const SS = 4; // supersample factor per axis

const crcTable = (() => {
  const t = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// One point sample: opaque blue inside the rounded square, opaque white inside
// the check stroke, transparent outside. Returns [r, g, b, a(0|255)].
function sample(fx, fy, size) {
  const r = size * 0.22;
  const inX = Math.min(fx, size - fx);
  const inY = Math.min(fy, size - fy);
  if (inX < 0 || inY < 0) return [0, 0, 0, 0];
  if (inX < r && inY < r && Math.hypot(r - inX, r - inY) > r) return [0, 0, 0, 0];

  const hw = size * 0.075; // check stroke half-width
  const p = [
    [0.3, 0.53],
    [0.44, 0.67],
    [0.72, 0.35],
  ].map(([nx, ny]) => [nx * size, ny * size]);
  const onCheck =
    distToSegment(fx, fy, p[0][0], p[0][1], p[1][0], p[1][1]) <= hw ||
    distToSegment(fx, fy, p[1][0], p[1][1], p[2][0], p[2][1]) <= hw;

  return onCheck ? [FG[0], FG[1], FG[2], 255] : [BG[0], BG[1], BG[2], 255];
}

// Straight-alpha averaging over subsamples: color from covered samples only, so
// edges antialias against transparency without a dark fringe.
function pixel(x, y, size) {
  let sr = 0, sg = 0, sb = 0, cov = 0;
  for (let sy = 0; sy < SS; sy++) {
    for (let sx = 0; sx < SS; sx++) {
      const [r, g, b, a] = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, size);
      if (a) {
        sr += r;
        sg += g;
        sb += b;
        cov++;
      }
    }
  }
  const n = SS * SS;
  if (!cov) return [0, 0, 0, 0];
  return [Math.round(sr / cov), Math.round(sg / cov), Math.round(sb / cov), Math.round((cov / n) * 255)];
}

function png(size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // RGBA
  const rowLen = size * 4 + 1;
  const raw = Buffer.alloc(rowLen * size);
  for (let y = 0; y < size; y++) {
    let o = y * rowLen;
    raw[o++] = 0; // no per-row filter
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
      raw[o++] = a;
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [16, 48, 128]) {
  fs.writeFileSync(path.join(__dirname, `icon${size}.png`), png(size));
  console.log(`wrote icon${size}.png`);
}
