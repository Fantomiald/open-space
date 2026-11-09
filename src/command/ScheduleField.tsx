// A trigger's schedule, for those who do not write cron: a frequency from the list (every 1, 3 or 6 hours, every day,
// some days), the time and the days it needs, or a cron of one's own.
import { useState } from 'react';
import { t } from '../i18n/index.ts';
import { cronOf, scheduleOf, type Schedule } from '../state/triggers.ts';

const FREQUENCIES = ['hours1', 'hours3', 'hours6', 'daily', 'days', 'custom'] as const;
type Frequency = (typeof FREQUENCIES)[number];
/** The days as the week is shown, Monday first: cron's numbers (0 Sunday). */
const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;
const WEEKDAYS = [1, 2, 3, 4, 5];

const frequencyOf = (schedule: Schedule): Frequency =>
  schedule.kind === 'hours' ? `hours${schedule.every}` : schedule.kind === 'days' ? (schedule.days.length === 7 ? 'daily' : 'days') : 'custom';

const pad = (value: number) => String(value).padStart(2, '0');

export function ScheduleField({ cron, onCron }: { cron: string; onCron: (cron: string) => void }) {
  const words = t.automata.triggers.fields;
  const schedule = scheduleOf(cron);
  // kept once picked, even when what is typed reads like one of the list
  const [custom, setCustom] = useState(schedule.kind === 'custom');
  const frequency = custom ? 'custom' : frequencyOf(schedule);
  const at = schedule.kind === 'days' ? { hour: schedule.hour, minute: schedule.minute } : { hour: 8, minute: 0 };
  const days = schedule.kind === 'days' ? schedule.days : WEEKDAYS;

  const pick = (next: Frequency) => {
    setCustom(next === 'custom');
    if (next === 'custom') return;
    if (next.startsWith('hours')) onCron(cronOf({ kind: 'hours', every: Number(next.slice(5)) as 1 | 3 | 6, minute: 0 }));
    else onCron(cronOf({ kind: 'days', days: next === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : days.length === 7 ? WEEKDAYS : days, ...at }));
  };
  const setTime = (value: string) => {
    const [hour, minute] = value.split(':').map(Number);
    if (Number.isInteger(hour) && Number.isInteger(minute)) onCron(cronOf({ kind: 'days', days, hour, minute }));
  };
  // never no day at all: the last one stays
  const toggleDay = (day: number) => {
    const next = days.includes(day) ? days.filter((each) => each !== day) : [...days, day];
    if (next.length) onCron(cronOf({ kind: 'days', days: next, ...at }));
  };

  return (
    <div className="cp-trigger__schedule">
      <div className="cp-trigger__schedule-line">
        <select value={frequency} aria-label={words.frequency} onChange={(e) => pick(e.target.value as Frequency)}>
          {FREQUENCIES.map((each) => <option key={each} value={each}>{words.frequencies[each]}</option>)}
        </select>
        {(frequency === 'daily' || frequency === 'days') && (
          <input type="time" value={`${pad(at.hour)}:${pad(at.minute)}`} aria-label={words.at} onChange={(e) => setTime(e.target.value)} />
        )}
      </div>
      {frequency === 'days' && (
        <div className="cp-trigger__presets" role="group" aria-label={words.days}>
          {WEEK.map((day) => (
            <button key={day} type="button" className="cp-button" data-size="small" aria-pressed={days.includes(day)} onClick={() => toggleDay(day)}>{words.dayNames[day]}</button>
          ))}
        </div>
      )}
      {frequency === 'custom' && <input className="cp-trigger__cron" value={cron} spellCheck={false} aria-label={words.customCron} placeholder="0 8 * * 1-5" onChange={(e) => onCron(e.target.value)} />}
    </div>
  );
}
