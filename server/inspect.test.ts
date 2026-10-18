import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { asJson } from './json.ts';
import { parseContextUsage, parseMcpServers, parseUsageReport } from './inspect.ts';

const fixture = asJson(JSON.parse(readFileSync(new URL('./fixtures/inspect.json', import.meta.url), 'utf8')));

describe('inspect', () => {
  it('reads the MCP servers: state, where they are set up, transport, tools, error; a server without a name is left out', () => {
    const servers = parseMcpServers(asJson(fixture.mcp_status));
    assert.equal(servers.length, 7);
    assert.deepEqual(servers[0], { name: 'plugin:context7:context7', state: 'needs-auth', source: 'plugin', transport: 'http', tools: 0 });
    assert.deepEqual(servers[1], { name: 'billing', state: 'connected', source: 'user', transport: 'http', tools: 2 });
    assert.equal(servers[3].error, 'Server rejected the configured Authorization header (HTTP 401).');
    assert.deepEqual(servers.map((server) => server.state), ['needs-auth', 'connected', 'connected', 'failed', 'disabled', 'pending', 'needs-auth']);
    assert.equal(servers[6].source, 'claudeai');
  });

  it('reads the context window: what fills it, the memory files and when it is summarized', () => {
    const usage = parseContextUsage(asJson(fixture.get_context_usage));
    assert.equal(usage.used, 24373);
    assert.equal(usage.max, 1000000);
    assert.equal(usage.model, 'claude-haiku-5-5');
    assert.deepEqual(usage.categories.find((category) => category.name === 'MCP tools (deferred)'), { name: 'MCP tools (deferred)', tokens: 226071, kind: 'deferred' });
    assert.deepEqual(usage.memoryFiles[1], { path: '/Users/me/projects/app/CLAUDE.md', kind: 'Project', tokens: 964 });
    assert.equal(usage.autoCompactAt, 967000);
    assert.equal(parseContextUsage({ ...asJson(fixture.get_context_usage), isAutoCompactEnabled: false }).autoCompactAt, null);
  });

  it('reads the plan usage: its limits, this session, and what weighed on them this week', () => {
    const report = parseUsageReport(asJson(fixture.get_usage));
    assert.equal(report.plan, 'max');
    assert.deepEqual(report.limits.map(({ kind, model, percent }) => ({ kind, model, percent })), [
      { kind: 'session', model: undefined, percent: 33 }, { kind: 'weekly', model: undefined, percent: 48 }, { kind: 'weeklyModel', model: 'Fable', percent: 0 },
    ]);
    assert.equal(report.limits[0].resetsAt, Date.parse('2026-10-17T18:20:00.210222+00:00'));
    assert.deepEqual(report.session, { costUsd: 0.4213, durationMs: 9253000, apiMs: 61000, linesAdded: 120, linesRemoved: 31 });
    assert.deepEqual(report.week?.agents, [{ name: 'general-purpose', percent: 10 }], 'nothing at 0 %');
    assert.equal(parseUsageReport({}).week, null);
  });
});
