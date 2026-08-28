// Shared image upload: downscale + compress on the client, then push to imgbb
// (free tier). Used for avatars and for build/idea screenshots. Keeping one
// helper means the host can be swapped later without touching callers.

const IMGBB_KEY = import.meta.env.VITE_IMGBB_API_KEY as string | undefined;

export interface UploadedImage {
  url: string;
  thumb?: string;
  width?: number;
  height?: number;
}

const MAX_EDGE = 1600; // longest side, px
const TARGET_BYTES = 1_200_000; // keep pages light; step quality down to hit this

/** True when VITE_IMGBB_API_KEY is set. The app works without it — callers hide the control. */
export function imageUploadEnabled(): boolean {
  return Boolean(IMGBB_KEY);
}

async function compress(file: File): Promise<Blob> {
  // Animated / vector formats: send as-is, canvas would flatten them.
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // decode failed — let imgbb try the original

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  for (const q of [0.85, 0.72, 0.58, 0.42]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', q)
    );
    if (blob && (blob.size <= TARGET_BYTES || q === 0.42)) return blob;
  }
  return file;
}

/** Upload one image. Throws a user-facing message on any failure. */
export async function uploadImage(file: File): Promise<UploadedImage> {
  if (!IMGBB_KEY) {
    throw new Error('Image upload is not set up. Add VITE_IMGBB_API_KEY to enable it.');
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('That file is not an image.');
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error('Image must be under 20MB.');
  }

  const blob = await compress(file);
  const baseName = (file.name || 'image').replace(/\.[^.]+$/, '');
  const form = new FormData();
  form.append('image', blob, `${baseName}.jpg`);

  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('Image upload failed. Try again in a moment.');

  const json = await res.json().catch(() => null);
  const d = json?.data;
  const url: string | undefined = d?.display_url || d?.url;
  if (!url) throw new Error('Image upload failed. Try again in a moment.');

  return {
    url,
    thumb: d?.thumb?.url || url,
    width: d?.width ? Number(d.width) : undefined,
    height: d?.height ? Number(d.height) : undefined,
  };
}

/** Upload several images in order. Stops at the first failure. */
export async function uploadImages(files: File[]): Promise<UploadedImage[]> {
  const out: UploadedImage[] = [];
  for (const file of files) {
    out.push(await uploadImage(file));
  }
  return out;
}
