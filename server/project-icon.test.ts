import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { MAX_ICON_IMAGE } from '../shared/project-icons.ts';
import { findProjectPicture, MAX_PROJECT_PICTURE, PICTURE_GRACE_MS, saveProjectPicture, storedProjectPicture, sweepProjectPictures } from './project-icon.ts';

const scratch = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'office-project-icon-')));
after(() => rmSync(scratch, { recursive: true, force: true }));

describe('a project\'s own picture', () => {
  it('is its favicon before its logo, wherever it is kept, never a file too big to be one', () => {
    const project = path.join(scratch, 'app');
    mkdirSync(path.join(project, 'public'), { recursive: true });
    writeFileSync(path.join(project, 'favicon.png'), Buffer.alloc(MAX_PROJECT_PICTURE + 1, 1));
    writeFileSync(path.join(project, 'logo.png'), 'logo');
    writeFileSync(path.join(project, 'public', 'favicon.ico'), 'icon');
    assert.equal(findProjectPicture(project), path.join(project, 'public', 'favicon.ico'));
  });

  it('is none in a folder without one', () => {
    const project = path.join(scratch, 'empty');
    mkdirSync(project);
    assert.equal(findProjectPicture(project), null);
  });
});

describe('the pictures picked for projects', () => {
  const png = (body: string) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(body)]);
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);

  it('are kept once each, by their content, as PNG, JPEG or WebP only', () => {
    const folder = path.join(scratch, 'kept');
    const id = saveProjectPicture(folder, png('logo'));
    assert.match(id ?? '', /^[0-9a-f]{64}\.png$/);
    assert.equal(saveProjectPicture(folder, png('logo')), id);
    assert.match(saveProjectPicture(folder, webp) ?? '', /\.webp$/);
    assert.match(saveProjectPicture(folder, Buffer.from([0xff, 0xd8, 0xff, 0xe0])) ?? '', /\.jpg$/);
    assert.equal(saveProjectPicture(folder, Buffer.from('<svg onload="alert(1)"/>')), null, 'an SVG');
    assert.equal(saveProjectPicture(folder, png('x'.repeat(MAX_ICON_IMAGE))), null, 'too heavy');
    assert.equal(readdirSync(folder).length, 3);
  });

  it('are found by their id only, never by a path that leads elsewhere', () => {
    const folder = path.join(scratch, 'found');
    const id = saveProjectPicture(folder, png('found')) ?? '';
    assert.equal(storedProjectPicture(folder, id), path.join(folder, id));
    assert.equal(storedProjectPicture(folder, `../found/${id}`), null);
    assert.equal(storedProjectPicture(folder, `${'0'.repeat(64)}.png`), null, 'gone');
  });

  it('go once no icon shows them, unless just picked', async () => {
    const folder = path.join(scratch, 'swept');
    const shown = saveProjectPicture(folder, png('shown')) ?? '', replaced = saveProjectPicture(folder, png('replaced')) ?? '', picked = saveProjectPicture(folder, png('picked')) ?? '';
    const now = Date.now(), long = new Date(now - PICTURE_GRACE_MS - 1000);
    for (const id of [shown, replaced]) utimesSync(path.join(folder, id), long, long);
    assert.equal(await sweepProjectPictures(folder, { '/code/app': { kind: 'image', id: shown } }, now), 1);
    assert.deepEqual([shown, replaced, picked].map((id) => existsSync(path.join(folder, id))), [true, false, true]);
  });
});
