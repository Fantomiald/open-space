import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { it } from 'node:test';
import { suggestRoots } from './paths.ts';
import { parseKnownFolders, windowsKnownFolders } from './system-folders.ts';
import { parsePreferences } from './settings.ts';

it('offers redirected Windows known folders, without scanning OneDrive, AppData or stale local copies', async () => {
  const home = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'os-known-folders-')));
  try {
    const desktop = path.join(home, 'OneDrive', 'Bureau'), documents = path.join(home, 'OneDrive', 'Documents');
    for (const folder of [desktop, documents, path.join(home, 'Desktop'), path.join(home, 'Documents'), path.join(home, 'AppData', 'project'), path.join(home, 'Code', 'app')]) mkdirSync(folder, { recursive: true });
    for (const folder of [path.join(home, 'AppData', 'project'), path.join(home, 'Code', 'app')]) writeFileSync(path.join(folder, 'package.json'), '{}');
    const paths = await windowsKnownFolders(home, JSON.stringify([desktop, documents]));
    assert.deepEqual(paths, [desktop, documents]);
    assert.deepEqual(suggestRoots(home, paths), [{ path: path.join(home, 'Code'), projects: 1 }, { path: desktop, projects: -1 }, { path: documents, projects: -1 }]);
    assert.deepEqual(parseKnownFolders(JSON.stringify(['relative', 42, desktop])), [desktop]);
    assert.deepEqual(parseKnownFolders('bad json'), []);
    assert.ok(!suggestRoots(home, [path.join(home, 'missing')]).some((entry) => entry.path.endsWith('missing')));
  } finally { rmSync(home, { recursive: true, force: true }); }
});

it('saves native Windows notes and numbers settings and expands legacy native home paths', { skip: process.platform !== 'win32' }, () => {
  assert.deepEqual(parsePreferences({ journalFolder: '~\\Journal', metricsFile: 'D:\\Stats\\chiffres.md' }, 'C:\\Users\\Test'), {
    journalFolder: 'C:\\Users\\Test\\Journal', metricsFile: 'D:\\Stats\\chiffres.md',
  });
});
