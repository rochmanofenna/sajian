// Shared Sharp pipeline used by owner-side image uploads (logo, hero, menu
// items). Resizes within a max edge, preserves aspect ratio, auto-rotates
// via EXIF, strips all metadata (privacy + weight) and transcodes to either
// JPEG or WebP depending on input.
//
// Keeping this as a small helper means every admin upload route gets the
// same safety net: a 5MB phone photo turns into a 200KB web-ready image
// before it lands in Supabase storage.

import sharp from 'sharp';

export interface ProcessOptions {
  /** Max long-edge in px; the image is resized to fit inside (width, height). */
  maxEdge: number;
  /** 'jpeg' for photos, 'webp' for better compression when supported. */
  format?: 'jpeg' | 'webp' | 'png';
  /** 1-100. Ignored for PNG. */
  quality?: number;
}

export interface ProcessedImage {
  buffer: Buffer;
  contentType: 'image/jpeg' | 'image/webp' | 'image/png';
  ext: 'jpg' | 'webp' | 'png';
}

const DEFAULT_QUALITY = 82;

// Process one image. Pass-through formats we shouldn't re-encode (SVG): the
// caller should handle those separately.
export async function processImage(
  input: Buffer,
  options: ProcessOptions,
): Promise<ProcessedImage> {
  const format = options.format ?? 'jpeg';
  const quality = options.quality ?? DEFAULT_QUALITY;

  let pipeline = sharp(input, { failOn: 'truncated' })
    .rotate()
    .resize({
      width: options.maxEdge,
      height: options.maxEdge,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .withMetadata({ exif: undefined, icc: undefined }); // strip EXIF/GPS

  if (format === 'jpeg') {
    pipeline = pipeline.jpeg({ quality, progressive: true, mozjpeg: true });
    const buffer = await pipeline.toBuffer();
    return { buffer, contentType: 'image/jpeg', ext: 'jpg' };
  }
  if (format === 'webp') {
    pipeline = pipeline.webp({ quality });
    const buffer = await pipeline.toBuffer();
    return { buffer, contentType: 'image/webp', ext: 'webp' };
  }
  pipeline = pipeline.png({ compressionLevel: 9 });
  const buffer = await pipeline.toBuffer();
  return { buffer, contentType: 'image/png', ext: 'png' };
}

// Convenience: process a File from a multipart form. Returns the processed
// buffer/content-type plus the stable SVG pass-through option for logos.
export async function processUpload(
  file: File,
  options: ProcessOptions,
): Promise<ProcessedImage | { buffer: Buffer; contentType: 'image/svg+xml'; ext: 'svg' }> {
  if (file.type === 'image/svg+xml') {
    const buffer = Buffer.from(await file.arrayBuffer());
    return { buffer, contentType: 'image/svg+xml', ext: 'svg' };
  }
  const input = Buffer.from(await file.arrayBuffer());
  return processImage(input, options);
}
