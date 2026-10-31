// What Open Space's own slash commands do (the list and how they are typed: state/commands.ts).
import type { SessionInfo } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import type { OwnName } from '../state/commands.ts';
import { answerFromEnd, buildFeed, conversationMarkdown } from '../state/feed.ts';
import { formatClock, homeRelative } from '../lib/format.ts';
import { useSessions } from '../state/sessions.ts';

const CLAUDE_CODE_CHANGELOG = 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md';

/**
 * Does `/name argument` for `session` (none: from the search palette without one, for the commands that need none).
 * `say` shows a word for a moment where the command was typed. False when the command stays typed (/rename alone).
 */
export function runOwnCommand(name: OwnName, argument: string, session: SessionInfo | undefined, say: (text: string) => void = () => {}): boolean {
  const s = useSessions.getState();
  const id = session?.id;
  const items = () => buildFeed((id && s.logs[id]) || []).items;
  switch (name) {
    case 'focus': s.setView(s.view === 'focus' ? 'salle' : 'focus'); return true;
    case 'stats': s.openSettings(true, 'usage', 'rewind'); return true;
    case 'status': s.openSettings(true, 'about'); return true;
    case 'theme': s.openSettings(true, 'office', 'theme'); return true;
    case 'help': s.openPalette(true, '/'); return true;
    case 'release-notes': window.open(CLAUDE_CODE_CHANGELOG, '_blank', 'noopener'); return true;
    // "/login" starts the login at once, "/logout" asks first: both on the account's row, where it shows how it goes
    case 'login': s.openSettings(true, 'about', 'account'); s.claudeLogin(); return true;
    case 'logout': s.openSettings(true, 'about', 'account'); return true;
    case 'resume': s.openNewSession({ resumeIn: session?.cwd ?? '' }); return true;
  }
  if (!session || !id) return false;
  switch (name) {
    case 'btw': return false;
    case 'tag': return s.send({ t: 'tag', sessionId: id, tag: argument.slice(0, 24) });
    case 'rename': return !!argument && s.send({ t: 'rename', sessionId: id, name: argument.slice(0, 40) });
    case 'plan': {
      const sent = s.send({ t: 'tune', sessionId: id, permissionMode: 'plan' });
      return sent && (!argument || s.sendText(id, argument));
    }
    case 'review': return s.sendText(id, argument ? `/code-review ${argument}` : '/code-review');
    case 'diff': s.showPanel('changes'); return true;
    case 'cost': s.showPanel('usage'); return true;
    case 'fork': s.duplicateSession(id); return true;
    case 'remote-control': return s.send({ t: 'remoteControl', sessionId: id, enabled: !session.remote });
    case 'stop': return s.send({ t: 'interrupt', sessionId: id });
    case 'secret': s.openSecrets(id, /^[A-Za-z_]\w*$/.test(argument) ? argument : ''); return true;
    case 'copy': {
      const answer = answerFromEnd(items(), Number.parseInt(argument, 10) || 1);
      if (answer === null) { say(t.composer.composer.nothingToCopy); return true; }
      void navigator.clipboard.writeText(answer).then(() => say(t.composer.composer.copied), () => {});
      return true;
    }
    case 'export': {
      const markdown = conversationMarkdown(items(), { name: session.name, folder: homeRelative(session.cwd), you: t.composer.composer.you, clock: formatClock });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
      link.download = `${session.name}.md`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      return true;
    }
  }
}
