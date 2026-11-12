// The filter Open Space puts around each Playwright server it gives a session (server/browser.ts playwrightServer): the
// server's answers, and the text files it writes, with the session's keys replaced by <secret>NAME</secret>. A key typed
// into a page (`os-secret type`) is in its snapshots (Playwright writes out every field's value, passwords included), and
// Playwright's own --secrets reads its keys once, at its start, before the session asks for any. A script of its own:
// Claude Code launches it (`node <file> <server command>…`), and the app's code is in no file node can read.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const FILTER_SCRIPT = String.raw`// Open Space's filter around a Playwright MCP server (server/playwright-filter.ts), rewritten at each start of Open Space.
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const ASK_TIMEOUT_MS = 2000;
// a file written during a scan is looked at again by the next one
const SCAN_SLACK_MS = 2000;
const TEXT_FILE = /\.(ya?ml|md|txt|log|json)$/i;
// as the mask of os-secret run: a shorter value is found by chance everywhere (a screenshot's base64, any word)
const MIN_HIDDEN = 4;

const [command, ...given] = process.argv.slice(2);
if (!command) { process.stderr.write('usage: node playwright-filter.mjs COMMAND [ARGS...]\n'); process.exit(2); }
const endpoint = process.env.OPEN_SPACE_SECRETS;
// where Playwright writes its files: told to it when not chosen, so that both agree
const at = given.findIndex((arg) => arg === '--output-dir' || arg.startsWith('--output-dir='));
const chosen = at < 0 ? process.env.PLAYWRIGHT_MCP_OUTPUT_DIR : given[at].includes('=') ? given[at].slice('--output-dir='.length) : given[at + 1];
const outputDir = path.resolve(chosen || '.playwright-mcp');
const args = chosen ? given : [...given, '--output-dir', outputDir];

// value -> name; a key once seen stays hidden: a page may still hold it after the session forgot it
const keys = new Map();

/** The session's keys, asked for each answer (one call to Open Space on this machine): a key given meanwhile is hidden too. */
function askKeys() {
  if (!endpoint) return Promise.resolve();
  return new Promise((resolve) => {
    const request = http.request(endpoint + '/values', { method: 'POST', timeout: ASK_TIMEOUT_MS }, (answer) => {
      let body = '';
      answer.setEncoding('utf8');
      answer.on('data', (chunk) => { body += chunk; });
      answer.on('end', () => {
        try { if (answer.statusCode === 200) for (const [name, value] of Object.entries(JSON.parse(body))) if (typeof value === 'string' && value.length >= MIN_HIDDEN) keys.set(value, name); } catch {}
        resolve();
      });
      answer.on('error', () => resolve());
    });
    request.on('timeout', () => request.destroy());
    // Open Space unreachable: the keys already seen
    request.on('error', () => resolve());
    request.end();
  });
}

/** A text with the keys replaced, as they are and as a quoted YAML or JSON string writes them; the longest first. */
function hide(text) {
  let out = text;
  for (const [value, name] of [...keys].sort(([a], [b]) => b.length - a.length)) {
    // split and join rather than replaceAll: the node on PATH may be older than 15
    for (const form of new Set([value, JSON.stringify(value).slice(1, -1)])) out = out.split(form).join('<secret>' + name + '</secret>');
  }
  return out;
}

// an image's base64 is left whole: a match in it is chance, and replacing it breaks the picture
const hideIn = (node) => typeof node === 'string' ? hide(node) : Array.isArray(node) ? node.map(hideIn)
  : node && typeof node === 'object' ? Object.fromEntries(Object.entries(node).map(([key, value]) => [key, node.type === 'image' && key === 'data' ? value : hideIn(value)])) : node;

/** A message of the server (a line of JSON): the keys replaced in its strings, so that it stays valid JSON. */
function hideInMessage(line) {
  try { return JSON.stringify(hideIn(JSON.parse(line))); } catch { return hide(line); }
}

let scannedAt = 0;
/** The text files the server wrote since the last scan, before its answer tells where they are. */
// ponytail: one readdir per answer, a watcher if the folder ever holds thousands of files
function hideInFiles() {
  const since = scannedAt - SCAN_SLACK_MS;
  scannedAt = Date.now();
  let names;
  try { names = readdirSync(outputDir, { recursive: true }); } catch { return; }
  for (const name of names) {
    if (!TEXT_FILE.test(name)) continue;
    const file = path.join(outputDir, name);
    try {
      if (statSync(file).mtimeMs < since) continue;
      const text = readFileSync(file, 'utf8');
      const hidden = hide(text);
      if (hidden !== text) writeFileSync(file, hidden);
    } catch {}
  }
}

const child = spawn(command, args, { stdio: ['inherit', 'pipe', 'inherit'] });
let queue = Promise.resolve();
let rest = '';
// in order, each once the keys are known
const pass = (line) => {
  queue = queue.then(async () => {
    await askKeys();
    if (keys.size) hideInFiles();
    process.stdout.write((keys.size ? hideInMessage(line) : line) + '\n');
  }).catch((error) => {
    // this message is dropped (it may hold a key), never the ones after it
    process.stderr.write('playwright-filter: ' + (error && error.message) + '\n');
  });
};
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  const lines = (rest + chunk).split('\n');
  rest = lines.pop();
  for (const line of lines) pass(line);
});
child.on('error', (error) => { process.stderr.write('playwright-filter: ' + error.message + '\n'); process.exitCode = 1; });
child.on('close', (code) => {
  if (rest) pass(rest);
  // not process.exit: what is still being written to a pipe would be lost
  queue.then(() => { process.exitCode = code ?? 1; });
});
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal));
`;

/** Writes the filter under OFFICE_DIR/bin, next to os-secret: rewritten at each start, so it follows Open Space's version. */
export function installFilter(dataDir: string): string {
  const folder = path.join(dataDir, 'bin');
  mkdirSync(folder, { recursive: true });
  const file = path.join(folder, 'playwright-filter.mjs');
  writeFileSync(file, FILTER_SCRIPT, { mode: 0o644 });
  return file;
}
