'use client';

// Drag/drop or tap-to-upload. Accepts multiple images for menu, single for
// storefront/logo. Returns the File objects to the parent which POSTs them
// to the relevant AI endpoint.

import { useRef, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';

interface Props {
  multiple?: boolean;
  maxFiles?: number;
  accept?: string;
  hint?: string;
  label: string;
  busy?: boolean;
  onFiles: (files: File[]) => void;
}

export function PhotoUpload({
  multiple = false,
  maxFiles = multiple ? 6 : 1,
  accept = 'image/jpeg,image/png,image/gif,image/webp',
  hint = 'JPG / PNG / GIF / WebP, max 8MB',
  label,
  busy = false,
  onFiles,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(list: FileList | null) {
    if (!list) return;
    const files = Array.from(list).slice(0, maxFiles);
    if (files.length > 0) onFiles(files);
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition ${
        dragging ? 'border-[#1B5E3B] bg-[#1B5E3B]/5' : 'border-[#1B5E3B]/25 bg-white/60'
      } ${busy ? 'pointer-events-none opacity-60' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {busy ? (
        <Loader2 className="h-6 w-6 animate-spin text-[#1B5E3B]" />
      ) : (
        <ImagePlus className="h-6 w-6 text-[#1B5E3B]" />
      )}
      <span className="text-sm text-zinc-700">{label}</span>
      <span className="text-xs text-zinc-500">{hint}</span>
    </label>
  );
}
