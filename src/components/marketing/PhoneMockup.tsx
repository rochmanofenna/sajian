'use client';

// Pure-CSS rendition of a real Sajian storefront inside a phone frame.
// No iframe (X-Frame blocked on Vercel) — we hand-draw the UI in HTML so
// it's always crisp, and tint it with the live Mindiology colours.

import { useLang } from '@/lib/i18n/LanguageProvider';

export function PhoneMockup() {
  const { t } = useLang();

  return (
    <div className="sj-phone">
      <div className="sj-phone__frame">
        <div className="sj-phone__notch" aria-hidden="true" />
        <div className="sj-phone__screen">
          <div className="sj-phone__chrome">
            <span className="sj-phone__lock" aria-hidden="true">⊙</span>
            <span className="sj-phone__url">{t('mock_url')}</span>
          </div>

          <div className="sj-phone__hero">
            <div className="sj-phone__wordmark">Mindiology</div>
            <div className="sj-phone__greet">{t('mock_greeting')}</div>
            <div className="sj-phone__branch">
              <span className="sj-phone__pin" aria-hidden="true">●</span>
              {t('mock_branch')}
            </div>
          </div>

          <div className="sj-phone__menu">
            <MenuRow
              name={t('mock_item_1')}
              meta="gula aren · dingin"
              price="Rp 28.000"
              cta={t('mock_add')}
              highlight
            />
            <MenuRow
              name={t('mock_item_2')}
              meta="homemade · hangat"
              price="Rp 25.000"
              cta={t('mock_add')}
            />
            <MenuRow
              name={t('mock_item_3')}
              meta="creamy · bestseller"
              price="Rp 22.000"
              cta={t('mock_add')}
            />
          </div>

          <div className="sj-phone__cart">
            <span className="sj-phone__cart-dot" aria-hidden="true" />
            {t('mock_cart')}
          </div>
        </div>
      </div>

      <span className="sj-phone__caption">A real storefront. Not a mockup.</span>
    </div>
  );
}

function MenuRow({
  name,
  meta,
  price,
  cta,
  highlight,
}: {
  name: string;
  meta: string;
  price: string;
  cta: string;
  highlight?: boolean;
}) {
  return (
    <div className={`sj-phone__row ${highlight ? 'sj-phone__row--hi' : ''}`}>
      <div className="sj-phone__row-body">
        <div className="sj-phone__row-name">{name}</div>
        <div className="sj-phone__row-meta">{meta}</div>
      </div>
      <div className="sj-phone__row-side">
        <div className="sj-phone__row-price">{price}</div>
        <button className="sj-phone__row-add" type="button" tabIndex={-1}>
          {cta}
        </button>
      </div>
    </div>
  );
}
