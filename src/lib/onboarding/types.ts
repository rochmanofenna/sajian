// Shared types for the onboarding flow. The draft shape is what we upsert
// into onboarding_drafts.draft and what onboarding_launch() reads.

export type OnboardingStep =
  | 'welcome'
  | 'restaurant_info'
  | 'menu_upload'
  | 'menu_review'
  | 'branding'
  | 'logo'
  | 'preview'
  | 'launch';

export interface MenuItemDraft {
  name: string;
  description: string;
  price: number;
  is_available?: boolean;
  tags?: string[];
  image_url?: string | null;
}

export interface CategoryDraft {
  name: string;
  items: MenuItemDraft[];
}

export interface TenantColors {
  primary: string;
  accent: string;
  background: string;
  dark: string;
}

export type ThemeTemplate = 'kedai' | 'warung' | 'modern' | 'food-hall' | 'classic';

// Storefront sections — the "page composition" layer the AI manipulates via
// chat. See src/lib/storefront/section-registry.ts for the allowed `type`s
// and their variants. `props` is a free-form bag the section component types
// back down to its own schema. Legacy `theme_template` continues to live on
// the tenant row as a fallback for storefronts that haven't been migrated.
export type SectionType =
  | 'hero'
  | 'about'
  | 'featured_items'
  | 'gallery'
  | 'promo'
  | 'contact'
  | 'testimonials'
  | 'social'
  | 'location'
  | 'announcement';

export interface StorefrontSection {
  id: string;
  type: SectionType;
  variant: string;
  sort_order: number;
  props?: Record<string, unknown>;
  is_visible?: boolean;
}

export interface TenantDraft {
  name?: string;
  slug?: string;
  tagline?: string;
  food_type?: string;
  location?: string;
  colors?: TenantColors;
  logo_url?: string | null;
  hero_image_url?: string | null;
  theme_template?: ThemeTemplate;
  menu_categories?: CategoryDraft[];
  sections?: StorefrontSection[];
  operating_hours?: Record<string, { open: string; close: string }>;
  pos_provider?: 'sajian_native' | 'esb';
  esb_config?: {
    company_code: string;
    branch_code: string;
    bearer_token: string;
  };
}

export type ChatRole = 'user' | 'assistant';

// Attachments shown inline inside a bubble. Images carry a compressed
// thumbnail data URL so reloads still show what was uploaded. PDFs carry
// metadata only — embedding the binary would balloon the onboarding_drafts
// row — the bubble renders a file card instead.
export interface ChatAttachment {
  type: 'image' | 'pdf';
  url?: string;
  name?: string;
  size?: number;
  mime?: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  // Plain text. Rich payloads (extracted menu, color swatches, logo picks)
  // live in `kind` + `payload` so the renderer knows what to show.
  content: string;
  kind?: 'text' | 'menu_extracted' | 'colors_extracted' | 'logo_uploaded' | 'logo_options' | 'photo_prompt' | 'launch_ready';
  payload?: unknown;
  attachments?: ChatAttachment[];
  createdAt: number;
}

export type OnboardingAction =
  | { type: 'update_name'; name: string }
  | { type: 'update_food_type'; food_type: string }
  | { type: 'update_tagline'; tagline: string }
  | { type: 'update_colors'; colors: Partial<TenantColors> }
  | { type: 'update_hours'; hours: TenantDraft['operating_hours'] }
  | { type: 'add_menu_item'; category: string; item: MenuItemDraft }
  | { type: 'remove_menu_item'; item: string }
  | { type: 'update_menu_item'; item: string; field: 'name' | 'price' | 'description'; value: string | number }
  | { type: 'generate_logo' }
  | { type: 'generate_food_photo'; item: string }
  | { type: 'generate_all_photos' }
  | { type: 'set_template'; template: ThemeTemplate }
  | { type: 'add_section'; section_type: SectionType; variant?: string; props?: Record<string, unknown>; position?: 'start' | 'end' | `after:${string}` | `before:${string}` }
  | { type: 'remove_section'; section_id: string }
  | { type: 'update_section_variant'; section_id: string; variant: string }
  | { type: 'update_section_props'; section_id: string; props: Record<string, unknown> }
  | { type: 'toggle_section'; section_id: string; visible: boolean }
  | { type: 'reorder_sections'; order: string[] }
  | { type: 'ready_to_launch' };
