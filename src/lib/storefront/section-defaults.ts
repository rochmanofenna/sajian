// When the AI emits `add_section` with empty / skeletal props, fill in
// realistic placeholder content derived from the current draft so the
// preview never renders a bare section.
//
// Pure — no side effects, no network calls. Seeding an image via DALL-E
// still happens via the dedicated `generate_section_image` action.

import type { TenantDraft } from '@/lib/onboarding/types';
import type { SectionType } from './section-types';

type Props = Record<string, unknown>;

const FAKE_REVIEWS = [
  { name: 'Budi S.', text: 'Makanannya enak banget, porsinya pas, dan bisa pesan langsung dari HP. Recommended!', rating: 5 },
  { name: 'Ibu Wati', text: 'Saya sering pesan untuk catering kantor. Selalu on-time dan rasanya konsisten.', rating: 5 },
  { name: 'Pak Hendro', text: 'Fresh, bersih, dan harga masih masuk akal. Cocok buat makan siang cepat.', rating: 4 },
];

function isEmpty(props: Props | undefined): boolean {
  if (!props) return true;
  // A "skeletal" props bag is either empty or has only null/"" values.
  return Object.values(props).every(
    (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === ''),
  );
}

function aboutBlurb(draft: TenantDraft): string {
  const name = draft.name ?? 'Kami';
  const food = draft.food_type?.trim();
  if (food) {
    return `${name} hadir dengan ${food.toLowerCase()} yang dibuat dari bahan pilihan. Tiap piring kami anggap seperti buat keluarga sendiri — hangat, konsisten, tanpa kompromi.`;
  }
  return `${name} hadir buat ngasih pengalaman bersantap yang hangat dan jujur. Setiap menu dibuat dengan bahan pilihan, disajikan dengan cara yang akrab.`;
}

function featuredItemNames(draft: TenantDraft, limit = 4): string[] {
  const cats = draft.menu_categories ?? [];
  if (cats.length === 0) return [];
  // Pick from the largest category — those are usually the bestsellers.
  const largest = [...cats].sort((a, b) => b.items.length - a.items.length)[0];
  if (!largest) return [];
  return largest.items.slice(0, limit).map((i) => i.name);
}

function galleryPhotos(draft: TenantDraft, limit = 6): string[] {
  return (draft.menu_categories ?? [])
    .flatMap((c) => c.items)
    .map((i) => i.image_url)
    .filter((u): u is string => Boolean(u))
    .slice(0, limit);
}

// Fills in placeholder props when the AI left the bag empty. Returns the
// original props unchanged when the AI already supplied something — we
// never clobber deliberate inputs.
export function seedSectionProps(
  type: SectionType,
  provided: Props | undefined,
  draft: TenantDraft,
): Props {
  if (!isEmpty(provided)) return provided ?? {};

  switch (type) {
    case 'testimonials':
      return { reviews: FAKE_REVIEWS };
    case 'about':
      return { body: aboutBlurb(draft) };
    case 'featured_items': {
      const items = featuredItemNames(draft);
      return items.length > 0 ? { items } : {};
    }
    case 'gallery': {
      const photos = galleryPhotos(draft);
      return photos.length > 0 ? { photos } : {};
    }
    case 'announcement':
      return { message: `Selamat datang di ${draft.name ?? 'toko kami'}! Order sekarang.` };
    case 'promo':
      return {
        headline: 'Promo spesial',
        body: 'Order hari ini dan nikmati harga spesial untuk menu andalan kami.',
        cta_label: 'Pesan sekarang',
      };
    case 'contact':
      return {
        address: draft.location ?? undefined,
      };
    case 'location':
      return {
        address: draft.location ?? undefined,
      };
    case 'social':
      return {
        whatsapp: draft.esb_config ? undefined : undefined, // nothing known; UI will render empty-state
      };
    case 'hero':
    default:
      return {};
  }
}
