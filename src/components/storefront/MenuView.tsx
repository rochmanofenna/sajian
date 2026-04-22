'use client';

// /menu entry. Resolves cart + menu data once, then delegates to the template
// variant matching tenant.theme_template. Each variant controls its own
// order-type picker, heading grammar, and card/row layout.

import type { PublicTenant } from '@/lib/tenant';
import { getTemplate } from './templates';
import { useMenuData } from './templates/useMenuData';

export function MenuView({ tenant }: { tenant: PublicTenant }) {
  const data = useMenuData(tenant);
  const { Menu } = getTemplate(tenant.theme_template);

  if (!data.branchCode) {
    return (
      <div className="max-w-3xl mx-auto py-16 px-4 text-center text-zinc-600">
        Pilih cabang dulu di halaman utama.
      </div>
    );
  }

  return <Menu tenant={tenant} {...data} />;
}
