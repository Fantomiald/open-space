// Who of the crew can take a new session: someone with a session already is not free, at their desk or resting.
import type { CrewMember, SessionInfo } from '../../shared/protocol.ts';

export type Place = 'free' | 'desk' | 'rest';

export interface Availability { member: CrewMember; place: Place }

/** The crew without the user, in its order, each with where they are; the server takes the same names as taken. */
export function availability(crew: readonly CrewMember[], sessions: readonly SessionInfo[]): Availability[] {
  const byName = new Map(sessions.map((session) => [session.name, session]));
  return crew.filter((member) => !member.self).map((member) => {
    const session = byName.get(member.name);
    return { member, place: !session ? 'free' : session.resting ? 'rest' : 'desk' };
  });
}

/** The person asked for, while still free; otherwise nobody (whoever fits, chosen by the server). */
export function stillFree(chosen: string | null, people: readonly Availability[]): string | null {
  return chosen !== null && people.some((person) => person.member.name === chosen && person.place === 'free') ? chosen : null;
}
