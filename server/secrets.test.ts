import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { parseEnvBlock, SECRET_TTL_MS } from '../shared/secrets.ts';
import { parseClientMessage } from './messages.ts';
import { answerSecrets, envFileAt, envValue, installScript, SecretStore, withEnvLine, type SecretsApiDeps } from './secrets.ts';

let base: string;
before(() => { base = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'office-secrets-'))); });
after(() => rmSync(base, { recursive: true, force: true }));

describe('the keys given to a session', () => {
  it('keeps them by session, gives back their names only, and forgets them', () => {
    const changed: string[] = [];
    const store = new SecretStore((id) => changed.push(id));
    assert.deepEqual(store.set('a', [{ name: 'TOKEN', value: 'one' }, { name: 'bad name', value: 'x' }, { name: 'EMPTY', value: '' }, { name: 'TOKEN', value: 'two' }]), ['TOKEN']);
    assert.equal(store.get('a', 'TOKEN'), 'two', 'the later one wins');
    assert.equal(store.get('b', 'TOKEN'), null, 'another session has none');
    store.set('a', [{ name: 'API_KEY', value: 'k' }]);
    assert.deepEqual(store.names('a'), ['API_KEY', 'TOKEN']);
    store.drop('a', 'TOKEN');
    assert.deepEqual(store.names('a'), ['API_KEY']);
    store.drop('a');
    assert.deepEqual(store.names('a'), []);
    assert.deepEqual(changed, ['a', 'a', 'a', 'a']);
  });

  it('forgets them after their time', () => {
    let now = 0;
    const changed: string[] = [];
    const store = new SecretStore((id) => changed.push(id), () => now);
    store.set('a', [{ name: 'TOKEN', value: 'one' }]);
    now = SECRET_TTL_MS;
    assert.equal(store.get('a', 'TOKEN'), null);
    assert.deepEqual(store.names('a'), []);
    store.sweep();
    assert.deepEqual(changed, ['a', 'a'], 'the page is told when they go');
  });

  it('reads a pasted .env block, and nothing else as one', () => {
    assert.deepEqual(parseEnvBlock('# keys\nexport A=1\nB = "two words"\n\nC=\'x=y\''), [{ name: 'A', value: '1' }, { name: 'B', value: 'two words' }, { name: 'C', value: 'x=y' }]);
    assert.equal(parseEnvBlock('sk-abc123'), null, 'a lone value');
    assert.equal(parseEnvBlock('A=1\nnot a line'), null);
  });

  it('accepts keys from the page, with valid names only', () => {
    assert.deepEqual(parseClientMessage({ t: 'secrets', sessionId: 's1', requestId: 'secrets-1', entries: [{ name: 'TOKEN', value: ' padded ' }] }), { t: 'secrets', sessionId: 's1', requestId: 'secrets-1', entries: [{ name: 'TOKEN', value: ' padded ' }] });
    assert.equal(parseClientMessage({ t: 'secrets', sessionId: 's1', entries: [{ name: '1BAD', value: 'x' }] }), null);
    assert.equal(parseClientMessage({ t: 'secrets', sessionId: 's1', entries: [] }), null);
    assert.deepEqual(parseClientMessage({ t: 'forgetSecrets', sessionId: 's1' }), { t: 'forgetSecrets', sessionId: 's1' });
    assert.equal(parseClientMessage({ t: 'forgetSecrets', sessionId: 's1', names: ['a b'] }), null);
  });
});

describe('a key written into a .env file', () => {
  it('replaces its line where it is, keeps export, or adds it at the end', () => {
    assert.equal(withEnvLine('A=1\nTOKEN=old\nB=2\n', 'TOKEN', 'new'), 'A=1\nTOKEN=new\nB=2\n');
    assert.equal(withEnvLine('export TOKEN=old', 'TOKEN', 'new'), 'export TOKEN=new');
    assert.equal(withEnvLine('A=1', 'TOKEN', 'new'), 'A=1\nTOKEN=new\n');
    assert.equal(withEnvLine('MY_TOKEN=keep\n', 'TOKEN', 'new'), 'MY_TOKEN=keep\nTOKEN=new\n', 'another name ending the same is left alone');
    assert.equal(envValue('sk-abc_1.2'), 'sk-abc_1.2');
    assert.equal(envValue('a b"c\\'), '"a b\\"c\\\\"');
  });

  it('stays inside the folders sessions work in', () => {
    const root = path.join(base, 'projects');
    mkdirSync(path.join(root, 'app'), { recursive: true });
    mkdirSync(path.join(base, 'elsewhere'));
    writeFileSync(path.join(base, 'elsewhere', '.env'), '');
    symlinkSync(path.join(base, 'elsewhere', '.env'), path.join(root, 'app', '.env.link'));
    assert.equal(envFileAt(path.join(root, 'app'), '.env', [root]), path.join(root, 'app', '.env'));
    assert.equal(envFileAt(path.join(root, 'app'), '../../elsewhere/.env', [root]), null);
    assert.equal(envFileAt(path.join(root, 'app'), '.env.link', [root]), null, 'a link out');
    assert.equal(envFileAt(path.join(root, 'app'), 'missing/.env', [root]), null, 'its folder must exist');
  });
});

/** a fake Open Space: the store, a user who answers every box with `given`, and a browser that records cookies */
function deps(store: SecretStore, roots: string[], given: Record<string, string> | null, cookies: unknown[] = []): SecretsApiDeps {
  return {
    store, roots: () => roots,
    ask: async (sessionId, names) => {
      if (!given) return null;
      store.set(sessionId, names.flatMap((name) => (given[name] ? [{ name, value: given[name] }] : [])));
      return store.names(sessionId);
    },
    setCookie: async (_, cookie) => { cookies.push(cookie); },
  };
}

describe('what os-secret asks for', () => {
  const form = (fields: Record<string, string>) => new URLSearchParams(fields);

  it('asks the user only for the keys missing, and says when they refuse', async () => {
    const store = new SecretStore(() => {});
    store.set('s', [{ name: 'HELD', value: 'h' }]);
    const asked: string[][] = [];
    const api = { ...deps(store, [base], { NEW: 'n' }), ask: async (id: string, names: string[]) => { asked.push(names); store.set(id, [{ name: 'NEW', value: 'n' }]); return store.names(id); } };
    const reply = await answerSecrets({ sessionId: 's', action: 'ask', form: form({ names: ' HELD NEW' }) }, api);
    assert.equal(reply.status, 200);
    assert.deepEqual(asked, [['NEW']]);
    assert.match(reply.text, /Ready: HELD, NEW/);
    assert.equal((await answerSecrets({ sessionId: 's', action: 'ask', form: form({ names: 'OTHER' }) }, deps(store, [base], null))).status, 409);
    assert.equal((await answerSecrets({ sessionId: 's', action: 'ask', form: form({ names: 'not-a-name' }) }, api)).status, 400);
  });

  it('writes, sets as a cookie and forgets a key, never telling its value', async () => {
    const store = new SecretStore(() => {});
    store.set('s', [{ name: 'TOKEN', value: 'tok-123456' }]);
    const cookies: unknown[] = [];
    const api = deps(store, [base], null, cookies);
    const env = await answerSecrets({ sessionId: 's', action: 'env', form: form({ name: 'TOKEN', cwd: base, file: '.env.local', as: 'APP_TOKEN' }) }, api);
    assert.equal(env.status, 200);
    assert.doesNotMatch(env.text, /tok-123456/);
    assert.equal(readFileSync(path.join(base, '.env.local'), 'utf8'), 'APP_TOKEN=tok-123456\n');
    assert.equal(statSync(path.join(base, '.env.local')).mode & 0o777, 0o600);
    const cookie = await answerSecrets({ sessionId: 's', action: 'cookie', form: form({ name: 'TOKEN', url: 'https://example.com', as: 'sid' }) }, api);
    assert.equal(cookie.status, 200);
    assert.deepEqual(cookies, [{ name: 'sid', value: 'tok-123456', url: 'https://example.com' }]);
    assert.equal((await answerSecrets({ sessionId: 's', action: 'cookie', form: form({ name: 'TOKEN', url: 'file:///etc' }) }, api)).status, 400);
    assert.equal((await answerSecrets({ sessionId: 's', action: 'list', form: form({}) }, api)).text, 'TOKEN');
    assert.equal((await answerSecrets({ sessionId: 's', action: 'forget', form: form({ name: 'TOKEN' }) }, api)).status, 200);
    assert.equal((await answerSecrets({ sessionId: 's', action: 'env', form: form({ name: 'TOKEN', cwd: base }) }, api)).status, 404);
  });
});

describe('the os-secret command', { skip: process.platform === 'win32' }, () => {
  let server: http.Server;
  let url: string;
  const store = new SecretStore(() => {});
  const run = (args: string[], cwd = base) => new Promise<{ code: number; out: string; err: string }>((resolve) => {
    const bin = installScript(path.join(base, 'office'));
    execFile(path.join(bin, 'os-secret'), args, { cwd, env: { PATH: process.env.PATH, OPEN_SPACE_SECRETS: url } }, (error, out, err) => resolve({ code: error ? Number(error.code) : 0, out, err }));
  });

  before(async () => {
    server = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(chunk);
      const action = req.url?.split('/').pop() ?? '';
      const reply = await answerSecrets({ sessionId: 's', action, form: new URLSearchParams(Buffer.concat(chunks).toString()) }, deps(store, [base], { GEMINI_KEY: 'gm-secret-value' }));
      res.writeHead(reply.status).end(reply.text);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/secrets/s/key`;
  });
  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('asks, lists, and writes a key into a .env file of the folder it runs in', async () => {
    const asked = await run(['ask', 'GEMINI_KEY', '--why', 'the Gemini API']);
    assert.equal(asked.code, 0, asked.err);
    assert.match(asked.out, /Ready: GEMINI_KEY/);
    assert.equal((await run(['list'])).out.trim(), 'GEMINI_KEY');
    mkdirSync(path.join(base, 'web'), { recursive: true });
    const written = await run(['env', 'GEMINI_KEY', '--as', 'GEMINI_API_KEY'], path.join(base, 'web'));
    assert.equal(written.code, 0, written.err);
    assert.equal(readFileSync(path.join(base, 'web', '.env'), 'utf8'), 'GEMINI_API_KEY=gm-secret-value\n');
  });

  it('runs a command with the key, its value masked in what it prints, and its exit code kept', async () => {
    const used = await run(['run', 'GEMINI_KEY', '--', 'sh', '-c', 'echo "key=$GEMINI_KEY"; exit 3']);
    assert.equal(used.code, 3);
    assert.equal(used.out.trim(), 'key=[secret]');
    const unknown = await run(['run', 'NOPE', '--', 'true']);
    assert.equal(unknown.code, 1);
    assert.match(unknown.err, /No key named NOPE/);
  });

  it('fails outside Open Space and on a refused request', async () => {
    const outside = await new Promise<number>((resolve) => execFile(path.join(base, 'office', 'bin', 'os-secret'), ['list'], { env: { PATH: process.env.PATH } }, (error) => resolve(error ? Number(error.code) : 0)));
    assert.equal(outside, 2);
    assert.equal((await run(['forget', 'MISSING'])).code, 1);
  });
});
