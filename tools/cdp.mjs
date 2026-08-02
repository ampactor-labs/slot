#!/usr/bin/env node
// Minimal CDP driver: launch headless Chrome, eval expressions in the page,
// collect console messages and exceptions. Zero packages (node >= 22).
// Usage: node cdp.mjs <url> <checks.mjs>
//
// Lifted wholesale from ~/Projects/spiral/tools/cdp.mjs. The process-tree
// teardown below is the part worth keeping and the part that took the work;
// it is unchanged.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2];
const checksFile = process.argv[3];
const port = 9333 + Math.floor(Math.random() * 200);
const profile = mkdtempSync(join(tmpdir(), "cdp-prof-"));

// --mute-audio: every assertion is structural (voice sets, param values,
// states); leaked or live bench Chromes must never reach the speakers.
// detached: chrome leads its own process group, so the kill below reaps the
// whole tree — SIGKILL to the main process alone leaves renderer children
// to notice the broken pipe on their own schedule, which is a leak window.
const chrome = spawn("google-chrome", [
  "--headless=new", "--disable-gpu", "--no-first-run", "--mute-audio",
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  "--autoplay-policy=no-user-gesture-required",
  "--window-size=900,900", "about:blank",
], { stdio: "ignore", detached: true });

const killChrome = () => {
  try { if (chrome.pid) process.kill(-chrome.pid, "SIGKILL"); } catch { /* gone */ }
};

// Chrome dies with us on every exit path; an escaped instance keeps running
// the page forever. Signals, stray throws, and normal completion all route
// through shutdown(), which waits for the child to actually exit before
// removing the profile — rmSync racing a dying Chrome's last writes loses
// with ENOTEMPTY and leaks the dir. SIGKILL, not SIGTERM: the profile is a
// throwaway tmpdir and a Chrome ignoring SIGTERM is exactly the orphan case.
// The sync 'exit' hook stays as a last resort for direct process.exit calls.
async function shutdown(code) {
  killChrome();
  if (chrome.exitCode === null && chrome.signalCode === null)
    await new Promise(r => { chrome.once("exit", r); setTimeout(r, 1500); });
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* busy */ }
  process.exit(code);
}
process.on("exit", killChrome);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(sig, () => shutdown(130));
process.on("uncaughtException", err => { console.error(err); shutdown(1); });
process.on("unhandledRejection", err => { console.error(err); shutdown(1); });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function targets() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      return await r.json();
    } catch { await sleep(250); }
  }
  throw new Error("chrome devtools port never came up");
}

const page = (await targets()).find(t => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let seq = 0;
const pending = new Map();
export const consoleLog = [];
const errors = [];

ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Runtime.consoleAPICalled") {
    const txt = m.params.args.map(a => a.value ?? a.description ?? "").join(" ");
    consoleLog.push(`[${m.params.type}] ${txt}`);
    if (m.params.type === "error") errors.push(txt);
  }
  if (m.method === "Runtime.exceptionThrown") {
    const d = m.params.exceptionDetails;
    errors.push(d.exception?.description || d.text);
  }
};

function send(method, params = {}) {
  return new Promise(res => {
    const id = ++seq;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url });
await sleep(1800);

export async function emulate(features) {
  await send("Emulation.setEmulatedMedia", { features });
}

// Phone-first means the narrow case is the real case, so it gets asserted
// rather than eyeballed. Pass no width to drop back to the window size.
export async function viewport(width, height, mobile = true) {
  if (!width) return send("Emulation.clearDeviceMetricsOverride");
  await send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile,
  });
}

export async function shot(path) {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  mkdirSync(dirname(path), { recursive: true });
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path, Buffer.from(r.result.data, "base64"));
  console.log("shot →", path);
}

export async function evalJS(expr, { awaitPromise = false } = {}) {
  const r = await send("Runtime.evaluate", {
    expression: expr, returnByValue: true, awaitPromise });
  if (r.result?.exceptionDetails)
    throw new Error("eval failed: " +
      (r.result.exceptionDetails.exception?.description || expr));
  return r.result?.result?.value;
}

let failures = 0;
export async function check(name, expr, expected, opts) {
  let got;
  try { got = await evalJS(expr, opts); }
  catch (e) { got = "THREW: " + e.message; }
  const ok = typeof expected === "function" ? expected(got)
           : JSON.stringify(got) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}  →  ${JSON.stringify(got)}`);
  return got;
}
export { sleep };

const { run } = await import(checksFile);
await run({ check, evalJS, sleep, consoleLog, shot, emulate, viewport });

if (errors.length) {
  failures += errors.length;
  console.log("PAGE ERRORS:");
  for (const e of errors) console.log("  " + e.split("\n")[0]);
} else console.log("no page errors");

await shutdown(failures ? 1 : 0);
