// The channel to the desktop app (desktop/main.ts) when the bridge runs inside it, as an Electron utility process:
// the app learns where to open the page, shows the notifications itself (its name, its icon, a click opens the
// session) and restarts on a new version when asked; it tells the bridge about that new version. It also seals and
// opens the values of the keys vault (server/vault.ts) with safeStorage, which only the app's main process has. Absent
// when the bridge runs on its own (npm start).
import type { AppUpdate } from '../shared/protocol.ts';
import type { KeysStorage } from '../shared/secrets.ts';
import type { Cipher } from './vault.ts';

/** From the bridge to the app. */
export type AppMessage =
  | { t: 'ready'; link: string }
  | { t: 'notify'; title: string; body: string; sessionId: string }
  | { t: 'restart' }
  | { t: 'check' }
  | { t: 'seal'; id: number; text: string }
  | { t: 'open'; id: number; sealed: string[] };

/** From the app to the bridge: `sealed` in base64, null when sealing failed; `texts` null where a value could not be opened. */
export type AppNews =
  | { t: 'update'; update: AppUpdate }
  | { t: 'shutdown' }
  | { t: 'sealed'; id: number; sealed: string | null }
  | { t: 'opened'; id: number; texts: (string | null)[] };

interface ParentPort {
  postMessage(message: AppMessage): void;
  on(event: 'message', listener: (event: { data: AppNews }) => void): void;
}

export const appPort: ParentPort | undefined = (process as { parentPort?: ParentPort }).parentPort;

/** Where the app keeps the vault and how it seals it (set at the bridge's start, see desktop/main.ts): none without the app or a real keyring. */
export function vaultPlace(env: NodeJS.ProcessEnv): { file: string; storage: Exclude<KeysStorage, 'memory'> } | null {
  const storage = env.OPEN_SPACE_VAULT_STORAGE;
  if (!appPort || !env.OPEN_SPACE_VAULT || (storage !== 'keychain' && storage !== 'windows' && storage !== 'linux')) return null;
  return { file: env.OPEN_SPACE_VAULT, storage };
}

/** Seals and opens values through the app (safeStorage in its main process). */
export function appCipher(port: ParentPort): Cipher {
  let next = 0;
  const waiting = new Map<number, (news: AppNews) => void>();
  port.on('message', ({ data }) => {
    if ((data.t === 'sealed' || data.t === 'opened') && waiting.has(data.id)) {
      waiting.get(data.id)?.(data);
      waiting.delete(data.id);
    }
  });
  const ask = (message: AppMessage & { id: number }) => new Promise<AppNews>((resolve) => { waiting.set(message.id, resolve); port.postMessage(message); });
  return {
    seal: async (text) => {
      const news = await ask({ t: 'seal', id: next++, text });
      if (news.t !== 'sealed' || news.sealed === null) throw new Error('the keychain did not seal the key');
      return news.sealed;
    },
    open: async (sealed) => {
      if (!sealed.length) return [];
      const news = await ask({ t: 'open', id: next++, sealed: [...sealed] });
      return news.t === 'opened' ? news.texts : sealed.map(() => null);
    },
  };
}
