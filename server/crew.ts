// The user's crew: the people (a first name, a look, a birthday) the sessions are named after, plus the user's own
// avatar (`self`, made at the first start). Kept in OFFICE_DIR/crew.json; a session named like a crew member wears that
// member's look in the room. Empty on a new install.
import { readFile, rename, writeFile } from 'node:fs/promises';
import { parseBirthday } from '../shared/festivals.ts';
import { jobOf, parseJobs, type Job } from '../shared/jobs.ts';
import { parseLook, type Look } from '../shared/look.ts';
import type { CrewMember } from '../shared/protocol.ts';
import { st } from './i18n/index.ts';
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
        const jobs = parseJobs(entry.jobs);
        return name ? [{ name, look: parseLook(entry.look), ...(entry.self === true ? { self: true } : {}), ...(birthday ? { birthday } : {}), ...(jobs.length ? { jobs } : {}) }] : [];
      });
    } catch { this.members = []; }
  }

  /** The user's own first name, or null before the first start. */
  get selfName(): string | null { return this.members.find((member) => member.self)?.name ?? null; }

  /**
   * The user's own avatar, made at the first start: replaces the one there was, if any. A first name already in the crew
   * (one imported before the first start) is that member becoming the user: it keeps its birthday unless one is given.
   */
  async setSelf(name: string, look: Look, birthday?: string) {
    const clean = name.trim().slice(0, MAX_NAME);
    if (!clean) throw new Error(st.crew.giveYourName);
    const adopted = this.members.find((member) => member.name === clean && !member.self);
    const kept = birthday ?? adopted?.birthday;
    this.members = [{ name: clean, look, self: true, ...(kept ? { birthday: kept } : {}) }, ...this.members.filter((member) => !member.self && member !== adopted)];
    await this.store();
  }

  /** Someone of the crew becomes the user, with their look; the user until now stays in the crew as anyone else. */
  async becomeSelf(name: string) {
    const member = this.members.find((candidate) => candidate.name === name);
    if (!member) throw new Error(st.crew.notInCrew(name));
    if (member.self) return;
    const { jobs: _jobs, ...chosen } = member;
    this.members = [{ ...chosen, self: true }, ...this.members.filter((candidate) => candidate !== member).map(({ self: _self, ...other }) => other)];
    await this.store();
  }

  list(): CrewMember[] { return this.members.map((member) => ({ ...member })); }

  /** Adds a member, or updates the one called `previousName` (the user's own avatar can be renamed, not removed). */
  async save(previousName: string | null, name: string, look: Look, birthday?: string, jobs: readonly Job[] = []) {
    const clean = name.trim().slice(0, MAX_NAME);
    if (!clean) throw new Error(st.crew.giveName);
    const existing = previousName === null ? -1 : this.members.findIndex((member) => member.name === previousName);
    if (this.members.some((member, index) => member.name === clean && index !== existing)) throw new Error(st.crew.alreadyInCrew(clean));
    const optional = { ...(birthday ? { birthday } : {}), ...(jobs.length ? { jobs: [...jobs] } : {}) };
    if (existing === -1) this.members.push({ name: clean, look, ...optional });
    else {
      const { birthday: _birthday, jobs: _jobs, ...kept } = this.members[existing];
      this.members[existing] = { ...kept, name: clean, look, ...optional };
    }
    await this.store();
  }

  async remove(name: string) {
    const member = this.members.find((candidate) => candidate.name === name);
    if (!member) return;
    if (member.self) throw new Error(st.crew.selfNotRemovable);
    this.members = this.members.filter((candidate) => candidate !== member);
    await this.store();
  }

  /**
   * Someone of the crew without a session (the user excluded), for a session started without a name: among those whose
   * job fits the first message when there are some (see jobOf), else among all of them, drawn at random so it is not
   * always the same ones first. Undefined when the whole crew is taken.
   */
  freeNameFor(text: string, taken: ReadonlySet<string>, random: () => number = Math.random): string | undefined {
    const free = this.members.filter((member) => !member.self && !taken.has(member.name));
    const job = jobOf(text);
    const fitting = job ? free.filter((member) => member.jobs?.includes(job)) : [];
    const pool = fitting.length ? fitting : free;
    return pool.length ? pool[Math.floor(random() * pool.length)].name : undefined;
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
