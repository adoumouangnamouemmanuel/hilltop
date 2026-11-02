/*
 * Removes metadata from uploaded photos before they're stored: camera serial
 * numbers, GPS location, comments, and anything appended after the image itself.
 * The sell page already re-encodes photos in the browser, which drops all of this,
 * but the upload endpoint can be called directly. Workers can't decode images, so
 * this works on the file structure: JPEG segments, PNG chunks and WebP chunks.
 *
 * Returns the cleaned bytes and the image size, or null for a file that isn't a
 * well-formed image.
 */

export const MAX_PHOTO_SIDE = 6000;

type Cleaned = { bytes: Uint8Array; width: number; height: number };

const u16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32 = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const u32le = (b: Uint8Array, i: number) => b[i] + (b[i + 1] << 8) + (b[i + 2] << 16) + ((b[i + 3] << 24) >>> 0);
const u24le = (b: Uint8Array, i: number) => b[i] + (b[i + 1] << 8) + (b[i + 2] << 16);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function cleanJpeg(b: Uint8Array): Cleaned | null {
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  let width = 0;
  let height = 0;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    // Fill bytes between segments.
    if (marker === 0xff) {
      i++;
      continue;
    }
    const length = u16(b, i + 2);
    if (length < 2 || i + 2 + length > b.length) return null;
    // Start of frame (not DHT, JPG or DAC): the image size.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      height = u16(b, i + 5);
      width = u16(b, i + 7);
    }
    if (marker === 0xda) {
      // Start of scan: the image data runs to the last end-of-image marker; anything after it goes.
      let end = b.length - 2;
      while (end > i && !(b[end] === 0xff && b[end + 1] === 0xd9)) end--;
      if (end <= i) return null;
      parts.push(b.subarray(i, end + 2));
      return width && height ? { bytes: concat(parts), width, height } : null;
    }
    // Keep JFIF (APP0), ICC colour profiles (APP2 "ICC_PROFILE") and Adobe colour info (APP14);
    // drop EXIF/XMP (APP1), IPTC (APP13), other APPn and comments.
    const app = marker >= 0xe0 && marker <= 0xef;
    const keep =
      !app && marker !== 0xfe ? true : marker === 0xe0 || marker === 0xee || (marker === 0xe2 && ascii(b, i + 4, 11) === "ICC_PROFILE");
    if (keep) parts.push(b.subarray(i, i + 2 + length));
    i += 2 + length;
  }
  return null;
}

const PNG_DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

function cleanPng(b: Uint8Array): Cleaned | null {
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  let width = 0;
  let height = 0;
  while (i + 12 <= b.length) {
    const length = u32(b, i);
    const type = ascii(b, i + 4, 4);
    const end = i + 12 + length;
    if (end > b.length) return null;
    if (type === "IHDR") {
      width = u32(b, i + 8);
      height = u32(b, i + 12);
    }
    if (!PNG_DROP.has(type)) parts.push(b.subarray(i, end));
    // Nothing after the end chunk is kept.
    if (type === "IEND") return width && height ? { bytes: concat(parts), width, height } : null;
    i = end;
  }
  return null;
}

function cleanWebp(b: Uint8Array): Cleaned | null {
  const size = u32le(b, 4) + 8;
  if (size > b.length || ascii(b, 8, 4) !== "WEBP") return null;
  const chunks: Uint8Array[] = [];
  let i = 12;
  let width = 0;
  let height = 0;
  while (i + 8 <= size) {
    const type = ascii(b, i, 4);
    const length = u32le(b, i + 4);
    const end = i + 8 + length + (length % 2);
    if (i + 8 + length > size) return null;
    const chunk = b.slice(i, Math.min(end, size));
    if (type === "VP8X") {
      // Clear the "has EXIF" and "has XMP" flags, since those chunks are dropped.
      chunk[8] &= ~(0x08 | 0x04);
      width = u24le(b, i + 12) + 1;
      height = u24le(b, i + 15) + 1;
    } else if (type === "VP8 " && !width) {
      width = (b[i + 14] | (b[i + 15] << 8)) & 0x3fff;
      height = (b[i + 16] | (b[i + 17] << 8)) & 0x3fff;
    } else if (type === "VP8L" && !width) {
      const bits = u32le(b, i + 9);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
    }
    if (type !== "EXIF" && type !== "XMP ") chunks.push(chunk);
    i = end;
  }
  const body = concat(chunks);
  const header = new Uint8Array(12);
  header.set(b.subarray(0, 12));
  const riff = body.length + 4;
  header[4] = riff & 0xff;
  header[5] = (riff >> 8) & 0xff;
  header[6] = (riff >> 16) & 0xff;
  header[7] = (riff >>> 24) & 0xff;
  return width && height ? { bytes: concat([header, body]), width, height } : null;
}

export function cleanImage(bytes: Uint8Array, type: "image/jpeg" | "image/png" | "image/webp"): Cleaned | null {
  try {
    const cleaned = type === "image/jpeg" ? cleanJpeg(bytes) : type === "image/png" ? cleanPng(bytes) : cleanWebp(bytes);
    if (!cleaned || cleaned.width > MAX_PHOTO_SIDE || cleaned.height > MAX_PHOTO_SIDE) return null;
    return cleaned;
  } catch {
    return null;
  }
}
