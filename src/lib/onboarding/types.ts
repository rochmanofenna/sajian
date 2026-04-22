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

export interface TenantDraft {
  name?: string;
  slug?: string;
  tagline?: string;
  food_type?: string;
  location?: string;
  colors?: TenantColors;
  logo_url?: string | null;
  menu_categories?: CategoryDraft[];
  operating_hours?: Record<string, { open: string; close: string }>;
  pos_provider?: 'sajian_native' | 'esb';
  esb_config?: {
    company_code: string;
    branch_code: string;
    bearer_token: string;
  };
}

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  // Plain text. Rich payloads (extracted menu, color swatches, logo picks)
  // live in `kind` + `payload` so the renderer knows what to show.
  content: string;
  kind?: 'text' | 'menu_extracted' | 'colors_extracted' | 'logo_options' | 'photo_prompt' | 'launch_ready';
  payload?: unknown;
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
  | { type: 'ready_to_launch' };
