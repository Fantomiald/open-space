// The user's crew: the people (a first name, a look, a birthday) the sessions are named after, plus the user's own
// avatar (`self`, made at the first start). Kept in OFFICE_DIR/crew.json; a session named like a crew member wears that
// member's look in the room. Empty on a new install.
import { readFile, rename, writeFile } from 'node:fs/promises';
import { parseBirthday } from '../shared/festivals.ts';
import { parseLook, type Look } from '../shared/look.ts';
import type { CrewMember } from '../shared/protocol.ts';
import { asArray, asString, isJson } from './json.ts';
import { MAX_NAME } from './messages.ts';


export class Crew {
  private members: CrewMember[] = [];
  private file: string;

  constructor(file: string) {
    this.file = file;
  }

  async load() {
    try {
      const raw: unknown = JSON.parse(await readFile(this.file, 'utf8'));
      this.members = asArray(isJson(raw) ? raw.members : null).flatMap((entry) => {
        if (!isJson(entry)) return [];
        const name = asString(entry.name).trim().slice(0, MAX_NAME);
        // members saved before looks existed keep their name and get the default look
        const birthday = parseBirthday(entry.birthday);
        return name ? [{ name, look: parseLook(entry.look), ...(entry.self === true ? { self: true } : {}), ...(birthday ? { birthday } : {}) }] : [];
      });
    } catch { this.members = []; }
  }

  /** The user's own first name, or null before the first start. */
  get selfName(): string | null { return this.members.find((member) => member.self)?.name ?? null; }

  /** The user's own avatar, made at the first start: replaces the one there was, if any. */
  async setSelf(name: string, look: Look, birthday?: string) {
    const clean = name.trim().slice(0, MAX_NAME);
    if (!clean) throw new Error('Donne ton prénom.');
    if (this.members.some((member) => member.name === clean && !member.self)) throw new Error(`${clean} existe déjà dans l’équipe : choisis un autre prénom.`);
    this.members = [{ name: clean, look, self: true, ...(birthday ? { birthday } : {}) }, ...this.members.filter((member) => !member.self)];
    await this.store();
  }

  list(): CrewMember[] { return this.members.map((member) => ({ ...member })); }

  /** Adds a member, or updates the one called `previousName` (the user's own avatar can be renamed, not removed). */
  async save(previousName: string | null, name: string, look: Look, birthday?: string) {
    const clean = name.trim().slice(0, MAX_NAME);
    if (!clean) throw new Error('Donne un prénom.');
    const existing = previousName === null ? -1 : this.members.findIndex((member) => member.name === previousName);
    if (this.members.some((member, index) => member.name === clean && index !== existing)) throw new Error(`${clean} existe déjà dans l’équipe.`);
    const born = birthday ? { birthday } : {};
    if (existing === -1) this.members.push({ name: clean, look, ...born });
    else {
      const { birthday: _old, ...kept } = this.members[existing];
      this.members[existing] = { ...kept, name: clean, look, ...born };
    }
    await this.store();
  }

  async remove(name: string) {
    const member = this.members.find((candidate) => candidate.name === name);
    if (!member) return;
    if (member.self) throw new Error('Ton propre avatar ne se supprime pas, change plutôt son look.');
    this.members = this.members.filter((candidate) => candidate !== member);
    await this.store();
  }

  /** The crew's first names that no session uses yet, in the crew's order (the user's own name excluded). */
  private freeNames(taken: ReadonlySet<string>): string[] {
    return this.members.filter((member) => !member.self && !taken.has(member.name)).map((member) => member.name);
  }

  /** Someone of the crew without a session, drawn at random (not always the same ones first), or undefined when all are taken. */
  randomFreeName(taken: ReadonlySet<string>, random: () => number = Math.random): string | undefined {
    const free = this.freeNames(taken);
    return free.length ? free[Math.floor(random() * free.length)] : undefined;
  }

  private async store() {
    const temporary = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, JSON.stringify({ members: this.members }, null, 2), { mode: 0o600 });
    await rename(temporary, this.file);
  }
}

/** Keeps the user's bust (the macOS app's icon, see scripts/macos-app.py), unless it is the same as the one kept. */
export async function saveAvatar(file: string, png: Buffer) {
  const kept = await readFile(file).catch(() => null);
  if (kept?.equals(png)) return;
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, png, { mode: 0o600 });
  await rename(temporary, file);
}
