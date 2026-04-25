// Resolves the Supabase test branch's connection info from env vars
// populated by `supabase branches get test --output env`. Cached per
// process. Refuses prod's project ref under any circumstance.
//
// To prepare your shell:
//
//   eval "$(supabase branches get test --experimental --output env)"
//   npm run test:integration
//
// CI populates the same vars from repo secrets. The integration
// script does NOT auto-source — operators must run the eval line
// manually so a stray default-shell env can't aim tests at prod.

const PROD_REF = 'cejsweidaxtavpuhsswv';

interface BranchInfo {
  projectRef: string;
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  jwtSecret: string;
}

let cached: BranchInfo | null = null;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is required for integration tests. See tests/integration/README.md.`,
    );
  }
  return v;
}

export function getTestBranch(): BranchInfo {
  if (cached) return cached;

  const apiUrl = requireEnv('SUPABASE_URL');
  const anonKey = requireEnv('SUPABASE_ANON_KEY');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const jwtSecret = process.env.SUPABASE_JWT_SECRET ?? '';

  let projectRef: string;
  try {
    projectRef = new URL(apiUrl).hostname.split('.')[0];
  } catch {
    throw new Error(`SUPABASE_URL is malformed: ${apiUrl}`);
  }
  if (projectRef === PROD_REF) {
    throw new Error(
      `Refusing to run integration tests against production project ref ${PROD_REF}. SUPABASE_URL must point at the test branch.`,
    );
  }

  cached = { projectRef, apiUrl, anonKey, serviceRoleKey, jwtSecret };
  return cached;
}

export function __resetBranchCache(): void {
  cached = null;
}
