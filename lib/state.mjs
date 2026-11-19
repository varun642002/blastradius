// Per-session tally of what has been touched.
//
// A hook process starts fresh every call, so "how many files this session?"
// has to live on disk. Keyed by session id, under the temp directory — this is
// scratch data, and losing it only means a warning fires again.
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync, rmSync } from "node:fs";

export const DIR = process.env.BLASTRADIUS_STATE || join(tmpdir(), "blastradius");

function file(session) {
  mkdirSync(DIR, { recursive: true });
  const safe = String(session || "nosession").replace(/[^\w.-]/g, "_");
  return join(DIR, `${safe}.json`);
}

export function read(session) {
  const p = file(session);
  if (!existsSync(p)) return { files: [], warned: [] };
  try {
    const s = JSON.parse(readFileSync(p, "utf8"));
    return { files: Array.isArray(s.files) ? s.files : [], warned: Array.isArray(s.warned) ? s.warned : [] };
  } catch {
    return { files: [], warned: [] };
  }
}

export function write(session, state) {
  try {
    writeFileSync(file(session), JSON.stringify(state), "utf8");
  } catch {
    /* losing state only costs a repeated warning */
  }
}

/** Record a touched file. Returns the updated state. */
export function touch(session, path) {
  const s = read(session);
  const p = String(path || "").replace(/\\/g, "/");
  if (p && !s.files.includes(p)) s.files.push(p);
  write(session, s);
  return s;
}

/** True the first time this key is seen; warnings should not repeat. */
export function firstTime(session, key) {
  const s = read(session);
  if (s.warned.includes(key)) return false;
  s.warned.push(key);
  write(session, s);
  return true;
}

/** Remove state files older than a day, so the directory does not grow. */
export function sweep(maxAgeMs = 86_400_000) {
  try {
    for (const f of readdirSync(DIR)) {
      const p = join(DIR, f);
      if (Date.now() - statSync(p).mtimeMs > maxAgeMs) rmSync(p, { force: true });
    }
  } catch {
    /* nothing to sweep */
  }
}
