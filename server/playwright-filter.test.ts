import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { installFilter } from './playwright-filter.ts';

// a Playwright server of its own: for a request, an answer and a snapshot file that show the key typed into a page
const FAKE_SERVER = String.raw`
const fs = require('node:fs'); const path = require('node:path');
const dir = process.argv[process.argv.indexOf('--output-dir') + 1];
process.stdin.resume();
process.stdin.on('end', () => {
  fs.mkdirSync(dir, { recursive: true });
  const text = '- textbox "Password": hunter2-staging\n- textbox "Quoted": "say \\"hi\\""';
  fs.writeFileSync(path.join(dir, 'page-1.yml'), text + '\n');
  fs.writeFileSync(path.join(dir, 'shot.png'), 'hunter2-staging');
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text }, { type: 'image', data: 'iVBORw0KGgoabc', mimeType: 'image/png' }] } }) + '\n');
  process.stdout.write('not json hunter2-staging\n');
  process.exitCode = 3;
});`;

describe('the filter around a session’s Playwright server', { skip: process.platform === 'win32' }, () => {
  let base: string;
  let server: http.Server;
  let endpoint: string;
  const asked: string[] = [];

  before(async () => {
    base = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'office-filter-')));
    server = http.createServer((req, res) => {
      asked.push(`${req.method} ${req.url} ${req.headers.origin ?? 'no origin'}`);
      res.end(JSON.stringify({ STAGING_PASSWORD: 'hunter2-staging', GREETING: 'say "hi"', PIN: 'abc' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/secrets/s/key`;
  });
  after(() => { server.close(); rmSync(base, { recursive: true, force: true }); });

  function run(folder: string, env: Record<string, string>): Promise<{ code: number; stdout: string }> {
    const filter = installFilter(path.join(base, 'data'));
    const cwd = path.join(base, folder);
    mkdirSync(cwd, { recursive: true });
    const fake = path.join(base, 'fake-server.cjs');
    writeFileSync(fake, FAKE_SERVER);
    return new Promise((resolve) => {
      const child = execFile('node', [filter, 'node', fake], { cwd, env: { PATH: process.env.PATH ?? '', ...env } }, (error, stdout) => {
        resolve({ code: error ? Number(error.code) : 0, stdout });
      });
      child.stdin?.end('{"jsonrpc":"2.0","id":1,"method":"tools/call"}\n');
    });
  }

  it('hides the keys in the server’s answers and in the files it writes, and keeps its exit code', async () => {
    const { code, stdout } = await run('project', { OPEN_SPACE_SECRETS: endpoint });
    assert.equal(code, 3);
    assert.doesNotMatch(stdout, /hunter2-staging|say \\+"hi/);
    const [answer, plain] = stdout.trimEnd().split('\n');
    const hidden = '- textbox "Password": <secret>STAGING_PASSWORD</secret>\n- textbox "Quoted": "<secret>GREETING</secret>"';
    assert.equal(JSON.parse(answer).result.content[0].text, hidden);
    assert.equal(plain, 'not json <secret>STAGING_PASSWORD</secret>');
    // a key this short is found by chance anywhere, and a picture's base64 is never touched
    assert.equal(JSON.parse(answer).result.content[1].data, 'iVBORw0KGgoabc');
    // Playwright's own default folder, given to it so that both agree on where its files are
    const files = path.join(base, 'project', '.playwright-mcp');
    assert.equal(readFileSync(path.join(files, 'page-1.yml'), 'utf8'), `${hidden}\n`);
    assert.equal(readFileSync(path.join(files, 'shot.png'), 'utf8'), 'hunter2-staging', 'an image is left as it is');
    assert.match(asked[0], /^POST \/secrets\/s\/key\/values no origin$/);
  });

  it('passes everything through outside Open Space', async () => {
    const { code, stdout } = await run('outside', {});
    assert.equal(code, 3);
    assert.match(stdout, /hunter2-staging/);
  });
});
