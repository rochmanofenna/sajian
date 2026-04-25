// Sticky banner stamped on top of every preview-mode page. Tells the
// owner what they're looking at + reminds them links work normally.
// Composes the live-reload client so storefront pages don't need to
// import it separately.

import { PreviewLiveReloadClient } from './PreviewLiveReloadClient';

export function PreviewModeBanner() {
  return (
    <>
      <div className="sticky top-0 z-50 bg-amber-500 text-amber-950 text-xs font-medium px-4 py-1.5 shadow-sm flex items-center gap-2">
        <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-950/80" aria-hidden="true" />
        <span>PREVIEW MODE — klik mana saja, semua link kerja. Belum dipublish.</span>
      </div>
      <PreviewLiveReloadClient />
    </>
  );
}
