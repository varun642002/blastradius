// What counts as a wide or sensitive change.
//
// blastradius WARNS; it does not block. A guardrail that stops work gets
// uninstalled, and the goal is to make Claude pause and say what it is about
// to touch, not to fight it.

/** Paths where a mistake is expensive or hard to notice. */
export const SENSITIVE = [
  { name: "database migration", re: /(^|\/)(migrations?|migrate|alembic|prisma\/migrations)\//i },
  { name: "database schema", re: /(^|\/)(schema\.(prisma|sql|rb)|drizzle\.config\.[cm]?[jt]s)$/i },
  // Matches a directory segment (src/auth/anything.ts) as well as a file
  // (authGuard.ts). The directory case is the common one and was missed at
  // first, because [^/]* cannot cross a separator.
  {
    name: "auth or permissions",
    re: /(^|\/)(auth|authz|authentication|permissions?|rbac|roles?|session)(\/|[^/]*\.[cm]?[jt]sx?$)/i,
  },
  { name: "security rules", re: /\.rules$|(^|\/)(firestore|storage)\.rules$/i },
  { name: "CI configuration", re: /(^|\/)(\.github\/workflows|\.gitlab-ci\.yml|\.circleci|azure-pipelines|Jenkinsfile)/i },
  { name: "infrastructure", re: /(^|\/)(terraform|\.tf$|cloudformation|k8s|kubernetes|helm|ansible)/i },
  { name: "container or deploy", re: /(^|\/)(Dockerfile|docker-compose\.ya?ml|fly\.toml|vercel\.json|app\.yaml|cloudbuild\.ya?ml|Procfile)$/i },
  { name: "dependency lockfile", re: /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|Cargo\.lock|go\.sum|composer\.lock)$/i },
  { name: "package manifest", re: /(^|\/)(package\.json|pyproject\.toml|Cargo\.toml|go\.mod|Gemfile)$/i },
  { name: "payments", re: /(^|\/)[^/]*(stripe|billing|payment|invoice|payout|razorpay|paypal)[^/]*\.[cm]?[jt]sx?$/i },
  { name: "environment template", re: /(^|\/)\.env\.(example|sample|template)$/i },
  { name: "git or tooling config", re: /(^|\/)(\.gitignore|\.gcloudignore|\.npmrc|tsconfig\.json|\.eslintrc[^/]*)$/i },
];

/** Shell commands worth a second look before they run. */
export const RISKY_COMMANDS = [
  { name: "force push", re: /\bgit\s+push\b[^|;&]*--force(?!-with-lease)/i },
  { name: "history rewrite", re: /\bgit\s+(rebase|filter-branch|reset\s+--hard)\b/i },
  { name: "branch or tag deletion", re: /\bgit\s+(branch|tag)\s+-[dD]\b/i },
  { name: "recursive delete", re: /\brm\s+-[a-z]*r[a-z]*f?\b|\bRemove-Item\b[^|;&]*-Recurse/i },
  { name: "database reset", re: /\b(db|database)[:\s-](reset|drop|push --force)\b|\bdrop\s+(table|database)\b/i },
  { name: "dependency install that rewrites the lockfile", re: /\bnpm\s+(install|i)\b(?![^|;&]*--package-lock-only)[^|;&]*--force|\bnpm\s+audit\s+fix\s+--force/i },
  { name: "deploy", re: /\b(gcloud\s+run\s+deploy|vercel\s+--prod|fly\s+deploy|kubectl\s+apply|terraform\s+apply|serverless\s+deploy)\b/i },
  { name: "global install", re: /\bnpm\s+(install|i)\s+-g\b|\bpip\s+install\b(?![^|;&]*-r\b)[^|;&]*--user/i },
];

export const DEFAULTS = {
  // Above this many files touched in one session, say so.
  fileThreshold: 10,
  // Above this many lines in a single write, say so.
  lineThreshold: 400,
  warnSensitive: true,
  warnCommands: true,
};

export function loadConfigFrom(json) {
  if (!json || typeof json !== "object") return { ...DEFAULTS };
  const cfg = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) {
    if (json[k] !== undefined) cfg[k] = json[k];
  }
  cfg.ignore = Array.isArray(json.ignore) ? json.ignore : [];
  cfg.extraSensitive = Array.isArray(json.extraSensitive) ? json.extraSensitive : [];
  return cfg;
}

function norm(p) {
  return String(p || "").replace(/\\/g, "/");
}

/** Which sensitive categories a path falls into. */
export function categorise(path, cfg = DEFAULTS) {
  const p = norm(path);
  if ((cfg.ignore || []).some((re) => new RegExp(re, "i").test(p))) return [];
  const extra = (cfg.extraSensitive || []).map((r) =>
    typeof r === "string" ? { name: "project rule", re: new RegExp(r, "i") } : { name: r.name, re: new RegExp(r.re, "i") }
  );
  return [...SENSITIVE, ...extra].filter((s) => s.re.test(p)).map((s) => s.name);
}

export function riskyIn(command) {
  if (!command) return [];
  return RISKY_COMMANDS.filter((r) => r.re.test(command)).map((r) => r.name);
}
