// What the session panel's own views show (/mcp, /context, /usage), from Claude Code's answers to the control requests
// mcp_status, get_context_usage and get_usage (shapes checked with 2.1.302, fixtures/inspect.json). Only what the page
// shows is kept, and anything unexpected is left out rather than trusted.
import type { ContextCategory, ContextUsage, McpServer, McpSource, McpState, UsageLimit, UsageReport, UsageShare } from '../shared/protocol.ts';
import { asArray, asJson, asNumber, asString, type Json } from './json.ts';

const MCP_STATES: ReadonlySet<string> = new Set(['connected', 'pending', 'failed', 'needs-auth', 'disabled']);
const MCP_SOURCES: ReadonlySet<string> = new Set(['user', 'project', 'local', 'plugin', 'claudeai']);
const CONTEXT_KINDS: ReadonlySet<string> = new Set(['used', 'deferred', 'buffer', 'free']);

export function parseMcpServers(response: Json): McpServer[] {
  return asArray(response.mcpServers).map(asJson).filter((server) => asString(server.name)).map((server) => {
    const status = asString(server.status);
    // a plugin's server says so in its source, its scope is "dynamic"
    const source = asString(server.source) || asString(server.scope);
    const error = asString(server.error).slice(0, 500);
    return {
      name: asString(server.name),
      state: (MCP_STATES.has(status) ? status : 'failed') as McpState,
      source: (MCP_SOURCES.has(source) ? source : 'other') as McpSource,
      transport: asString(asJson(server.config).type),
      tools: asArray(server.tools).length,
      ...(error ? { error } : {}),
    };
  });
}

export function parseContextUsage(response: Json): ContextUsage {
  const categories: ContextCategory[] = asArray(response.categories).map(asJson).map((category) => ({
    name: asString(category.name),
    tokens: asNumber(category.tokens),
    kind: (CONTEXT_KINDS.has(asString(category.kind)) ? asString(category.kind) : 'used') as ContextCategory['kind'],
  })).filter((category) => category.name);
  return {
    model: asString(response.model),
    used: asNumber(response.totalTokens),
    max: asNumber(response.maxTokens),
    categories,
    memoryFiles: asArray(response.memoryFiles).map(asJson).map((file) => ({ path: asString(file.path), kind: asString(file.type), tokens: asNumber(file.tokens) })).filter((file) => file.path),
    autoCompactAt: response.isAutoCompactEnabled === false ? null : asNumber(response.autoCompactThreshold) || null,
  };
}

const share = (items: unknown): UsageShare[] => asArray(items).map(asJson).map((item) => ({ name: asString(item.name), percent: asNumber(item.pct) })).filter((item) => item.name && item.percent > 0);

const LIMIT_KINDS: Readonly<Record<string, UsageLimit['kind']>> = { session: 'session', weekly_all: 'weekly', weekly_scoped: 'weeklyModel' };

export function parseUsageReport(response: Json): UsageReport {
  // the limits as Claude Code's /usage lists them (rate_limits also holds each raw window, under internal names)
  const limits: UsageLimit[] = asArray(asJson(response.rate_limits).limits).map(asJson).map((limit) => {
    const resetsAt = Date.parse(asString(limit.resets_at));
    const model = asString(asJson(asJson(limit.scope).model).display_name);
    return {
      kind: LIMIT_KINDS[asString(limit.kind)] ?? 'other',
      ...(model ? { model } : {}),
      percent: Math.max(0, Math.min(100, asNumber(limit.percent))),
      resetsAt: Number.isFinite(resetsAt) ? resetsAt : null,
    };
  });
  const session = asJson(response.session);
  const week = asJson(asJson(response.behaviors).week);
  return {
    plan: asString(response.subscription_type),
    limits,
    session: {
      costUsd: asNumber(session.total_cost_usd), durationMs: asNumber(session.total_duration_ms), apiMs: asNumber(session.total_api_duration_ms),
      linesAdded: asNumber(session.total_lines_added), linesRemoved: asNumber(session.total_lines_removed),
    },
    week: Object.keys(week).length ? {
      requests: asNumber(week.request_count), sessions: asNumber(week.session_count),
      skills: share(week.skills), agents: share(week.agents), mcpServers: share(week.mcp_servers),
    } : null,
  };
}
