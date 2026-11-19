#!/usr/bin/env node
// Dependency-free tests. Run: node test/smoke.mjs
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "blastradius-test-"));
process.env.BLASTRADIUS_STATE = dir;

const { categorise, riskyIn, loadConfigFrom, DEFAULTS } = await import("../lib/rules.mjs");
const { inspectToolCall, formatNotes } = await import("../lib/inspect.mjs");
const { touch, read, firstTime } = await import("../lib/state.mjs");

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = join(HERE, "..", "hooks", "pre-tool-use.mjs");

let passed = 0;
let failed = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}\n      ${e.message}`);
    failed++;
  }
};
const ok = (v, m) => {
  if (!v) throw new Error(m || "expected truthy");
};
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${m || "mismatch"}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
};

let n = 0;
const sess = () => `s${++n}`;
const notes = (tool, input, session = sess(), config = DEFAULTS) =>
  inspectToolCall({ tool, input, session, config }).notes;

console.log("sensitive paths");

check("recognises the categories it claims to", () => {
  const cases = [
    ["migrations/001_init.sql", "database migration"],
    ["prisma/schema.prisma", "database schema"],
    ["src/auth/verifyRequest.ts", "auth or permissions"],
    ["firestore.rules", "security rules"],
    [".github/workflows/ci.yml", "CI configuration"],
    ["infra/terraform/main.tf", "infrastructure"],
    ["Dockerfile", "container or deploy"],
    ["package-lock.json", "dependency lockfile"],
    ["package.json", "package manifest"],
    ["src/lib/stripeClient.ts", "payments"],
    [".gitignore", "git or tooling config"],
  ];
  for (const [p, want] of cases) {
    ok(categorise(p).includes(want), `${p} should be "${want}", got ${JSON.stringify(categorise(p))}`);
  }
});

check("leaves ordinary source alone", () => {
  for (const p of ["src/components/Button.tsx", "README.md", "src/utils/format.ts", "test/foo.test.js"]) {
    eq(categorise(p), [], `should be plain: ${p}`);
  }
});

check("handles Windows separators", () => {
  ok(categorise("src\\auth\\session.ts").includes("auth or permissions"), "backslashes");
});

check("ignore patterns win", () => {
  const cfg = loadConfigFrom({ ignore: ["^vendor/"] });
  eq(categorise("vendor/migrations/x.sql", cfg), [], "ignored");
});

check("extraSensitive adds project rules", () => {
  const cfg = loadConfigFrom({ extraSensitive: [{ name: "pricing table", re: "pricing" }] });
  ok(categorise("src/pricing.ts", cfg).includes("pricing table"), "custom rule");
});

console.log("risky commands");

check("spots the commands it claims to", () => {
  const cases = [
    ["git push --force origin main", "force push"],
    ["git reset --hard HEAD~3", "history rewrite"],
    ["git branch -D feature", "branch or tag deletion"],
    ["rm -rf build", "recursive delete"],
    ["npm run db:reset", "database reset"],
    ["gcloud run deploy app --source .", "deploy"],
    ["npm install -g something", "global install"],
    ["npm audit fix --force", "dependency install that rewrites the lockfile"],
  ];
  for (const [c, want] of cases) {
    ok(riskyIn(c).includes(want), `${c} should be "${want}", got ${JSON.stringify(riskyIn(c))}`);
  }
});

check("leaves everyday commands alone", () => {
  for (const c of ["git status", "npm test", "ls -la", "git push origin main", "npm ci", "rm file.txt"]) {
    eq(riskyIn(c), [], `should be plain: ${c}`);
  }
});

check("force-with-lease is not a force push", () => {
  eq(riskyIn("git push --force-with-lease origin main"), [], "lease is the safe form");
});

console.log("session tally");

check("counts distinct files only", () => {
  const s = sess();
  touch(s, "a.ts");
  touch(s, "a.ts");
  touch(s, "b.ts");
  eq(read(s).files.length, 2, "distinct count");
});

check("warns once the file threshold is crossed", () => {
  const s = sess();
  const cfg = loadConfigFrom({ fileThreshold: 3, warnSensitive: false });
  let got = [];
  for (let i = 0; i < 3; i++) {
    got = inspectToolCall({ tool: "Write", input: { file_path: `f${i}.ts` }, session: s, config: cfg }).notes;
  }
  ok(got.some((x) => x.includes("3 files touched")), `expected a file-count note, got ${JSON.stringify(got)}`);
});

check("does not repeat the same warning", () => {
  const s = sess();
  const first = notes("Write", { file_path: "firestore.rules" }, s);
  const second = notes("Write", { file_path: "firestore.rules" }, s);
  ok(first.length === 1, "first should warn");
  eq(second, [], "second should stay quiet");
});

check("firstTime is true once per key", () => {
  const s = sess();
  ok(firstTime(s, "k"), "first");
  ok(!firstTime(s, "k"), "second");
});

console.log("large writes");

check("flags a very large write", () => {
  const cfg = loadConfigFrom({ lineThreshold: 10, warnSensitive: false, fileThreshold: 999 });
  const got = inspectToolCall({
    tool: "Write",
    input: { file_path: "big.ts", content: Array(20).fill("x").join("\n") },
    session: sess(),
    config: cfg,
  }).notes;
  ok(got.some((x) => x.includes("20 lines")), `expected a size note, got ${JSON.stringify(got)}`);
});

check("a small write says nothing", () => {
  eq(notes("Write", { file_path: "small.ts", content: "one line" }), [], "should be quiet");
});

console.log("scope");

check("ignores tools it is not about", () => {
  eq(notes("Read", { file_path: "migrations/x.sql" }), [], "reads are not changes");
  eq(notes("Grep", { path: "migrations" }), [], "searches are not changes");
});

check("formatNotes renders one note and many", () => {
  eq(formatNotes([]), "", "empty");
  ok(formatNotes(["a"]).startsWith("blastradius:"), "single");
  ok(formatNotes(["a", "b"]).includes("•"), "bulleted");
});

console.log("hook");

const runHook = (payload, env = {}) =>
  JSON.parse(
    execFileSync(process.execPath, [HOOK], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: { ...process.env, ...env },
    })
  );

check("always allows", () => {
  const out = runHook({ tool_name: "Write", tool_input: { file_path: "firestore.rules" }, session_id: sess() });
  eq(out.hookSpecificOutput.permissionDecision, "allow", "must never deny");
});

check("passes the warning to Claude", () => {
  const out = runHook({ tool_name: "Write", tool_input: { file_path: "migrations/2.sql" }, session_id: sess() });
  ok(out.systemMessage && out.systemMessage.includes("migration"), `expected a message, got ${JSON.stringify(out)}`);
});

check("stays silent on ordinary edits", () => {
  const out = runHook({ tool_name: "Write", tool_input: { file_path: "src/Button.tsx" }, session_id: sess() });
  ok(!out.systemMessage, `should say nothing, got ${JSON.stringify(out)}`);
});

check("garbage input allows without crashing", () => {
  const out = JSON.parse(
    execFileSync(process.execPath, [HOOK], { input: "not json", encoding: "utf8", env: process.env })
  );
  eq(out.hookSpecificOutput.permissionDecision, "allow", "fail open");
});

check("BLASTRADIUS=0 disables it", () => {
  const out = runHook(
    { tool_name: "Write", tool_input: { file_path: "firestore.rules" }, session_id: sess() },
    { BLASTRADIUS: "0" }
  );
  ok(!out.systemMessage, "kill switch should silence it");
});

rmSync(dir, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
