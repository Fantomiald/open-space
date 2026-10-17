import { useCallback, useRef, useState } from 'react';
import { DEFAULT_LOOK } from '../design/people-palette.ts';
import { JOB_LABELS } from '../../shared/jobs.ts';
import { chibiHead } from '../room/chibi.ts';
import type { Availability } from '../state/availability.ts';
import { ChevronsUpDownIcon, ShuffleIcon } from './Icons.tsx';
import { useDismiss } from './useDismiss.ts';

const PLACE = { desk: 'au bureau', rest: 'au repos' } as const;

/**
 * Who takes the new session: someone of the crew who is free, or "Auto" (null), the server's choice by the request's
 * job. Closed, it shows only the face; open, everyone with their job, those with a session already greyed out.
 */
export function PersonPicker({ people, chosen, onChoose }: { people: readonly Availability[]; chosen: string | null; onChoose: (name: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, box, close);
  const current = people.find((person) => person.member.name === chosen)?.member;
  const pick = (name: string | null) => { onChoose(name); setOpen(false); };

  return (
    <div className="cp-person" ref={box}>
      <button
        type="button" className="cp-person__trigger" aria-expanded={open} aria-controls="person-picker"
        aria-label={`Qui s’en occupe : ${current ? current.name : 'auto'}`} title={current ? current.name : 'Auto : selon la demande'} onClick={() => setOpen(!open)}
      >
        {current ? <img src={chibiHead(current.look ?? DEFAULT_LOOK)} alt="" /> : <ShuffleIcon />}
        <ChevronsUpDownIcon />
      </button>
      {open && (
        <div className="cp-person__panel" id="person-picker" role="radiogroup" aria-label="Qui s’en occupe">
          {people.map(({ member, place }) => (
            <button
              key={member.name} type="button" role="radio" aria-checked={chosen === member.name} disabled={place !== 'free'}
              className="cp-person__option" onClick={() => pick(member.name)}
            >
              <img src={chibiHead(member.look ?? DEFAULT_LOOK)} alt="" />
              <span className="cp-person__name">{member.name}{place !== 'free' && <small> ({PLACE[place]})</small>}</span>
              {member.jobs?.length ? <span className="cp-person__jobs">{member.jobs.map((job) => JOB_LABELS[job]).join(', ')}</span> : null}
            </button>
          ))}
          <button type="button" role="radio" aria-checked={chosen === null} className="cp-person__option" onClick={() => pick(null)}>
            <ShuffleIcon />
            <span className="cp-person__name">Auto</span>
            <span className="cp-person__jobs">selon la demande, sinon au hasard</span>
          </button>
        </div>
      )}
    </div>
  );
}
