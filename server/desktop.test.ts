import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { it } from 'node:test';
import { findTerminals, openTerminal } from './desktop.ts';
import { parsePreferences } from './settings.ts';

it('reports a Windows terminal launch failure when the chosen folder disappeared', { skip: process.platform !== 'win32' }, async () => {
  const missing = path.join(os.tmpdir(), `missing-terminal-${randomUUID()} & 100% O'Brien`);
  await assert.rejects(openTerminal(missing), /terminal/i);
});

it('detects installed terminals, prefers PowerShell 7, and finds a portable Git installation on PATH', () => {
  const root = path.resolve(os.tmpdir(), 'terminal-detection');
  const system = path.join(root, 'Windows', 'System32');
  const git = path.join(root, 'PortableGit');
  const modern = path.join(root, 'PowerShell', '7');
  const files = new Set([path.join(system, 'cmd.exe'), path.join(modern, 'pwsh.exe'), path.join(git, 'git-bash.exe')]);
  const found = findTerminals({ SystemRoot: path.dirname(system), PATH: [modern, path.join(git, 'cmd')].join(path.delimiter) }, (file) => files.has(file));
  assert.deepEqual(found.map(({ id }) => id), ['cmd', 'powershell', 'git-bash']);
  assert.equal(found[1].path, path.join(modern, 'pwsh.exe'));
  assert.equal(found[2].path, path.join(git, 'git-bash.exe'));
  assert.deepEqual(findTerminals({}, () => false), []);
});

it('only accepts a known terminal preference, never an executable path or injected command', () => {
  for (const terminal of ['cmd', 'powershell', 'git-bash']) assert.equal(parsePreferences({ terminal }).terminal, terminal);
  for (const terminal of ['cmd.exe /c echo injected', 'D:\\tools\\custom.exe', 'unknown', 1]) assert.equal(parsePreferences({ terminal }).terminal, undefined);
});
