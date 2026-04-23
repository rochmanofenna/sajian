// Browser helpers that turn an uploaded File into a ChatAttachment. Image
// uploads are downscaled to a ~480px long-edge JPEG so the thumbnail persists
// inside onboarding_drafts.messages without bloating the row (we were seeing
// 2–5 MB PNGs pre-compression); the original file is still what we send to
// the extract-* endpoints. PDFs just carry metadata — the binary stays on
// the server.

import type { ChatAttachment } from './types';

const MAX_EDGE = 480;
const JPEG_QUALITY = 0.78;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode failed'));
    img.src = src;
  });
}

async function imageToThumbnail(file: File): Promise<string> {
  const dataUrl = await readAsDataUrl(file);
  try {
    const img = await loadImage(dataUrl);
    const scale = Math.min(MAX_EDGE / img.width, MAX_EDGE / img.height, 1);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } catch {
    // If decode fails, fall back to the raw data URL — the user still sees
    // what they uploaded, we just skip the downscale.
    return dataUrl;
  }
}

export async function fileToAttachment(file: File): Promise<ChatAttachment> {
  if (file.type.startsWith('image/')) {
    const url = await imageToThumbnail(file);
    return {
      type: 'image',
      url,
      name: file.name,
      size: file.size,
      mime: file.type,
    };
  }
  return {
    type: 'pdf',
    name: file.name,
    size: file.size,
    mime: file.type || 'application/pdf',
  };
}

export async function filesToAttachments(files: File[]): Promise<ChatAttachment[]> {
  return Promise.all(files.map(fileToAttachment));
}
