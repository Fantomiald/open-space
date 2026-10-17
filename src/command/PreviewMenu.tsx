import { useCallback, useRef, useState } from 'react';
import { FESTIVALS, festivalDay, type Festival } from '../../shared/festivals.ts';
import { t } from '../i18n/index.ts';
import { useSessions } from '../state/sessions.ts';
import { CalendarIcon } from './Icons.tsx';
import { useDismiss } from './useDismiss.ts';

const hourLabel = (hour: number) => t.common.preview.hourLabel(Math.floor(hour), String(Math.round((hour % 1) * 60)).padStart(2, '0'));
const nowHour = () => { const now = new Date(); return now.getHours() + now.getMinutes() / 60; };

/**
 * To try the room's festivals and hours without waiting for them: a festival instead of today's (or none), an hour
 * instead of now. Nothing is kept: a reload goes back to the real day and time.
 */
export function PreviewMenu() {
  const preview = useSessions((s) => s.preview);
  const setPreview = useSessions((s) => s.setPreview);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const crew = useSessions((s) => s.crew);
  const today = festivalDay(new Date(), crew).festival;
  const active = preview.festival !== undefined || preview.hour !== undefined;

  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, box, close);

  const festivalValue = preview.festival === undefined ? 'today' : preview.festival ?? 'none';
  const chooseFestival = (value: string) => {
    const { festival: _old, ...rest } = preview;
    setPreview(value === 'today' ? rest : { ...rest, festival: value === 'none' ? null : value as Festival });
  };
  const hour = preview.hour ?? nowHour();
  const words = t.common.preview;

  return (
    <div className="cp-preview" ref={box}>
      <button
        type="button" className="cp-icon-button" aria-expanded={open} aria-controls="preview-menu" data-active={active}
        aria-label={words.open} title={words.open} onClick={() => setOpen(!open)}
      >
        <CalendarIcon />
      </button>
      {open && (
        <div className="cp-preview__panel" id="preview-menu" role="group" aria-label={words.panel}>
          <label className="cp-preview__field">
            <span>{words.festival}</span>
            <select value={festivalValue} onChange={(e) => chooseFestival(e.target.value)}>
              <option value="today">{words.today(today ? t.room.festivals[today] : words.todayNone)}</option>
              <option value="none">{words.none}</option>
              {FESTIVALS.map((festival) => <option key={festival} value={festival}>{t.room.festivals[festival]}</option>)}
            </select>
          </label>
          <label className="cp-preview__field">
            <span>{words.hour} <output>{preview.hour === undefined ? words.now(hourLabel(hour)) : hourLabel(hour)}</output></span>
            <input type="range" min={0} max={23.75} step={0.25} value={hour} onChange={(e) => setPreview({ ...preview, hour: Number(e.target.value) })} />
          </label>
          <button type="button" className="cp-button" disabled={!active} onClick={() => setPreview({})}>{words.reset}</button>
        </div>
      )}
    </div>
  );
}
