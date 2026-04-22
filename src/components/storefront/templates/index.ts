// Template registry. Maps a tenant.theme_template key to the Home (landing)
// and Menu (menu page) components used on the storefront.
//
// Adding a new template:
//   1. Create the two components under ./{key}/{Key}Home.tsx + {Key}Menu.tsx
//   2. Add the CSS token block to ./tokens.css under `[data-template="{key}"]`
//   3. Add the row here
//   4. Update the enum check in migration 003 and the types.
//
// Unknown keys fall back to `modern` so a future template value in the DB
// without a matching component doesn't break the storefront.

import type { ThemeTemplate } from '@/lib/tenant';
import type { ComponentType } from 'react';
import type { HomeVariantProps, MenuVariantProps } from './types';

import { KedaiHome } from './kedai/KedaiHome';
import { KedaiMenu } from './kedai/KedaiMenu';
import { WarungHome } from './warung/WarungHome';
import { WarungMenu } from './warung/WarungMenu';
import { ModernHome } from './modern/ModernHome';
import { ModernMenu } from './modern/ModernMenu';
import { FoodHallHome } from './food-hall/FoodHallHome';
import { FoodHallMenu } from './food-hall/FoodHallMenu';
import { ClassicHome } from './classic/ClassicHome';
import { ClassicMenu } from './classic/ClassicMenu';

interface TemplateEntry {
  key: ThemeTemplate;
  label: string;
  description: string;
  Home: ComponentType<HomeVariantProps>;
  Menu: ComponentType<MenuVariantProps>;
}

export const TEMPLATES: Record<ThemeTemplate, TemplateEntry> = {
  kedai: {
    key: 'kedai',
    label: 'Kedai',
    description: 'Warm, editorial coffee-shop aesthetic',
    Home: KedaiHome,
    Menu: KedaiMenu,
  },
  warung: {
    key: 'warung',
    label: 'Warung',
    description: 'Bold, vibrant street-food energy',
    Home: WarungHome,
    Menu: WarungMenu,
  },
  modern: {
    key: 'modern',
    label: 'Modern',
    description: 'Clean, minimal, whitespace-forward',
    Home: ModernHome,
    Menu: ModernMenu,
  },
  'food-hall': {
    key: 'food-hall',
    label: 'Food hall',
    description: 'Dense, scan-and-order fast',
    Home: FoodHallHome,
    Menu: FoodHallMenu,
  },
  classic: {
    key: 'classic',
    label: 'Classic',
    description: 'Traditional printed-menu style',
    Home: ClassicHome,
    Menu: ClassicMenu,
  },
};

export function getTemplate(key: string | null | undefined): TemplateEntry {
  if (key && key in TEMPLATES) return TEMPLATES[key as ThemeTemplate];
  return TEMPLATES.modern;
}
