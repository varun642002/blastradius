<div align="center">

# 💥 blastradius

### Say what a change is about to reach

*A guardrail, not a gate. It never blocks — it makes the reach of a change visible before it lands.*

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-plugin-D97757)](https://claude.com/claude-code)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue.svg)](package.json)
[![Tests](https://img.shields.io/badge/tests-21-success.svg)](test/smoke.mjs)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

---

## 😐 The problem

You ask for a small fix. Forty minutes later eleven files have changed, one of
them a migration, and you have no idea when that happened.

Nothing went wrong, exactly. You just stopped being able to see the edges of
the change.

## ✨ What it does

A `PreToolUse` hook that notices reach and says so:

```text
blastradius: migrations/004_add_branch.sql is a database migration.
Changes here reach further than the file itself.
```

```text
blastradius — a few things worth noting:
  • 10 files touched in this session. Worth a short summary of the change so
    far, and whether it still matches what was asked.
  • This looks like a force push. Say what it will affect before running it.
```

Claude sees the note and accounts for it. **Nothing is ever denied** — the
decision is always `allow`.

## 🚀 Install

```bash
claude plugin marketplace add varun642002/blastradius
```

```bash
claude plugin install blastradius@blastradius
```

Open a new session and it's active.

## 🔍 What it notices

**Sensitive paths** — a change here reaches past the file:

| Category | Matches |
|---|---|
| 🗄️ database migration | `migrations/`, `alembic/`, `prisma/migrations/` |
| 🧱 database schema | `schema.prisma`, `schema.sql`, `drizzle.config.ts` |
| 🔑 auth or permissions | `src/auth/…`, `permissions.ts`, `rbac.ts`, `session/` |
| 🛡️ security rules | `firestore.rules`, `storage.rules`, `*.rules` |
| ⚙️ CI configuration | `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile` |
| ☁️ infrastructure | `terraform/`, `*.tf`, `k8s/`, `helm/`, `ansible/` |
| 📦 container or deploy | `Dockerfile`, `docker-compose.yml`, `vercel.json`, `fly.toml` |
| 🔒 dependency lockfile | `package-lock.json`, `yarn.lock`, `Cargo.lock`, `go.sum` |
| 💳 payments | `stripe*.ts`, `billing*.ts`, `payout*.ts` |

**Risky commands** — worth a sentence before running:

force push · history rewrite (`rebase`, `reset --hard`, `filter-branch`) ·
branch or tag deletion · recursive delete · database reset · deploy
(`gcloud run deploy`, `terraform apply`, `kubectl apply`, `fly deploy`) ·
global install · `npm audit fix --force`

**Scale** — 10+ files touched in one session, or a single write over 400 lines.

Each warning fires **once per session**, so it stays a note rather than nagging.

## 🔧 Configuration

A `.blastradius.json` in your project root:

```json
{
  "fileThreshold": 10,
  "lineThreshold": 400,
  "warnSensitive": true,
  "warnCommands": true,
  "ignore": ["^vendor/", "^generated/"],
  "extraSensitive": [
    { "name": "pricing table", "re": "src/pricing" }
  ]
}
```

| Variable | Effect |
|---|---|
| `BLASTRADIUS=0` | Disable entirely |
| `BLASTRADIUS_STATE` | Where the per-session tally is kept (default: temp dir) |

## ⚠️ What this is and isn't

> [!NOTE]
> **It never blocks, by design.** Every decision is `allow`. A guardrail that
> interrupts work gets switched off, and then it guards nothing. If you want a
> hard stop on secrets, that is a different job —
> [secretguard](https://github.com/varun642002/secretguard) denies.

> [!IMPORTANT]
> **It is pattern matching, not understanding.** It knows `migrations/` is a
> migration; it does not know whether *your* change is safe. Treat a note as a
> prompt to think, not a verdict.

**It warns once per session per category.** The second migration in a session
is silent — deliberately, because a note you learn to skip is worse than none.

## 🧭 Notes for anyone forking this

- **A hook process starts fresh every call**, so "how many files this session?"
  lives in a JSON file under the temp directory keyed by session id. State files
  older than a day are swept on each run.
- **`[^/]*` cannot cross a path separator.** The auth rule originally matched
  `authGuard.ts` but *not* `src/auth/verifyRequest.ts`, which is the common
  case. Directory segments and filenames need separate alternatives — and
  `src/authors/` must not match either. There is a test for all three.
- **Fail open, always.** Bad input, a broken config or an internal error all
  result in `allow` with no message.

## 🤝 Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). No dependencies, please.
Every new rule needs a test for what it catches **and** one for the near-miss
it must ignore.

- [ ] A `Stop`-hook session summary: everything touched, grouped by category
- [ ] Per-category thresholds
- [ ] `ask` mode for a chosen category, for people who do want a gate

## 📄 License

[MIT](LICENSE)
