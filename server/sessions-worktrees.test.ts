// Sessions on a branch of their own: the whole path with a scripted Claude Code and real throwaway repositories.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import type { OfficeEvent, ServerMessage, SessionInfo } from '../shared/protocol.ts';
import type { LaunchOptions, ProcessFactory, ProcessHandle, ProcessHandlers } from './claude-process.ts';
import type { Config } from './config.ts';
import { projectFolder } from './conversations.ts';
import { asJson } from './json.ts';
import { SessionManager } from './sessions.ts';

const FIXTURE_ID = 'b40531d7-8ea6-4c7f-875e-058a07dcfee9';
const fixture = readFileSync(new URL('./fixtures/simple-turn.jsonl', import.meta.url), 'utf8').split('\n').filter(Boolean);

class FakeProcess implements ProcessHandle {
  alive = true;
  sent: string[] = [];
  launch: LaunchOptions;
  handlers: ProcessHandlers;
  constructor(launch: LaunchOptions, handlers: ProcessHandlers) { this.launch = launch; this.handlers = handlers; }
  send(text: string) { this.sent.push(text); return true; }
  answerPermission() {}
  refuseControl() {}
  interrupt() {}
  control() { return Promise.resolve({}); }
  stop() { this.exit(); return Promise.resolve(); }
  exit() { if (!this.alive) return; this.alive = false; this.handlers.onExit({ code: 0, signal: null, stderr: '' }); }
  /** One turn of Claude Code ("pong"), told as the conversation `id`; `failed`: ended by Claude Code on an error. */
  turn(id: string, failed = false) {
    for (const line of fixture) {
      const text = line.replaceAll(FIXTURE_ID, id);
      this.handlers.onMessage(asJson(JSON.parse(failed ? text.replace('"is_error":false', '"is_error":true').replace('"subtype":"success"', '"subtype":"error_during_execution"') : text)));
    }
  }
}

const scratch = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'office-isolated-')));
after(() => rmSync(scratch, { recursive: true, force: true }));
const root = path.join(scratch, 'root');
const home = path.join(scratch, 'home');
mkdirSync(root, { recursive: true });

const IDENTITY = ['-c', 'user.name=Test', '-c', 'user.email=test@example.com'];
const git = (cwd: string, ...args: string[]) => execFileSync('git', [...IDENTITY, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (file: string, text: string) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); };
const commit = (cwd: string, file: string, text: string) => { write(path.join(cwd, file), text); git(cwd, 'add', '.'); git(cwd, 'commit', '-q', '-m', `change ${file}`); };

let count = 0;
function repository(): string {
  const repo = path.join(root, `lilies-${++count}`);
  mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  write(path.join(repo, '.gitignore'), 'node_modules/\n');
  write(path.join(repo, 'app.ts'), 'export const a = 1;\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'init');
  return repo;
}

async function until(check: () => boolean, what: string) {
  for (let tries = 0; tries < 200; tries++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  assert.fail(`timed out waiting for ${what}`);
}

function setup(dataDir = path.join(scratch, `data-${++count}`)) {
  const processes: FakeProcess[] = [];
  const messages: ServerMessage[] = [];
  const spawnProcess: ProcessFactory = (launch, handlers) => { const fake = new FakeProcess(launch, handlers); processes.push(fake); return fake; };
  const config: Config = { port: 0, roots: [root], rootsLocked: false, dataDir, maxLive: 8, idleMs: 60_000, passthrough: [] };
  const manager = new SessionManager({ config, spawnProcess, broadcast: (message) => messages.push(message), log: () => {}, home, graceMs: 20 });
  const find = (id: string): SessionInfo => { const found = manager.list().find((session) => session.id === id); assert.ok(found); return found; };
  const events = (id: string): OfficeEvent[] => messages.flatMap((message) => (message.t === 'ev' && message.sessionId === id ? [message.ev] : []));
  return { manager, processes, find, events, dataDir };
}

/** A new isolated session in `repo` (or a folder of it), its worktree ready and its first message sent. */
async function isolated(text = 'Ajoute Apple Pay au checkout', repo = repository(), folder = repo) {
  const context = setup();
  await context.manager.init();
  const created = await context.manager.create({ cwd: folder, name: 'Lina', text, isolate: {} });
  await until(() => context.find(created.id).worktree?.status !== undefined && context.processes.length === 1, 'the worktree');
  return { ...context, repo, id: created.id, created };
}

describe('an isolated session', () => {
  it('waits as starting while its worktree is made, then works in it with its first message', async () => {
    const { manager, processes, find, events, repo, id, created } = await isolated();
    assert.equal(created.state, 'starting');
    assert.equal(created.queued?.length, 1);
    const session = find(id);
    const worktree = session.worktree!;
    assert.equal(worktree.branch, 'os/lina-apple-pay-checkout');
    assert.equal(worktree.base, 'main');
    assert.equal(worktree.home, repo);
    assert.equal(session.cwd, path.join(repo, '.claude/worktrees/os-lina-apple-pay-checkout'));
    assert.equal(processes[0].launch.cwd, session.cwd);
    assert.equal(processes[0].launch.worktree?.branch, 'os/lina-apple-pay-checkout');
    assert.deepEqual(processes[0].sent, ['Ajoute Apple Pay au checkout']);
    assert.ok(events(id).some((ev) => ev.k === 'note' && ev.text === 'Préparation de la branche…'));
    // the main checkout sees nothing of it
    assert.equal(git(repo, 'status', '--porcelain'), '');
    await manager.shutdown();
  });

  it('merges: the session is asked, then Open Space checks and fast-forwards the base and brings it home', async () => {
    const { manager, processes, find, events, repo, id } = await isolated();
    const worktree = find(id).worktree!;
    commit(worktree.root, 'pay.ts', 'pay\n');
    processes[0].turn(id);
    await until(() => find(id).worktree?.status?.ahead === 1, 'the branch status');
    await manager.mergeBranch(id);
    assert.match(processes[0].sent.at(-1)!, /git rebase main/);
    assert.ok(events(id).some((ev) => ev.k === 'start' && ev.text === 'Fusionne dans main'));
    assert.equal(find(id).worktree?.merge?.step, 'asked');
    processes[0].turn(id);
    await until(() => !find(id).worktree, 'the merge');
    assert.equal(git(repo, 'log', '-1', '--format=%s', 'main'), 'change pay.ts');
    assert.equal(readFileSync(path.join(repo, 'pay.ts'), 'utf8'), 'pay\n');
    assert.ok(!existsSync(worktree.root));
    assert.equal(git(repo, 'branch', '--list', 'os/*'), '');
    assert.equal(find(id).cwd, repo);
    assert.ok(events(id).some((ev) => ev.k === 'branch' && ev.what === 'merged'));
    // it goes on in the main checkout, and is told so
    manager.send(id, 'et maintenant ?');
    assert.equal(processes[1].launch.cwd, repo);
    assert.equal(processes[1].launch.worktree, undefined);
    assert.match(processes[1].sent[0], /dossier principal du projet[\s\S]*et maintenant \?$/);
    await manager.shutdown();
  });

  it('a base that moves on during the merge is caught up once, then the card says so', async () => {
    const { manager, processes, find, repo, id } = await isolated();
    commit(find(id).worktree!.root, 'pay.ts', 'pay\n');
    processes[0].turn(id);
    await until(() => find(id).worktree?.status?.ahead === 1, 'the branch status');
    await manager.mergeBranch(id);
    commit(repo, 'other.ts', 'other\n');
    processes[0].turn(id);
    const retried = () => { const merge = find(id).worktree?.merge; return merge?.step === 'asked' && merge.retried; };
    await until(retried, 'the catch up');
    assert.match(processes[0].sent.at(-1)!, /a encore bougé/);
    commit(repo, 'third.ts', 'third\n');
    processes[0].turn(id);
    await until(() => find(id).worktree?.merge?.step === 'failed', 'the failure');
    assert.deepEqual(find(id).worktree?.merge, { step: 'failed', problem: { kind: 'behind' } });
    await manager.shutdown();
  });

  it('refuses to merge over uncommitted changes of the main checkout in the same files', async () => {
    const { manager, processes, find, repo, id } = await isolated();
    commit(find(id).worktree!.root, 'app.ts', 'export const a = 2;\n');
    processes[0].turn(id);
    await until(() => find(id).worktree?.status?.ahead === 1, 'the branch status');
    write(path.join(repo, 'app.ts'), 'export const a = 3;\n');
    await manager.mergeBranch(id);
    processes[0].turn(id);
    await until(() => find(id).worktree?.merge?.step === 'failed', 'the failure');
    assert.deepEqual(find(id).worktree?.merge, { step: 'failed', problem: { kind: 'overlap', count: 1 } });
    // nothing moved, nothing lost
    assert.equal(readFileSync(path.join(repo, 'app.ts'), 'utf8'), 'export const a = 3;\n');
    assert.equal(git(repo, 'log', '-1', '--format=%s', 'main'), 'init');
    await manager.shutdown();
  });

  it('puts a failed merge aside when the user writes to the session again', async () => {
    const { manager, processes, find, repo, id } = await isolated();
    commit(find(id).worktree!.root, 'app.ts', 'export const a = 2;\n');
    processes[0].turn(id);
    await until(() => find(id).worktree?.status?.ahead === 1, 'the branch status');
    write(path.join(repo, 'app.ts'), 'export const a = 3;\n');
    await manager.mergeBranch(id);
    processes[0].turn(id);
    await until(() => find(id).worktree?.merge?.step === 'failed', 'the failure');
    manager.send(id, 'on continue autrement');
    assert.equal(find(id).worktree?.merge, undefined);
    await manager.shutdown();
  });

  it('thrown away from its card, it goes on in the main checkout', async () => {
    const { manager, processes, find, events, repo, id } = await isolated();
    const worktree = find(id).worktree!;
    write(path.join(worktree.root, 'draft.ts'), 'draft\n');
    await assert.rejects(manager.discardBranch(id), /attends la fin de son tour/);
    processes[0].turn(id);
    await manager.discardBranch(id);
    assert.ok(!existsSync(worktree.root));
    assert.equal(find(id).cwd, repo);
    assert.ok(events(id).some((ev) => ev.k === 'branch' && ev.what === 'discarded'));
    await manager.shutdown();
  });

  it('switched off with work, its branch is kept (wip) and comes back with its conversation', async () => {
    const { manager, find, repo, id } = await isolated();
    const worktree = find(id).worktree!;
    const transcript = path.join(projectFolder(find(id).cwd, home), `${id}.jsonl`);
    write(transcript, `${JSON.stringify({ type: 'user', message: { content: 'Ajoute Apple Pay au checkout' } })}\n`);
    write(path.join(worktree.root, 'pay.ts'), 'pay\n');
    await manager.forget(id);
    assert.ok(!existsSync(worktree.root));
    assert.equal(git(repo, 'log', '-1', '--format=%s', worktree.branch), 'wip: Lina');
    // its conversation is found from the main checkout
    assert.ok(existsSync(path.join(projectFolder(repo, home), `${id}.jsonl`)));
    const again = await manager.create({ cwd: repo, resumeId: id });
    await until(() => manager.list().find((session) => session.id === again.id)?.worktree !== undefined, 'the revived worktree');
    const revived = manager.list().find((session) => session.id === again.id)!;
    assert.equal(revived.worktree?.branch, worktree.branch);
    assert.equal(readFileSync(path.join(revived.cwd, 'pay.ts'), 'utf8'), 'pay\n');
    assert.ok(existsSync(path.join(projectFolder(revived.cwd, home), `${id}.jsonl`)));
    await manager.shutdown();
  });

  it('switched off with nothing on its branch, the branch and its folder go; thrown away, they go whatever they hold', async () => {
    const first = await isolated();
    const worktree = first.find(first.id).worktree!;
    await first.manager.forget(first.id);
    assert.ok(!existsSync(worktree.root));
    assert.equal(git(first.repo, 'branch', '--list', 'os/*'), '');
    await first.manager.shutdown();
    const second = await isolated();
    const other = second.find(second.id).worktree!;
    commit(other.root, 'pay.ts', 'pay\n');
    await second.manager.forget(second.id, 'discard');
    assert.ok(!existsSync(other.root));
    assert.equal(git(second.repo, 'branch', '--list', 'os/*'), '');
    await second.manager.shutdown();
  });

  it('its changes count from where the branch left its base, commits included', async () => {
    const { manager, find, id } = await isolated();
    commit(find(id).worktree!.root, 'pay.ts', 'pay\nmore\n');
    const changes = await manager.changes(id);
    assert.deepEqual(changes.files.map((file) => [path.basename(file.path), file.added]), [['pay.ts', 2]]);
    await manager.shutdown();
  });

  it('the cleaning panel brings a waiting session home; the launcher counts what is left to tidy', async () => {
    const { manager, processes, find, repo, id } = await isolated();
    git(repo, 'branch', 'os/old-merged');
    // made by Open Space, as its note says (an os/* branch without one is the user's own)
    git(repo, 'config', 'branch.os/old-merged.openspace-name', 'Hugo');
    const info = await manager.folderInfo(repo);
    assert.equal(info?.branch, 'main');
    assert.equal(info?.merged, 1);
    const { branches } = await manager.branches(repo);
    assert.deepEqual(branches.map((row) => row.branch).sort(), ['os/lina-apple-pay-checkout', 'os/old-merged']);
    const chosen = branches.map(({ branch, folder, head, dirty }) => ({ branch, folder, head, dirty }));
    // at work: left alone
    assert.deepEqual(await manager.cleanBranches(repo, chosen), ['os/lina-apple-pay-checkout']);
    assert.ok(find(id).worktree);
    processes[0].turn(id);
    const failed = await manager.cleanBranches(repo, chosen);
    assert.deepEqual(failed, []);
    assert.equal(find(id).worktree, undefined);
    assert.equal(find(id).cwd, repo);
    assert.equal(git(repo, 'branch', '--list', 'os/*'), '');
    await manager.shutdown();
  });

  it('in a folder outside git, it stays where it is, its message waiting above the field', async () => {
    const folder = path.join(root, `plain-${++count}`);
    mkdirSync(folder);
    const { manager, processes, find, events } = setup();
    await manager.init();
    const { id } = await manager.create({ cwd: folder, text: 'bonjour', isolate: {} });
    await until(() => find(id).state === 'wait', 'the failure');
    assert.equal(processes.length, 0);
    assert.equal(find(id).queued?.[0].text, 'bonjour');
    assert.ok(events(id).some((ev) => ev.k === 'note' && /pas dans un repo git/.test(ev.text)));
    await manager.shutdown();
  });
});

/** A turn ended, and the branch looked at again after it. */
async function turnDone(context: { processes: FakeProcess[]; find: (id: string) => SessionInfo }, id: string, index = context.processes.length - 1) {
  const before = context.find(id).turns;
  context.processes[index].turn(id);
  await until(() => context.find(id).turns > before && context.find(id).state === 'wait', 'the end of the turn');
  await new Promise((resolve) => setTimeout(resolve, 150));
}

describe('the cases asked for', () => {
  it('1. two sessions in one repository: the first one stays in the main folder, untouched', async () => {
    const repo = repository();
    const context = setup();
    await context.manager.init();
    const hugo = await context.manager.create({ cwd: repo, name: 'Hugo', text: 'bonjour' });
    await turnDone(context, hugo.id, 0);
    const lina = await context.manager.create({ cwd: repo, name: 'Lina', text: 'Ajoute Apple Pay', isolate: {} });
    await until(() => context.find(lina.id).worktree !== undefined && context.processes.length === 2, 'the worktree');
    assert.equal(context.find(hugo.id).cwd, repo);
    assert.equal(context.find(hugo.id).worktree, undefined);
    assert.equal(context.processes[0].launch.cwd, repo);
    context.manager.send(hugo.id, 'et toi ?');
    assert.equal(context.processes.length, 2, 'Hugo keeps his own process');
    assert.equal(context.processes[0].sent.at(-1), 'et toi ?');
    assert.notEqual(context.find(lina.id).cwd, repo);
    assert.equal(git(repo, 'status', '--porcelain'), '');
    await context.manager.shutdown();
  });

  it('2. a session started in a folder of the repository works in the same folder of its worktree, and comes back there', async () => {
    const repo = repository();
    write(path.join(repo, 'mobile', 'index.js'), 'export {};\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'mobile');
    const context = await isolated('Le bouton natif', repo, path.join(repo, 'mobile'));
    const worktree = context.find(context.id).worktree!;
    assert.equal(context.find(context.id).cwd, path.join(worktree.root, 'mobile'));
    assert.equal(context.processes[0].launch.cwd, path.join(worktree.root, 'mobile'));
    assert.equal(worktree.home, path.join(repo, 'mobile'));
    await turnDone(context, context.id);
    await context.manager.discardBranch(context.id);
    assert.equal(context.find(context.id).cwd, path.join(repo, 'mobile'));
    await context.manager.shutdown();
  });

  it('3. the .env files and node_modules are in the worktree, and the main folder does not see .claude/worktrees', async () => {
    const repo = repository();
    write(path.join(repo, '.gitignore'), 'node_modules/\n.env\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'ignore .env');
    write(path.join(repo, '.env'), 'KEY=1\n');
    write(path.join(repo, 'node_modules', 'pay', 'index.js'), 'export default 1;\n');
    const context = await isolated('pay', repo);
    const root = context.find(context.id).worktree!.root;
    if (process.platform === 'darwin') {
      assert.equal(readFileSync(path.join(root, '.env'), 'utf8'), 'KEY=1\n');
      assert.ok(existsSync(path.join(root, 'node_modules', 'pay', 'index.js')));
    }
    assert.equal(git(repo, 'status', '--porcelain'), '');
    assert.equal(git(root, 'status', '--porcelain'), '');
    await context.manager.shutdown();
  });

  it('4. once merged, its conversation moved with it and goes on from the main folder (same conversation)', async () => {
    const context = await isolated();
    const { manager, processes, find, repo, id } = context;
    const before = find(id).cwd;
    write(path.join(projectFolder(before, home), `${id}.jsonl`), '{"type":"user"}\n');
    write(path.join(projectFolder(before, home), id, 'subagents', 'agent-1.jsonl'), '{}\n');
    commit(find(id).worktree!.root, 'pay.ts', 'pay\n');
    await turnDone(context, id);
    await manager.mergeBranch(id);
    await turnDone(context, id);
    await until(() => !find(id).worktree, 'the merge');
    assert.ok(existsSync(path.join(projectFolder(repo, home), `${id}.jsonl`)));
    assert.ok(existsSync(path.join(projectFolder(repo, home), id, 'subagents', 'agent-1.jsonl')));
    assert.ok(!existsSync(path.join(projectFolder(before, home), `${id}.jsonl`)));
    manager.send(id, 'tu te souviens ?');
    const next = processes.at(-1)!;
    assert.equal(next.launch.cwd, repo);
    assert.equal(next.launch.resume, true);
    assert.equal(next.launch.sessionId, id);
    await manager.shutdown();
  });

  it('6. uncommitted changes of the main folder in the same file: a clear failure, nothing lost, Try again works once committed', async () => {
    const repo = repository();
    write(path.join(repo, 'menu.ts'), 'one\ntwo\nthree\nfour\nfive\nsix\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'menu');
    const context = await isolated('menu', repo);
    const { manager, find, id } = context;
    const root = find(id).worktree!.root;
    commit(root, 'menu.ts', 'ONE\ntwo\nthree\nfour\nfive\nsix\n');
    await turnDone(context, id);
    write(path.join(repo, 'menu.ts'), 'one\ntwo\nthree\nfour\nfive\nSIX\n');
    await manager.mergeBranch(id);
    await turnDone(context, id);
    await until(() => find(id).worktree?.merge?.step === 'failed', 'the failure');
    assert.deepEqual(find(id).worktree?.merge, { step: 'failed', problem: { kind: 'overlap', count: 1 } });
    assert.equal(readFileSync(path.join(repo, 'menu.ts'), 'utf8'), 'one\ntwo\nthree\nfour\nfive\nSIX\n');
    // the user commits their change, then Try again: the session catches up (no conflict here), Open Space merges
    git(repo, 'commit', '-q', '-am', 'six in capitals');
    await manager.mergeBranch(id);
    git(root, 'rebase', '-q', 'main');
    await turnDone(context, id);
    await until(() => !find(id).worktree, 'the merge');
    assert.equal(readFileSync(path.join(repo, 'menu.ts'), 'utf8'), 'ONE\ntwo\nthree\nfour\nfive\nSIX\n');
    await manager.shutdown();
  });

  it('8. resting then called back, it finds the same worktree and the same conversation', async () => {
    const context = await isolated();
    const { manager, processes, find, id } = context;
    await turnDone(context, id);
    const worktree = find(id).worktree!;
    await manager.rest(id);
    assert.equal(processes[0].alive, false);
    assert.ok(existsSync(worktree.root));
    manager.send(id, 'reviens');
    const next = processes.at(-1)!;
    assert.equal(next.launch.cwd, worktree.root);
    assert.equal(next.launch.resume, true);
    assert.equal(next.launch.sessionId, id);
    assert.equal(find(id).worktree?.branch, worktree.branch);
    await manager.shutdown();
  });

  it('9. after a restart of the server, the branch, its card and the merge are all there', async () => {
    const context = await isolated();
    const { find, id, repo, dataDir } = context;
    commit(find(id).worktree!.root, 'pay.ts', 'pay\n');
    await turnDone(context, id);
    const branch = find(id).worktree!.branch;
    await context.manager.shutdown();
    const again = setup(dataDir);
    await again.manager.init();
    assert.equal(again.find(id).worktree?.branch, branch);
    assert.equal(again.find(id).worktree?.status?.ahead, 1);
    await again.manager.refreshBranch(id);
    await again.manager.mergeBranch(id);
    assert.match(again.processes[0].sent[0], /git rebase main/);
    assert.equal(again.processes[0].launch.resume, true);
    await turnDone(again, id, 0);
    await until(() => !again.find(id).worktree, 'the merge');
    assert.equal(git(repo, 'log', '-1', '--format=%s', 'main'), 'change pay.ts');
    await again.manager.shutdown();
  });

  it('10. cleaning removes what was checked, and only that', async () => {
    const repo = repository();
    const context = setup();
    await context.manager.init();
    git(repo, 'branch', 'os/merged-one');
    git(repo, 'branch', 'os/ahead-one');
    git(repo, 'config', 'branch.os/merged-one.openspace-name', 'Hugo');
    git(repo, 'config', 'branch.os/ahead-one.openspace-name', 'Iris');
    commit(repo, 'later.ts', 'later\n');
    git(repo, 'checkout', '-q', 'os/ahead-one');
    commit(repo, 'mine.ts', 'mine\n');
    git(repo, 'checkout', '-q', 'main');
    git(repo, 'reset', '-q', '--hard', 'HEAD~1');
    const { branches } = await context.manager.branches(repo);
    assert.deepEqual(branches.map((row) => [row.branch, row.merged]).sort(), [['os/ahead-one', false], ['os/merged-one', true]]);
    const merged = branches.find((row) => row.branch === 'os/merged-one')!;
    assert.deepEqual(await context.manager.cleanBranches(repo, [{ branch: 'os/merged-one', folder: null, head: merged.head, dirty: 0 }]), []);
    assert.equal(git(repo, 'branch', '--list', 'os/*'), 'os/ahead-one');
    // a folder the panel did not list is never removed
    const outside = path.join(root, `elsewhere-${count}`);
    mkdirSync(outside);
    assert.deepEqual(await context.manager.cleanBranches(repo, [{ branch: '', folder: outside, head: merged.head, dirty: 0 }]), []);
    assert.ok(existsSync(outside));
    await context.manager.shutdown();
  });

  it('11. its terminal opens in its worktree', async () => {
    const { manager, find, id } = await isolated();
    assert.equal(manager.folderOf(id), find(id).cwd);
    assert.ok(manager.folderOf(id)?.includes('/.claude/worktrees/os-lina-'));
    await manager.shutdown();
  });

  it('12. a repository without commit, a branch name taken: no crash, a clear outcome', async () => {
    const empty = path.join(root, `empty-${++count}`);
    mkdirSync(empty);
    git(empty, 'init', '-q', '-b', 'main');
    const context = setup();
    await context.manager.init();
    assert.equal((await context.manager.folderInfo(empty))?.branch, '', 'nothing to start a branch from: not offered');
    const { id } = await context.manager.create({ cwd: empty, text: 'bonjour', isolate: {} });
    await until(() => context.find(id).state === 'wait', 'the failure');
    assert.ok(context.events(id).some((ev) => ev.k === 'note' && /aucun commit/.test(ev.text)));
    assert.equal(context.find(id).queued?.length, 1);
    await context.manager.shutdown();
    const repo = repository();
    git(repo, 'branch', 'os/lina-apple-pay-checkout');
    const taken = await isolated('Ajoute Apple Pay au checkout', repo);
    assert.equal(taken.find(taken.id).worktree?.branch, 'os/lina-apple-pay-checkout-2');
    await taken.manager.shutdown();
  });
});

describe('an isolated session never loses work, nor touches what it should not', () => {
  it('switched off while its folder is off the branch (a detached HEAD): nothing is removed, and it says why', async () => {
    const { manager, find, repo, id } = await isolated();
    const worktree = find(id).worktree!;
    commit(worktree.root, 'pay.ts', 'pay\n');
    git(worktree.root, 'checkout', '-q', '--detach');
    commit(worktree.root, 'more.ts', 'more\n');
    const detached = git(worktree.root, 'rev-parse', 'HEAD');
    await assert.rejects(manager.forget(id, 'keep'), /n’a pas pu être rangée/);
    // the session, its folder and the commit on the detached HEAD are all there
    assert.ok(find(id).worktree);
    assert.ok(existsSync(worktree.root));
    assert.equal(git(worktree.root, 'rev-parse', 'HEAD'), detached);
    assert.equal(git(repo, 'log', '-1', '--format=%s', worktree.branch), 'change pay.ts');
    // a message waits no more: the hold is let go
    manager.send(id, 'encore');
    await manager.shutdown();
  });

  it('two clicks on Merge: one instruction, and the base is moved at the end of its turn', async () => {
    const { manager, processes, find, repo, id } = await isolated();
    commit(find(id).worktree!.root, 'pay.ts', 'pay\n');
    processes[0].turn(id);
    await until(() => find(id).worktree?.status?.ahead === 1, 'the branch status');
    const outcomes = await Promise.allSettled([manager.mergeBranch(id), manager.mergeBranch(id)]);
    assert.deepEqual(outcomes.map((outcome) => outcome.status).sort(), ['fulfilled', 'rejected']);
    assert.equal(processes[0].sent.filter((text) => /git rebase main/.test(text)).length, 1);
    assert.equal(find(id).worktree?.merge?.step, 'asked');
    processes[0].turn(id);
    await until(() => !find(id).worktree, 'the merge');
    assert.equal(git(repo, 'log', '-1', '--format=%s', 'main'), 'change pay.ts');
    await manager.shutdown();
  });

  it('a merge turn that Claude Code ended on an error does not move the base', async () => {
    const { manager, processes, find, repo, id } = await isolated();
    commit(find(id).worktree!.root, 'pay.ts', 'pay\n');
    processes[0].turn(id);
    await until(() => find(id).worktree?.status?.ahead === 1, 'the branch status');
    await manager.mergeBranch(id);
    processes[0].turn(id, true);
    await until(() => find(id).worktree?.merge?.step === 'failed', 'the failure');
    assert.deepEqual(find(id).worktree?.merge, { step: 'failed', problem: { kind: 'stopped' } });
    assert.equal(git(repo, 'log', '-1', '--format=%s', 'main'), 'init');
    await manager.shutdown();
  });

  it('cleaning leaves a branch that got work since the panel showed it', async () => {
    const { manager, processes, find, repo, id } = await isolated();
    processes[0].turn(id);
    const { branches } = await manager.branches(repo);
    const seen = branches.find((row) => row.branch === find(id).worktree?.branch)!;
    assert.equal(seen.merged, true);
    commit(find(id).worktree!.root, 'pay.ts', 'pay\n');
    assert.deepEqual(await manager.cleanBranches(repo, [{ branch: seen.branch, folder: seen.folder, head: seen.head, dirty: seen.dirty }]), [seen.branch]);
    assert.ok(existsSync(seen.folder!));
    assert.equal(git(repo, 'log', '-1', '--format=%s', seen.branch), 'change pay.ts');
    await manager.shutdown();
  });

  it('a base branch with hooks or MCP servers the main folder lacks: the session works without the project settings', async () => {
    const repo = repository();
    git(repo, 'checkout', '-q', '-b', 'tools');
    write(path.join(repo, '.mcp.json'), JSON.stringify({ mcpServers: { spy: { command: 'node', args: ['spy.js'] } } }));
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'tools');
    git(repo, 'checkout', '-q', 'main');
    const context = setup();
    await context.manager.init();
    const { id } = await context.manager.create({ cwd: repo, name: 'Lina', text: 'salut', isolate: { base: 'tools' } });
    await until(() => context.processes.length === 1, 'the process');
    assert.equal(context.processes[0].launch.untrusted, true);
    assert.ok(context.events(id).some((ev) => ev.k === 'note' && /sans les réglages du projet/.test(ev.text)));
    // the same code as the main folder: nothing to ask
    const plain = await context.manager.create({ cwd: repo, name: 'Tom', text: 'salut', isolate: {} });
    await until(() => context.processes.length === 2, 'the second process');
    assert.equal(context.processes[1].launch.untrusted, undefined);
    assert.ok(context.find(plain.id).worktree);
    await context.manager.shutdown();
  });

  it('switched off while its folder is being made: no process starts, and no folder is left', async () => {
    const repo = repository();
    const context = setup();
    await context.manager.init();
    const { id } = await context.manager.create({ cwd: repo, name: 'Lina', text: 'Ajoute Apple Pay', isolate: {} });
    await context.manager.forget(id);
    await new Promise((resolve) => setTimeout(resolve, 600));
    assert.equal(context.processes.length, 0);
    assert.equal(git(repo, 'worktree', 'list', '--porcelain').split('\n').filter((line) => line.startsWith('worktree ')).length, 1);
    assert.equal(git(repo, 'branch', '--list', 'os/*'), '');
    await context.manager.shutdown();
  });

  it('its folder removed by hand while Open Space runs: it goes back to the main checkout when looked at', async () => {
    const { manager, processes, find, events, repo, id } = await isolated();
    processes[0].turn(id);
    await manager.rest(id);
    rmSync(find(id).worktree!.root, { recursive: true, force: true });
    await manager.refreshBranch(id);
    assert.equal(find(id).worktree, undefined);
    assert.equal(find(id).cwd, repo);
    assert.ok(events(id).some((ev) => ev.k === 'note' && /a disparu/.test(ev.text)));
    await manager.shutdown();
  });

  it('a repository that starts above the allowed folders: no branch is offered, and the session stays where it is', async () => {
    const outer = path.join(scratch, `outer-${++count}`);
    mkdirSync(path.join(outer, 'apps', 'web'), { recursive: true });
    git(outer, 'init', '-q', '-b', 'main');
    write(path.join(outer, 'apps', 'web', 'index.ts'), 'x\n');
    git(outer, 'add', '.');
    git(outer, 'commit', '-q', '-m', 'init');
    const processes: FakeProcess[] = [];
    const config: Config = { port: 0, roots: [path.join(outer, 'apps')], rootsLocked: false, dataDir: path.join(scratch, `data-${++count}`), maxLive: 8, idleMs: 60_000, passthrough: [] };
    const manager = new SessionManager({ config, spawnProcess: (launch, handlers) => { const fake = new FakeProcess(launch, handlers); processes.push(fake); return fake; }, broadcast: () => {}, log: () => {}, home, graceMs: 20 });
    await manager.init();
    const web = path.join(outer, 'apps', 'web');
    assert.equal(await manager.folderInfo(web), null);
    const { id } = await manager.create({ cwd: web, name: 'Lina', text: 'salut', isolate: {} });
    await until(() => manager.list().find((session) => session.id === id)?.state === 'wait', 'the failure');
    assert.equal(manager.list().find((session) => session.id === id)?.cwd, web);
    assert.ok(!existsSync(path.join(outer, '.claude')));
    await manager.shutdown();
  });
});
