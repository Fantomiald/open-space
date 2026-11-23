// The tags of conversations whose session left Open Space: kept under the conversation's id, so that "Reprendre" can
// find a conversation by its tags (a ticket key put only there) and the session gets them back when it is resumed.
import { readFile, rename, writeFile } from 'node:fs/promises';
import { asJson, isJson } from './json.ts';
import { storedTags } from '../shared/tags.ts';

export class ConversationTags {
  private tags = new Map<string, string[]>();
  private file: string;

  constructor(file: string) {
    this.file = file;
  }

  async load() {
    try {
      const raw: unknown = JSON.parse(await readFile(this.file, 'utf8'));
      if (!isJson(raw)) return;
      for (const [id, entry] of Object.entries(asJson(raw.conversations))) {
        const tags = storedTags(asJson(entry));
        if (tags.length) this.tags.set(id, tags);
      }
    } catch { /* none yet */ }
  }

  get(id: string): string[] | undefined { return this.tags.get(id); }

  /** All of them, for a search: a copy that does not change after. */
  all(): ReadonlyMap<string, readonly string[]> { return new Map(this.tags); }

  /** Keeps `tags` for the conversation, or forgets its tags when there are none. */
  async set(id: string, tags: readonly string[]) {
    if (tags.length) this.tags.set(id, [...tags]);
    else if (!this.tags.delete(id)) return;
    const temporary = `${this.file}.${process.pid}.tmp`;
    const conversations = Object.fromEntries([...this.tags].map(([key, kept]) => [key, { tags: kept }]));
    await writeFile(temporary, JSON.stringify({ conversations }, null, 2), { mode: 0o600 });
    await rename(temporary, this.file);
  }
}
