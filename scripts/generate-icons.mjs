// สร้างไอคอนแอป Javis (PNG) จากสูตรวาดเดียวกันทุกขนาด ไม่ต้องพึ่งโปรแกรมแต่งภาพ
// รัน: node scripts/generate-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const OUTPUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/icons");

// สีชุดเดียวกับธีมโฮโลแกรมของแอป
const BACKGROUND = [2, 11, 20];
const ORB_LIGHT = [224, 250, 255];
const ORB_MID = [34, 211, 238];
const ORB_DARK = [8, 100, 130];
const SAMPLES = 3;

const mix = (from, to, amount) => from.map((channel, index) => channel + (to[index] - channel) * amount);
const clamp = (value) => Math.min(1, Math.max(0, value));

/** สีและความทึบของจุด (x, y) ในพื้นที่ 0..1 */
function shade(x, y, { rounded }) {
  if (rounded) {
    // มุมโค้งของไอคอนปกติ ส่วนไอคอน maskable เต็มสี่เหลี่ยมเพราะระบบตัดขอบให้เอง
    const radius = 0.22;
    const dx = Math.max(Math.abs(x - 0.5) - (0.5 - radius), 0);
    const dy = Math.max(Math.abs(y - 0.5) - (0.5 - radius), 0);
    if (Math.hypot(dx, dy) > radius) return [0, 0, 0, 0];
  }

  const scale = rounded ? 1 : 0.78;
  const distance = Math.hypot(x - 0.5, y - 0.5) / scale;

  let color = BACKGROUND;
  // วงแหวนสองชั้นแบบจอ HUD: วงนอกบาง วงในหนาและขาดเป็นช่วง
  if (Math.abs(distance - 0.41) < 0.006) color = mix(BACKGROUND, ORB_MID, 0.5);
  const angle = (Math.atan2(y - 0.5, x - 0.5) / (2 * Math.PI) + 1) % 1;
  const inGap = (angle > 0.07 && angle < 0.17) || (angle > 0.57 && angle < 0.67);
  if (Math.abs(distance - 0.33) < 0.016 && !inGap) color = mix(BACKGROUND, ORB_MID, 0.92);
  if (distance < 0.2) {
    // แสงตกจากซ้ายบน ให้ลูกแก้วดูมีมิติ
    // แกนกลางเรืองแสงจากตรงกลางออกไป
    const light = distance / 0.2;
    color = light < 0.45 ? mix(ORB_LIGHT, ORB_MID, clamp(light / 0.45)) : mix(ORB_MID, ORB_DARK, clamp((light - 0.45) / 0.55));
  }
  return [...color, 255];
}

function render(size, options) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const sum = [0, 0, 0, 0];
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const [r, g, b, a] = shade((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size, options);
          sum[0] += r * a;
          sum[1] += g * a;
          sum[2] += b * a;
          sum[3] += a;
        }
      }
      const offset = (py * size + px) * 4;
      const alpha = sum[3] / (SAMPLES * SAMPLES);
      pixels[offset] = sum[3] ? Math.round(sum[0] / sum[3]) : 0;
      pixels[offset + 1] = sum[3] ? Math.round(sum[1] / sum[3]) : 0;
      pixels[offset + 2] = sum[3] ? Math.round(sum[2] / sum[3]) : 0;
      pixels[offset + 3] = Math.round(alpha);
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 บิตต่อช่องสี, RGBA

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let row = 0; row < size; row += 1) {
    pixels.copy(raw, row * (stride + 1) + 1, row * stride, (row + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

const ICONS = [
  { file: "icon-192.png", size: 192, rounded: true },
  { file: "icon-512.png", size: 512, rounded: true },
  { file: "icon-maskable-512.png", size: 512, rounded: false },
  { file: "apple-touch-icon.png", size: 180, rounded: false }
];

mkdirSync(OUTPUT_DIR, { recursive: true });
for (const { file, size, rounded } of ICONS) {
  writeFileSync(path.join(OUTPUT_DIR, file), encodePng(size, render(size, { rounded })));
  console.warn(`สร้าง ${file} (${size}x${size})`);
}
