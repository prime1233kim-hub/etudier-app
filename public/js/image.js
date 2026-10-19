// Image helpers that run in the browser: decode (respecting phone photo
// orientation), crop and resize before upload. Based on the resize approach
// in the portfolio editor.

export const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_BYTES = 10 * 1024 * 1024;

export function checkFile(file) {
  if (!file) return 'Please choose an image.';
  const name = (file.name || '').toLowerCase();
  if (/\.(heic|heif)$/.test(name) || /heic|heif/.test(file.type)) {
    return 'HEIC photos aren’t supported yet. On iPhone, choose “Most Compatible” in Camera settings, or export the photo as JPEG.';
  }
  if (!ACCEPTED.includes(file.type)) return 'Please upload a JPEG, PNG or WebP image.';
  if (file.size > MAX_BYTES) return `That image is ${(file.size / 1048576).toFixed(1)} MB. The limit is 10 MB.`;
  if (file.size === 0) return 'That file is empty.';
  return null;
}

export async function decode(blob) {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    // Older browsers: fall back to an <img> element.
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

const dims = (src) => ({ w: src.naturalWidth || src.width, h: src.naturalHeight || src.height });

// Draws `src` (optionally cropped to {x,y,w,h} in source pixels) so its
// longest edge is at most maxEdge, returning a JPEG Blob.
export function render(src, { crop, maxEdge = 1600, quality = 0.9, type = 'image/jpeg' } = {}) {
  const { w: sw, h: sh } = dims(src);
  const c = crop || { x: 0, y: 0, w: sw, h: sh };
  const scale = Math.min(1, maxEdge / Math.max(c.w, c.h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(c.w * scale));
  canvas.height = Math.max(1, Math.round(c.h * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // transparent PNGs get a white background, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, c.x, c.y, c.w, c.h, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), type, quality));
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// Small JPEG data URL for saving in the browser or sending to the archive.
export async function thumbnail(src, maxEdge = 480, quality = 0.8) {
  return blobToDataURL(await render(src, { maxEdge, quality }));
}

export { dims };

// data: URLs can't be fetch()ed under the site's Content Security Policy.
export function dataURLToBlob(dataURL) {
  const [head, body] = dataURL.split(',');
  const type = (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
