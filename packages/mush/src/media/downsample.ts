/**
 * Downsample images that exceed the on-disk target size.
 * Uses imagescript (WASM) — no native deps.
 */
import { Image } from "imagescript";

/** Preferred max size after save (downsample target). */
export const TARGET_SAVE_BYTES = 2 * 1024 * 1024;

const MIN_EDGE = 48;
const MAX_ATTEMPTS = 16;

function normExt(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, "");
  return e === "jpeg" ? "jpg" : e;
}

/**
 * If `bytes` is already ≤ target, return as-is.
 * Otherwise decode, resize / re-encode until under target
 * (or fail with an error string).
 *
 * Output after downsample is JPEG or WebP for size.
 */
export async function downsampleIfNeeded(
  bytes: Uint8Array,
  ext: string,
  targetBytes = TARGET_SAVE_BYTES,
): Promise<
  | { ok: true; bytes: Uint8Array; ext: string }
  | { ok: false; error: string }
> {
  const inExt = normExt(ext);
  if (bytes.length <= targetBytes) {
    return { ok: true, bytes, ext: inExt };
  }

  let img: InstanceType<typeof Image>;
  try {
    img = await Image.decode(bytes);
  } catch {
    return {
      ok: false,
      error:
        "Image is over 2 MB and could not be decoded " +
        "for downsampling.",
    };
  }

  let w = img.width;
  let h = img.height;
  let quality = 85;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const frame = (w === img.width && h === img.height)
      ? img
      : img.clone().resize(Math.max(1, w), Math.max(1, h));

    const candidates: Array<{ bytes: Uint8Array; ext: string }> =
      [];

    try {
      const webp = await frame.encodeWEBP(quality);
      candidates.push({ bytes: webp, ext: "webp" });
    } catch {
      /* webp optional */
    }
    try {
      const jpeg = await frame.encodeJPEG(quality);
      candidates.push({ bytes: jpeg, ext: "jpg" });
    } catch {
      /* jpeg required path below */
    }

    if (candidates.length === 0) {
      return {
        ok: false,
        error: "Image downsampling failed (encode error).",
      };
    }

    candidates.sort((a, b) => a.bytes.length - b.bytes.length);
    const best = candidates[0];
    if (best.bytes.length <= targetBytes) {
      return { ok: true, bytes: best.bytes, ext: best.ext };
    }

    if (quality > 50) {
      quality -= 10;
      continue;
    }

    const nw = Math.max(MIN_EDGE, Math.floor(w * 0.75));
    const nh = Math.max(MIN_EDGE, Math.floor(h * 0.75));
    if (nw === w && nh === h) break;
    w = nw;
    h = nh;
    quality = 80;
  }

  return {
    ok: false,
    error: "Could not reduce image under 2 MB.",
  };
}
