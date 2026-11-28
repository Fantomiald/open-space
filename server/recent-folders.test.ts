import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { projectFolder, projectKey } from './conversations.ts';
import { lastConversationTimes, mostRecentFirst } from './recent-folders.ts';

describe('mostRecentFirst', () => {
  it('puts the latest used first and keeps the folders never used in their order after them', () => {
    const times: Record<string, number> = { b: 10, d: 30 };
    assert.deepEqual(mostRecentFirst(['a', 'b', 'c', 'd', 'e'], (directory) => times[directory]), ['d', 'b', 'a', 'c', 'e']);
  });
});

describe('lastConversationTimes', () => {
  const withHome = async (run: (home: string) => Promise<void>) => {
    const home = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'office-recent-')));
    try { await run(home); } finally { rmSync(home, { recursive: true, force: true }); }
  };
  const conversation = (key: string, name: string, seconds: number) => {
    mkdirSync(key, { recursive: true });
    writeFileSync(path.join(key, name), '');
    utimesSync(path.join(key, name), seconds, seconds);
  };

  it('is the newest conversation file of each folder, and leaves out the folders with none', () => withHome(async (home) => {
    const key = projectFolder('/work/app', home);
    conversation(key, 'old.jsonl', 100);
    conversation(key, 'new.jsonl', 300);
    conversation(key, 'notes.txt', 900);
    const times = await lastConversationTimes(['/work/app', '/work/never'], home);
    assert.deepEqual([...times], [['/work/app', 300_000]]);
  }));

  it('finds the conversations of a path whose key Claude Code truncated and suffixed with a hash', () => withHome(async (home) => {
    const long = `/work/${'a'.repeat(250)}`;
    const key = path.join(home, '.claude', 'projects', `${projectKey(long).slice(0, 200)}-x1y2z3`);
    conversation(key, 'a.jsonl', 500);
    conversation(`${key}-other`, 'b.jsonl', 700);
    assert.equal((await lastConversationTimes([long], home)).get(long), 700_000);
  }));

  it('reuses a folder time for 30 seconds, then reads the disk again', () => withHome(async (home) => {
    const key = projectFolder('/work/cached', home);
    conversation(key, 'a.jsonl', 100);
    assert.equal((await lastConversationTimes(['/work/cached'], home, 1_000_000)).get('/work/cached'), 100_000);
    conversation(key, 'b.jsonl', 200);
    assert.equal((await lastConversationTimes(['/work/cached'], home, 1_010_000)).get('/work/cached'), 100_000);
    assert.equal((await lastConversationTimes(['/work/cached'], home, 1_031_000)).get('/work/cached'), 200_000);
  }));
});
