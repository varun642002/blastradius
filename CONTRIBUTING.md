# Contributing to blastradius

## Two rules

1. **No dependencies.**
2. **Never deny.** Every code path returns `allow`. This plugin exists to make
   reach visible; the moment it interrupts work, people switch it off and it
   guards nothing.

## Setup

```bash
git clone https://github.com/varun642002/blastradius && cd blastradius && node test/smoke.mjs
```

There is no build step.

## Every rule needs two tests

One for what it catches, one for the near-miss it must ignore. `src/auth/` is a
hit; `src/authors/` is not. A noisy guardrail is a disabled guardrail.

## Things to know

- **State lives on disk.** A hook process starts fresh each call, so the
  per-session file tally is a JSON file under the temp directory, keyed by
  session id, swept after a day. Tests point `BLASTRADIUS_STATE` at a temp dir.
- **`[^/]*` does not cross `/`.** A rule meant to match a directory segment
  needs its own alternative; matching only filenames misses the common case.
- **Warn once per session per key.** Repetition is what makes a warning
  invisible.
- **Fail open and say nothing** on bad input, a broken config or an internal
  error. Diagnostics go to stderr, never into the decision.
