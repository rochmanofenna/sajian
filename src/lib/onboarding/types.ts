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
  | 'announcement'
  | 'canvas'
  | 'custom';

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
  | { type: 'generate_section_image'; section_id: string; prompt?: string; prop_key?: string }
  | { type: 'generate_hero_image'; prompt?: string }
  | { type: 'add_custom_section'; source_jsx: string; position?: 'start' | 'end' | `after:${string}` | `before:${string}` }
  | { type: 'update_custom_section'; section_id: string; source_jsx: string }
  // Tenant-level settings the AI can change directly. Whitelisted keys
  // only — anything outside the whitelist is rejected by the executor.
  | { type: 'update_tenant_setting'; key: TenantSettingKey; value: string | number | boolean | null }
  // Branch / location management. add/update/delete operate on rows in
  // public.branches. AI uses these so "tambahin cabang Sudirman" or
  // "hilangkan pilih cabang" actually mutates state instead of being
  // deflected to "the team."
  | { type: 'add_location'; name: string; address?: string; phone?: string; code?: string }
  | { type: 'update_location'; location_id: string; fields: { name?: string; address?: string; phone?: string; is_active?: boolean } }
  | { type: 'delete_location'; location_id: string }
  // Phase 5+ batch — settings actions backed by registry / new tables.
  | { type: 'add_delivery_zone'; name: string; fee_cents: number; radius_km?: number }
  | { type: 'update_delivery_zone'; zone_id: string; fields: { name?: string; fee_cents?: number; radius_km?: number | null; is_active?: boolean } }
  | { type: 'delete_delivery_zone'; zone_id: string }
  | { type: 'toggle_payment_method'; method: string; enabled: boolean; config?: Record<string, unknown> }
  | { type: 'request_custom_domain'; domain: string }
  // Third response pattern — for genuinely missing features.
  // Logs the request to roadmap_requests so the team can
  // prioritize. AI ALSO replies with a concrete workaround in
  // approved framing. See ABSOLUTE RULE 8 in chat/route.ts.
  | {
      type: 'log_roadmap_request';
      category:
        | 'modifiers'
        | 'loyalty'
        | 'reservations'
        | 'gift_cards'
        | 'subscriptions'
        | 'multi_currency'
        | 'inventory'
        | 'integrations'
        | 'other';
      workaround_offered: string;
      raw_user_message?: string;
    }
  | { type: 'ready_to_launch' };

// Result of every action the chat panel applies. Every branch in
// ChatPanel.applyAction returns one of these so the conversation has
// a verified outcome trail — nothing is allowed to silently succeed
// or silently fail. The next /api/ai/chat turn passes the recent
// results back via lastActionResults so the AI summarizes reality
// instead of hallucinating.
//
// Failure fields split into two layers:
//   • error_human / suggestion → user-facing copy (AI may quote)
//   • error_code / debug       → log-only, never quoted to user
//
// The AI is told (via prompt) to surface error_human and never
// copy debug fields, error codes, or raw IDs into chat. The eval
// harness regexes for UUID-shaped strings in replies as a final
// gate.
export type ActionResult =
  | {
      ok: true;
      action: string;
      summary: string;
      data?: Record<string, unknown>;
    }
  | {
      ok: false;
      action: string;
      // Stable machine code so logs / Sentry can group failures.
      error_code: string;
      // User-facing Indonesian copy. May be safely quoted in chat.
      error_human: string;
      // Optional next-step hint for the AI.
      suggestion?: string;
      // Internal-only — IDs, raw error bodies, stack hints. NEVER
      // surfaced to the user. Used by Sentry + console logs.
      debug?: Record<string, unknown>;
      // Back-compat — previous code read `error`. Kept as alias of
      // error_human so older call sites still type-check.
      error: string;
    };

// Whitelist of tenant settings the AI is allowed to change via
// update_tenant_setting. Anything else lives in /admin or migrations.
export type TenantSettingKey =
  | 'multi_branch_mode'
  | 'currency_symbol'
  | 'locale'
  | 'support_whatsapp'
  | 'contact_email'
  | 'is_active'
  | 'heading_font_family'
  | 'body_font_family';
