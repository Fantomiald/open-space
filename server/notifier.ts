// macOS notifications when a session needs the user and no tab of Open Space is in front: shown by the macOS
// app (scripts/macos-app.py) when it runs, so they carry its name and icon and a click opens that session; otherwise
// by osascript itself. Nothing elsewhere than macOS.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AttentionKind, SessionInfo } from '../shared/protocol.ts';

const APP = path.join(os.homedir(), 'Applications', 'Open Space.app');
const APP_ID = 'local.open-space';

const TITLES: Record<AttentionKind, string> = {
  finished: 'a terminé', permission: 'demande une autorisation', question: 'te pose une question', error: 'a rencontré une erreur',
};

/** The words of a notification: who and what, then what they said or ask (shortened). */
export function notificationText(session: SessionInfo, kind: AttentionKind): { title: string; body: string } {
  const asked = session.permissions[0];
  const body = kind === 'error' ? session.error ?? ''
    : kind === 'finished' ? session.lastMessage
      : asked?.questions?.[0]?.question ?? asked?.detail ?? '';
  return { title: `${session.name} ${TITLES[kind]}`, body: body.replace(/\s+/g, ' ').trim().slice(0, 180) };
}

// the texts go as arguments, never inside the script, so nothing in them can be read as AppleScript; an app built
// before it could show notifications refuses showNotification, and osascript shows it instead
const VIA_APP = [
  'on run argv',
  '  try',
  `    if application id "${APP_ID}" is running then`,
  `      tell application id "${APP_ID}" to showNotification(item 1 of argv, item 2 of argv, item 3 of argv)`,
  '      return',
  '    end if',
  '  end try',
  '  display notification (item 2 of argv) with title (item 1 of argv)',
  'end run',
];
const PLAIN = ['on run argv', '  display notification (item 2 of argv) with title (item 1 of argv)', 'end run'];

export function notify(session: SessionInfo, kind: AttentionKind, log: (message: string, error?: unknown) => void) {
  if (process.platform !== 'darwin') return;
  const { title, body } = notificationText(session, kind);
  const script = existsSync(APP) ? VIA_APP : PLAIN;
  execFile('/usr/bin/osascript', [...script.flatMap((line) => ['-e', line]), title, body, session.id], { timeout: 10_000 }, (error) => {
    if (error) log('notification failed', error);
  });
}
