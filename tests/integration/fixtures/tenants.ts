// Canonical fixture tenants. Three:
//
//   Mindiology Coffee — active, sajian_native, has full menu + sections.
//   Sate Taichan Uda  — active, sajian_native, owned by a DIFFERENT
//                       user. Used as the "other tenant" in isolation
//                       tests: when we sign in as Mindiology's owner,
//                       reads of Sate Taichan Uda's rows must fail.
//   Test Tenant       — INACTIVE, used for negative-state coverage
//                       (deactivated storefront should not respond).
//
// IDs are deterministic UUIDs so test assertions can reference them
// stably. owner_user_id values are also fixed — auth users get
// created with these exact IDs in seed.ts.

export const TENANT_A_ID = '11111111-1111-4111-8111-111111111111';
export const TENANT_B_ID = '22222222-2222-4222-8222-222222222222';
export const TENANT_INACTIVE_ID = '33333333-3333-4333-8333-333333333333';

export const OWNER_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const OWNER_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

export const OWNER_A_EMAIL = 'owner-a@test.sajian.app';
export const OWNER_B_EMAIL = 'owner-b@test.sajian.app';

export const fixtureTenants = [
  {
    id: TENANT_A_ID,
    slug: 'mindiology-test',
    name: 'Mindiology Coffee (test)',
    tagline: 'Test fixture for tenant A',
    owner_user_id: OWNER_A_ID,
    pos_provider: 'sajian_native' as const,
    is_active: true,
    colors: {
      primary: '#1B5E3B',
      accent: '#C9A84C',
      background: '#FDF6EC',
      dark: '#1A1A18',
    },
  },
  {
    id: TENANT_B_ID,
    slug: 'sate-taichan-test',
    name: 'Sate Taichan Uda (test)',
    tagline: 'Test fixture for tenant B',
    owner_user_id: OWNER_B_ID,
    pos_provider: 'sajian_native' as const,
    is_active: true,
    colors: {
      primary: '#1E3A8A',
      accent: '#FFFFFF',
      background: '#FFFFFF',
      dark: '#0A0B0A',
    },
  },
  {
    id: TENANT_INACTIVE_ID,
    slug: 'inactive-test',
    name: 'Inactive Test Tenant',
    tagline: 'Used for deactivated-storefront coverage',
    owner_user_id: OWNER_A_ID,
    pos_provider: 'sajian_native' as const,
    is_active: false,
    colors: {
      primary: '#999999',
      accent: '#666666',
      background: '#FFFFFF',
      dark: '#000000',
    },
  },
];

export const fixtureBranches = [
  {
    tenant_id: TENANT_A_ID,
    code: 'mindiology-main',
    name: 'Mindiology Main (test)',
    is_active: true,
  },
  {
    tenant_id: TENANT_B_ID,
    code: 'sate-main',
    name: 'Sate Main (test)',
    is_active: true,
  },
];

export const fixtureMenuCategories = [
  { tenant_id: TENANT_A_ID, name: 'Coffee', sort_order: 1 },
  { tenant_id: TENANT_A_ID, name: 'Pastries', sort_order: 2 },
  { tenant_id: TENANT_B_ID, name: 'Sate', sort_order: 1 },
];

export const fixtureMenuItems = [
  {
    tenant_id: TENANT_A_ID,
    name: 'Espresso',
    price: 25000,
    is_available: true,
  },
  {
    tenant_id: TENANT_A_ID,
    name: 'Croissant',
    price: 35000,
    is_available: true,
  },
  {
    tenant_id: TENANT_B_ID,
    name: 'Sate Taichan',
    price: 30000,
    is_available: true,
  },
];

export const fixtureSections = [
  {
    tenant_id: TENANT_A_ID,
    type: 'hero',
    variant: 'fullscreen',
    sort_order: 1,
    is_visible: true,
    props: { headline: 'Mindiology' },
  },
  {
    tenant_id: TENANT_A_ID,
    type: 'about',
    variant: 'simple',
    sort_order: 2,
    is_visible: true,
    props: { heading: 'About', body: 'Coffee from Mindiology' },
  },
  {
    tenant_id: TENANT_B_ID,
    type: 'hero',
    variant: 'split',
    sort_order: 1,
    is_visible: true,
    props: { headline: 'Sate Taichan Uda' },
  },
];
