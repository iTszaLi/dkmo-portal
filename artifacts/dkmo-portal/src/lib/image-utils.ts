/** Client-side image compression helpers for photo uploads (stored as data URLs). */

const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

export function isAcceptedImage(file: File): boolean {
  return ACCEPTED_TYPES.includes(file.type);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Read a file and downscale it so its longest edge is at most `maxDim`,
 * re-encoding as JPEG. Keeps aspect ratio (no distortion).
 */
export async function fileToCompressedDataUrl(
  file: File,
  maxDim = 1024,
  quality = 0.82,
): Promise<string> {
  if (!isAcceptedImage(file)) {
    throw new Error("Only JPEG, PNG, or WebP images are supported");
  }
  const src = await readAsDataUrl(file);
  const img = await loadImage(src);
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL("image/jpeg", quality);
  // Guard against pathological cases that would blow the server's JSON body cap.
  if (out.length > MAX_PHOTO_DATA_URL_LENGTH) {
    const retry = canvas.toDataURL("image/jpeg", 0.6);
    if (retry.length > MAX_PHOTO_DATA_URL_LENGTH) {
      throw new Error("Image is too large even after compression — please choose a smaller photo");
    }
    return retry;
  }
  return out;
}

/** ~1MB of base64 per photo keeps 1 main + 6 supporting photos well under the 8MB body limit. */
export const MAX_PHOTO_DATA_URL_LENGTH = 1_000_000;
