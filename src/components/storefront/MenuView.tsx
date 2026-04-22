'use client';

// /menu entry. Resolves cart + menu data once, then delegates to the template
// variant matching tenant.theme_template. Each variant controls its own
// order-type picker, heading grammar, and card/row layout.
//
// The PageNav chrome renders above every variant so the back-to-home and
// cart affordances are identical regardless of template.

import type { PublicTenant } from '@/lib/tenant';
import { getTemplate } from './templates';
import { useMenuData } from './templates/useMenuData';
import { PageNav } from '@/components/chrome/PageNav';
import { CartChip } from '@/components/chrome/CartChip';

export function MenuView({ tenant }: { tenant: PublicTenant }) {
  const data = useMenuData(tenant);
  const { Menu } = getTemplate(tenant.theme_template);

  if (!data.branchCode) {
    return (
      <>
        <PageNav
          label="Menu"
          backHref="/"
          caption="pilih cabang dulu"
          trailing={<CartChip tenant={tenant} />}
        />
        <div className="max-w-3xl mx-auto py-16 px-4 text-center text-zinc-600">
          Pilih cabang dulu di halaman utama.
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
      <Menu tenant={tenant} {...data} />
    </>
  );
}
