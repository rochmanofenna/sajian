'use client';

// Onboarding state + draft sync.
//
// The draft is the source of truth for the live preview. We sync to Supabase
// on every meaningful change (debounced) so the preview iframe can read it
// from the server. Messages are also persisted so a reload doesn't lose the
// conversation.

import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { createClient as createBrowserClient } from '@/lib/supabase/client';
import type {
  ChatMessage,
  OnboardingStep,
  TenantDraft,
  CategoryDraft,
  MenuItemDraft,
} from './types';

interface OnboardingState {
  userId: string | null;
  phone: string | null;
  step: OnboardingStep;
  draft: TenantDraft;
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;

  init: (userId: string, phone: string) => Promise<void>;
  setStep: (step: OnboardingStep) => void;
  patchDraft: (patch: Partial<TenantDraft>) => Promise<void>;
  setMenu: (categories: CategoryDraft[]) => Promise<void>;
  addItem: (category: string, item: MenuItemDraft) => Promise<void>;
  removeItem: (itemName: string) => Promise<void>;
  updateItem: (itemName: string, field: 'name' | 'price' | 'description', value: string | number) => Promise<void>;
  setItemImage: (itemName: string, imageUrl: string | null) => Promise<void>;
  pushMessage: (msg: Omit<ChatMessage, 'id' | 'createdAt'>) => Promise<ChatMessage>;
  setMessages: (messages: ChatMessage[]) => Promise<void>;
  setLoading: (b: boolean) => void;
  setError: (e: string | null) => void;
}

// Persisted chat messages from before the sharp/timeout extract-menu fix
// sometimes contain raw browser errors ("JSON.parse: unexpected character at
// line 1 column 1 of the JSON data") — strip those on load so the owner sees
// a clean conversation.
function isSystemErrorMessage(m: ChatMessage): boolean {
  if (!m || typeof m.content !== 'string') return false;
  const text = m.content.toLowerCase();
  return (
    text.includes('json.parse') ||
    text.includes('unexpected character at line') ||
    text.includes('unexpected token') && text.includes('json')
  );
}

// Debounced persistence — we fire-and-forget the upsert. A user who backs
// out mid-edit won't corrupt anything because each field is set in full.
let persistTimer: ReturnType<typeof setTimeout> | null = null;

async function persist(state: OnboardingState) {
  if (!state.userId) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    const supabase = createBrowserClient();
    await supabase.from('onboarding_drafts').upsert({
      user_id: state.userId!,
      draft: state.draft,
      step: state.step,
      messages: state.messages,
    });
  }, 300);
}

export const useOnboarding = create<OnboardingState>((set, get) => ({
  userId: null,
  phone: null,
  step: 'welcome',
  draft: {},
  messages: [],
  loading: false,
  error: null,

  init: async (userId, phone) => {
    const supabase = createBrowserClient();
    const { data } = await supabase
      .from('onboarding_drafts')
      .select('draft, step, messages')
      .eq('user_id', userId)
      .maybeSingle();

    const rawSaved = (data?.messages as ChatMessage[] | null) ?? [];
    // Strip historical system errors — "JSON.parse: unexpected character…"
    // bubbles from failed uploads before the sharp/timeout fix shipped.
    // These aren't real conversation turns, so rendering them forever would
    // just confuse the owner.
    const saved = rawSaved.filter((m) => !isSystemErrorMessage(m));
    const messages =
      saved.length > 0
        ? saved
        : [
            {
              id: 'greeting',
              role: 'assistant' as const,
              content:
                'Halo! Aku asisten Sajian. Aku bakal bantu kamu bikin halaman pemesanan online buat restoran kamu. Prosesnya sekitar 15 menit.\n\nPertama, apa nama restoran kamu?',
              kind: 'text' as const,
              createdAt: Date.now(),
            },
          ];

    set({
      userId,
      phone,
      step: (data?.step as OnboardingStep) ?? 'welcome',
      draft: (data?.draft as TenantDraft) ?? {},
      messages,
    });
    // If we filtered out stale error bubbles, persist the cleaned list so
    // they don't come back on the next load.
    if (rawSaved.length !== saved.length) {
      persist(get());
    }
  },

  setStep: (step) => {
    set({ step });
    persist(get());
  },

  patchDraft: async (patch) => {
    set((s) => ({ draft: { ...s.draft, ...patch } }));
    persist(get());
  },

  setMenu: async (categories) => {
    set((s) => ({ draft: { ...s.draft, menu_categories: categories } }));
    persist(get());
  },

  addItem: async (category, item) => {
    set((s) => {
      const cats = [...(s.draft.menu_categories ?? [])];
      const idx = cats.findIndex((c) => c.name.toLowerCase() === category.toLowerCase());
      if (idx >= 0) {
        cats[idx] = { ...cats[idx], items: [...cats[idx].items, item] };
      } else {
        cats.push({ name: category, items: [item] });
      }
      return { draft: { ...s.draft, menu_categories: cats } };
    });
    persist(get());
  },

  removeItem: async (itemName) => {
    const needle = itemName.trim().toLowerCase();
    set((s) => ({
      draft: {
        ...s.draft,
        menu_categories: (s.draft.menu_categories ?? []).map((c) => ({
          ...c,
          items: c.items.filter((i) => i.name.trim().toLowerCase() !== needle),
        })),
      },
    }));
    persist(get());
  },

  updateItem: async (itemName, field, value) => {
    const needle = itemName.trim().toLowerCase();
    set((s) => ({
      draft: {
        ...s.draft,
        menu_categories: (s.draft.menu_categories ?? []).map((c) => ({
          ...c,
          items: c.items.map((i) =>
            i.name.trim().toLowerCase() === needle ? { ...i, [field]: value } : i,
          ),
        })),
      },
    }));
    persist(get());
  },

  setItemImage: async (itemName, imageUrl) => {
    const needle = itemName.trim().toLowerCase();
    set((s) => ({
      draft: {
        ...s.draft,
        menu_categories: (s.draft.menu_categories ?? []).map((c) => ({
          ...c,
          items: c.items.map((i) =>
            i.name.trim().toLowerCase() === needle ? { ...i, image_url: imageUrl } : i,
          ),
        })),
      },
    }));
    persist(get());
  },

  pushMessage: async (msg) => {
    const full: ChatMessage = { ...msg, id: nanoid(), createdAt: Date.now() };
    set((s) => ({ messages: [...s.messages, full] }));
    persist(get());
    return full;
  },

  setMessages: async (messages) => {
    set({ messages });
    persist(get());
  },

  setLoading: (b) => set({ loading: b }),
  setError: (e) => set({ error: e }),
}));
