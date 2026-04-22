// Draft preview route. The setup page embeds this in an iframe. We read the
// user's onboarding_drafts row and render a minimal storefront from it.
// Service-role client bypasses RLS so the iframe doesn't need the owner's
// auth cookie to be forwarded — the caller's userId is the only key.

import { createServiceClient } from '@/lib/supabase/service';
import { formatCurrency } from '@/lib/utils';
import type { TenantDraft } from '@/lib/onboarding/types';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ userId: string }>;
}

export default async function PreviewPage({ params }: Props) {
  const { userId } = await params;

  const sb = createServiceClient();
  const { data } = await sb
    .from('onboarding_drafts')
    .select('draft')
    .eq('user_id', userId)
    .maybeSingle();

  const draft = (data?.draft ?? {}) as TenantDraft;
  const colors = draft.colors ?? {
    primary: '#1B5E3B',
    accent: '#C9A84C',
    background: '#FDF6EC',
    dark: '#1A1A18',
  };

  return (
    <div
      className="min-h-screen"
      style={{ background: colors.background, color: colors.dark }}
    >
      <header
        className="h-14 px-4 flex items-center border-b"
        style={{ borderColor: `${colors.primary}20` }}
      >
        {draft.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={draft.logo_url} alt="" className="h-8 w-8 rounded" />
        ) : (
          <div
            className="h-8 w-8 rounded flex items-center justify-center text-white text-xs font-semibold"
            style={{ background: colors.primary }}
          >
            {draft.name?.slice(0, 2).toUpperCase() ?? 'S'}
          </div>
        )}
        <div className="ml-3">
          <div className="font-semibold" style={{ color: colors.primary }}>
            {draft.name ?? 'Nama Restoran'}
          </div>
          {draft.tagline && <div className="text-xs opacity-70">{draft.tagline}</div>}
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6">
        {(draft.menu_categories ?? []).length === 0 ? (
          <div className="text-center py-20 opacity-60 text-sm">
            Preview akan muncul setelah kamu isi menu.
          </div>
        ) : (
          <div className="space-y-6">
            {draft.menu_categories!.map((cat) => (
              <section key={cat.name}>
                <h2
                  className="text-lg font-semibold mb-2"
                  style={{ color: colors.primary }}
                >
                  {cat.name}
                </h2>
                <ul className="space-y-2">
                  {cat.items.map((item) => (
                    <li
                      key={item.name}
                      className="flex items-start gap-3 p-3 rounded-xl bg-white border"
                      style={{ borderColor: `${colors.primary}15` }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{item.name}</div>
                        {item.description && (
                          <div className="text-xs opacity-60 line-clamp-2">
                            {item.description}
                          </div>
                        )}
                        <div
                          className="mt-1 text-sm font-semibold"
                          style={{ color: colors.primary }}
                        >
                          {formatCurrency(item.price, 'Rp ', 'id-ID')}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
