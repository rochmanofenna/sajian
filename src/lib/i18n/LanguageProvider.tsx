'use client';

// Tiny client-side i18n for the marketing site. Persists the user's pick in
// localStorage so the next visit loads in the same language. No server-side
// detection — EN is the default; users who want ID flip the toggle once.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { messages, type Lang, type MessageKey } from './messages';

interface LanguageContextValue {
  lang: Lang;
  setLang: (next: Lang) => void;
  t: (key: MessageKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = 'sajian.lang';

export function LanguageProvider({ children, initial = 'en' }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(initial);

  // On mount, read stored preference. We don't read it during render to avoid
  // an SSR/CSR mismatch — EN renders on first paint, then flips once hydrated.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'en' || stored === 'id') setLangState(stored);
    } catch {
      // localStorage disabled (private mode, etc.) — stay on initial.
    }
  }, []);

  const setLang = (next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      setLang,
      t: (key) => messages[lang][key] ?? messages.en[key] ?? key,
    }),
    [lang],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang() called outside <LanguageProvider>');
  return ctx;
}
