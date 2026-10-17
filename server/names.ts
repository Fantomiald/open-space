// First names given to sessions: one per session, assigned at creation, stored with the session.
const SESSION_NAMES = [
  'Camille', 'Théo', 'Jade', 'Hugo', 'Léna', 'Nolan', 'Inès', 'Louis', 'Manon', 'Raphaël', 'Clara', 'Jules', 'Alice', 'Gabin', 'Zoé', 'Arthur',
  'Lina', 'Maël', 'Rose', 'Elliot', 'Anna', 'Sacha', 'Marius', 'Eva', 'Basile', 'Lola', 'Oscar', 'Mila', 'Victor', 'Iris', 'Paul', 'Léa',
  'Noé', 'Alma', 'Simon', 'Emma', 'Axel', 'Romane', 'Timéo', 'Salomé',
];

/** A name not used by another session. When the list is exhausted, numbers are appended ("Camille 2"). */
export function pickSessionName(taken: ReadonlySet<string>, random: () => number = Math.random): string {
  const free = SESSION_NAMES.filter((name) => !taken.has(name));
  if (free.length) return free[Math.floor(random() * free.length)];
  for (let round = 2; ; round++) {
    const numbered = SESSION_NAMES.filter((name) => !taken.has(`${name} ${round}`));
    if (numbered.length) return `${numbered[Math.floor(random() * numbered.length)]} ${round}`;
  }
}
