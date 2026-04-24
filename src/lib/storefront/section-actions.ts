// Pure helpers for mutating a list of sections. Keeps the Zustand store and
// the AI chat apply() path from each reinventing the same array math.

import { nanoid } from 'nanoid';
import type { SectionType, StorefrontSection } from './section-types';
import { SECTION_VARIANTS } from './section-types';

function normalizeOrder(list: StorefrontSection[]): StorefrontSection[] {
  return list
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s, i) => ({ ...s, sort_order: i * 10 }));
}

function resolveVariant(type: SectionType, requested?: string): string {
  const allowed = SECTION_VARIANTS[type] ?? [];
  if (requested && allowed.includes(requested)) return requested;
  return allowed[0] ?? 'default';
}

export function addSection(
  sections: StorefrontSection[],
  input: {
    type: SectionType;
    variant?: string;
    props?: Record<string, unknown>;
    position?: 'start' | 'end' | `after:${string}` | `before:${string}`;
  },
): StorefrontSection[] {
  const newSection: StorefrontSection = {
    id: nanoid(),
    type: input.type,
    variant: resolveVariant(input.type, input.variant),
    sort_order: 0,
    is_visible: true,
    props: input.props ?? {},
  };

  const ordered = normalizeOrder(sections);
  const position = input.position ?? 'end';

  if (position === 'start') {
    return normalizeOrder([{ ...newSection, sort_order: -1 }, ...ordered]);
  }
  if (position === 'end') {
    const last = ordered[ordered.length - 1]?.sort_order ?? -1;
    return normalizeOrder([...ordered, { ...newSection, sort_order: last + 10 }]);
  }
  const [relation, target] = position.split(':') as ['after' | 'before', string];
  const targetIdx = ordered.findIndex(
    (s) => s.id === target || s.type === target,
  );
  if (targetIdx === -1) {
    // Unknown target — append.
    const last = ordered[ordered.length - 1]?.sort_order ?? -1;
    return normalizeOrder([...ordered, { ...newSection, sort_order: last + 10 }]);
  }
  const insertAt = relation === 'after' ? targetIdx + 1 : targetIdx;
  const next = [...ordered.slice(0, insertAt), newSection, ...ordered.slice(insertAt)];
  return normalizeOrder(next);
}

export function removeSection(
  sections: StorefrontSection[],
  sectionId: string,
): StorefrontSection[] {
  return normalizeOrder(sections.filter((s) => s.id !== sectionId));
}

export function updateSectionVariant(
  sections: StorefrontSection[],
  sectionId: string,
  variant: string,
): StorefrontSection[] {
  return sections.map((s) => {
    if (s.id !== sectionId) return s;
    return { ...s, variant: resolveVariant(s.type, variant) };
  });
}

export function updateSectionProps(
  sections: StorefrontSection[],
  sectionId: string,
  patch: Record<string, unknown>,
): StorefrontSection[] {
  return sections.map((s) => {
    if (s.id !== sectionId) return s;
    return { ...s, props: { ...(s.props ?? {}), ...patch } };
  });
}

export function toggleSection(
  sections: StorefrontSection[],
  sectionId: string,
  visible: boolean,
): StorefrontSection[] {
  return sections.map((s) => {
    if (s.id !== sectionId) return s;
    return { ...s, is_visible: visible };
  });
}

export function reorderSections(
  sections: StorefrontSection[],
  order: string[],
): StorefrontSection[] {
  // `order` is a list of section ids OR types. Sections not mentioned
  // keep their current relative order after the mentioned ones.
  const byId = new Map(sections.map((s) => [s.id, s]));
  const byType = new Map<string, StorefrontSection[]>();
  for (const s of sections) {
    const list = byType.get(s.type) ?? [];
    list.push(s);
    byType.set(s.type, list);
  }

  const picked: StorefrontSection[] = [];
  const seen = new Set<string>();
  for (const ref of order) {
    const byIdMatch = byId.get(ref);
    if (byIdMatch && !seen.has(byIdMatch.id)) {
      picked.push(byIdMatch);
      seen.add(byIdMatch.id);
      continue;
    }
    const byTypeMatch = byType.get(ref)?.find((s) => !seen.has(s.id));
    if (byTypeMatch) {
      picked.push(byTypeMatch);
      seen.add(byTypeMatch.id);
    }
  }
  const leftovers = sections.filter((s) => !seen.has(s.id));
  return normalizeOrder([...picked, ...leftovers]);
}
