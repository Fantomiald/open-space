import { useEffect, useRef, useState } from 'react';
import { FESTIVALS, FESTIVAL_NAMES, festivalDay, type Festival } from '../../shared/festivals.ts';
import { useSessions } from '../state/sessions.ts';
import { CalendarIcon } from './Icons.tsx';

const hourLabel = (hour: number) => `${Math.floor(hour)} h ${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;
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

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey, true); };
  }, [open]);

  const festivalValue = preview.festival === undefined ? 'today' : preview.festival ?? 'none';
  const chooseFestival = (value: string) => {
    const { festival: _old, ...rest } = preview;
    setPreview(value === 'today' ? rest : { ...rest, festival: value === 'none' ? null : value as Festival });
  };
  const hour = preview.hour ?? nowHour();

  return (
    <div className="cp-preview" ref={box}>
      <button
        type="button" className="cp-icon-button" aria-expanded={open} aria-controls="preview-menu" data-active={active}
        aria-label="Essayer les fêtes et les heures de la salle" title="Essayer les fêtes et les heures de la salle" onClick={() => setOpen(!open)}
      >
        <CalendarIcon />
      </button>
      {open && (
        <div className="cp-preview__panel" id="preview-menu" role="group" aria-label="Aperçu de la salle">
          <label className="cp-preview__field">
            <span>Fête</span>
            <select value={festivalValue} onChange={(e) => chooseFestival(e.target.value)}>
              <option value="today">Aujourd’hui ({today ? FESTIVAL_NAMES[today] : 'aucune'})</option>
              <option value="none">Aucune</option>
              {FESTIVALS.map((festival) => <option key={festival} value={festival}>{FESTIVAL_NAMES[festival]}</option>)}
            </select>
          </label>
          <label className="cp-preview__field">
            <span>Heure <output>{preview.hour === undefined ? `maintenant (${hourLabel(hour)})` : hourLabel(hour)}</output></span>
            <input type="range" min={0} max={23.75} step={0.25} value={hour} onChange={(e) => setPreview({ ...preview, hour: Number(e.target.value) })} />
          </label>
          <button type="button" className="cp-button" disabled={!active} onClick={() => setPreview({})}>Revenir au vrai jour et à l’heure</button>
        </div>
      )}
    </div>
  );
}
