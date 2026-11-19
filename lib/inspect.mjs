// Decide what, if anything, to say about one tool call.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { categorise, riskyIn, loadConfigFrom, DEFAULTS } from "./rules.mjs";
import { touch, read, firstTime } from "./state.mjs";

const EDIT_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

export function loadConfig(dir = process.cwd()) {
  for (const name of [".blastradius.json", ".blastradius"]) {
    const p = join(dir, name);
    if (!existsSync(p)) continue;
    try {
      return loadConfigFrom(JSON.parse(readFileSync(p, "utf8")));
    } catch (e) {
      // Say so rather than silently applying defaults the user did not choose.
      process.stderr.write(`blastradius: ignoring ${name} — ${e.message}\n`);
      return { ...DEFAULTS };
    }
  }
  return { ...DEFAULTS };
}

function pathOf(input) {
  return input.file_path || input.notebook_path || input.path || "";
}

function lineCount(input) {
  const text = [input.content, input.new_string].filter((x) => typeof x === "string").join("\n");
  return text ? text.split("\n").length : 0;
}

/**
 * Inspect one call. Returns { notes: string[] } — empty means nothing to say.
 * Never blocks: these are warnings handed to Claude, not denials.
 */
export function inspectToolCall({ tool, input = {}, session = "", config = DEFAULTS, record = true }) {
  const notes = [];

  if (config.warnCommands && (tool === "Bash" || tool === "PowerShell")) {
    for (const r of riskyIn(input.command || "")) {
      if (!record || firstTime(session, `cmd:${r}`)) {
        notes.push(`This looks like a ${r}. Say what it will affect before running it.`);
      }
    }
    return { notes };
  }

  if (!EDIT_TOOLS.has(tool)) return { notes };

  const path = pathOf(input);
  if (!path) return { notes };

  if (config.warnSensitive) {
    for (const cat of categorise(path, config)) {
      if (!record || firstTime(session, `sensitive:${cat}`)) {
        notes.push(`${path} is ${cat}. Changes here reach further than the file itself.`);
      }
    }
  }

  const lines = lineCount(input);
  if (lines >= config.lineThreshold) {
    if (!record || firstTime(session, `lines:${path}`)) {
      notes.push(
        `This writes about ${lines} lines to ${path}. If it replaces an existing file, say what is being dropped.`
      );
    }
  }

  const state = record ? touch(session, path) : read(session);
  const count = state.files.length;
  if (count === config.fileThreshold || (count > config.fileThreshold && count % config.fileThreshold === 0)) {
    if (!record || firstTime(session, `files:${count}`)) {
      notes.push(
        `${count} files touched in this session. Worth a short summary of the change so far, and whether it still matches what was asked.`
      );
    }
  }

  return { notes };
}

export function formatNotes(notes) {
  if (!notes.length) return "";
  const head = notes.length === 1 ? "blastradius:" : "blastradius — a few things worth noting:";
  const body = notes.length === 1 ? ` ${notes[0]}` : "\n" + notes.map((n) => `  • ${n}`).join("\n");
  return head + body;
}
