'use client';

// Drag/drop or tap-to-upload. Editorial warm look — dashed ochre border on
// hover, deep ink icon, hint line in mono for the file-type whitelist.

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
  hint = 'JPG · PNG · WebP · max 8MB',
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
      data-dragging={dragging || undefined}
      data-busy={busy || undefined}
      className="ob-upload"
    >
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <span className="ob-upload__icon" aria-hidden="true">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
      </span>
      <span className="ob-upload__label">{label}</span>
      <span className="ob-upload__hint">{hint}</span>
    </label>
  );
}
