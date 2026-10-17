// Who sits where. Seats are stable: someone already seated keeps their chair; newcomers take a free one.
export interface SeatRequest { id: string }

/**
 * Seats the first `seatCount` requests (the caller orders them by priority); the others get no seat. Free seats are
 * taken in the room's order, which spreads newcomers over it. `previous`: the seats people had before. `reserved`:
 * seats nobody gets (the one the user sits on).
 */
export function assignSeats(requests: readonly SeatRequest[], previous: ReadonlyMap<string, number>, seatCount: number, reserved: ReadonlySet<number> = new Set()): Map<string, number> {
  const admitted = requests.slice(0, seatCount - reserved.size);
  const seats = new Map<string, number>();
  const taken = new Set<number>(reserved);
  for (const { id } of admitted) {
    const seat = previous.get(id);
    if (seat === undefined || taken.has(seat)) continue;
    seats.set(id, seat);
    taken.add(seat);
  }
  let next = 0;
  for (const { id } of admitted) {
    if (seats.has(id)) continue;
    while (taken.has(next)) next++;
    seats.set(id, next);
    taken.add(next);
  }
  return seats;
}
