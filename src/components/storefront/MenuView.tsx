'use client';

// /menu entry. Resolves cart + menu data once, then delegates to the template
// variant matching tenant.theme_template. Each variant controls its own
// order-type picker, heading grammar, and card/row layout.
//
// Single-branch tenants get the menu directly — useMenuData auto-pins the
// only active branch. Multi-branch tenants land on an inline BranchPicker.
// Zero-branch tenants see an explicit empty state instead of a stuck gate.

import { Loader2 } from 'lucide-react';
import type { PublicTenant } from '@/lib/tenant';
import { getTemplate } from './templates';
import { useMenuData } from './templates/useMenuData';
import { PageNav } from '@/components/chrome/PageNav';
import { CartChip } from '@/components/chrome/CartChip';
import { MenuOverlay } from './MenuOverlay';
import { BranchPicker } from './BranchPicker';

export function MenuView({ tenant }: { tenant: PublicTenant }) {
  const data = useMenuData(tenant);
  const { Menu } = getTemplate(tenant.theme_template);

  if (!data.branchCode) {
    if (data.resolvingBranch) {
      return (
        <>
          <PageNav label="Menu" backHref="/" trailing={<CartChip tenant={tenant} />} />
          <div className="max-w-3xl mx-auto py-16 px-4 text-center text-zinc-500 inline-flex items-center justify-center gap-2 w-full">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat menu…
          </div>
        </>
      );
    }
    if (data.branchCount === 0) {
      return (
        <>
          <PageNav label="Menu" backHref="/" trailing={<CartChip tenant={tenant} />} />
          <div className="max-w-3xl mx-auto py-16 px-4 text-center text-zinc-600">
            Belum ada cabang aktif untuk toko ini.
          </div>
        </>
      );
    }
    // ≥2 branches and the customer hasn't picked yet → show the
    // picker inline. No more redirect-to-home dead-end.
    return (
      <>
        <PageNav
          label="Menu"
          backHref="/"
          caption="pilih cabang"
          trailing={<CartChip tenant={tenant} />}
        />
        <div className="max-w-md mx-auto py-12 px-4 flex flex-col items-center gap-6 text-center">
          <p className="text-zinc-600 text-sm">Pilih cabang terdekat untuk lihat menunya.</p>
          <BranchPicker tenant={tenant} />
        </div>
      </>
    );
  }

  return (
    <>
      <PageNav
        label="Menu"
        backHref="/"
        caption={tenant.name}
        trailing={<CartChip tenant={tenant} />}
      />
      <MenuOverlay tenant={tenant} sections={data.sections} />
      <Menu tenant={tenant} {...data} />
    </>
  );
}
