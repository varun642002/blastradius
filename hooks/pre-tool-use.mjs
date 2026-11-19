#!/usr/bin/env node
// PreToolUse: say what a change is about to reach. Always allows.
//
// Nothing here may throw or deny. A guardrail that interrupts work gets
// switched off, and then it guards nothing.
import { inspectToolCall, loadConfig, formatNotes } from "../lib/inspect.mjs";
import { sweep } from "../lib/state.mjs";

let input = {};
try {
  input = JSON.parse((await readStdin()) || "{}") || {};
} catch {
  /* unparseable payload: stay out of the way */
}

if (process.env.BLASTRADIUS === "0") allow();

let notes = [];
try {
  sweep();
  const config = loadConfig(input.cwd || process.cwd());
  notes = inspectToolCall({
    tool: input.tool_name || "",
    input: input.tool_input || {},
    session: input.session_id || "",
    config,
  }).notes;
} catch {
  allow();
}

allow(notes);

function allow(notes = []) {
  const out = {
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" },
  };
  const msg = formatNotes(notes);
  if (msg) out.systemMessage = msg;
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

function readStdin() {
  return new Promise((res) => {
    let d = "";
    if (process.stdin.isTTY) return res("");
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (d += c));
    process.stdin.on("end", () => res(d));
    setTimeout(() => res(d), 5000).unref?.();
  });
}
