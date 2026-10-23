import { Select } from './Select.tsx';
// To try the room's festivals and hours without waiting for them, from the settings. Nothing is kept: a reload goes back
// to the real day and time.
import { FESTIVALS, festivalDay, type Festival } from '../../shared/festivals.ts';
import { t } from '../i18n/index.ts';
import { useSessions } from '../state/sessions.ts';
import { RefreshIcon } from './Icons.tsx';

const hourLabel = (hour: number) => t.common.preview.hourLabel(Math.floor(hour), String(Math.round((hour % 1) * 60)).padStart(2, '0'));
const nowHour = () => { const now = new Date(); return now.getHours() + now.getMinutes() / 60; };

/** A festival instead of today's, or none. */
export function PreviewFestival({ labelledBy }: { labelledBy: string }) {
  const preview = useSessions((s) => s.preview);
  const setPreview = useSessions((s) => s.setPreview);
  const crew = useSessions((s) => s.crew);
  const today = festivalDay(new Date(), crew).festival;
  const words = t.common.preview;

  const value = preview.festival === undefined ? 'today' : preview.festival ?? 'none';
  const choose = (next: string) => {
    const { festival: _old, ...rest } = preview;
    setPreview(next === 'today' ? rest : { ...rest, festival: next === 'none' ? null : next as Festival });
  };
  return (
    <Select aria-labelledby={labelledBy} value={value} onChange={(e) => choose(e.target.value)}>
      <option value="today">{words.today(today ? t.room.festivals[today] : words.todayNone)}</option>
      <option value="none">{words.none}</option>
      {FESTIVALS.map((festival) => <option key={festival} value={festival}>{t.room.festivals[festival]}</option>)}
    </Select>
  );
}

/** An hour instead of now, and the way back to now once moved. */
export function PreviewHour({ labelledBy }: { labelledBy: string }) {
  const preview = useSessions((s) => s.preview);
  const setPreview = useSessions((s) => s.setPreview);
  const words = t.common.preview;
  const hour = preview.hour ?? nowHour();
  const { hour: _old, ...rest } = preview;
  return (
    <span className="cp-preview-hour">
      <output>{preview.hour === undefined ? words.now(hourLabel(hour)) : hourLabel(hour)}</output>
      <input type="range" aria-labelledby={labelledBy} min={0} max={23.75} step={0.25} value={hour} onChange={(e) => setPreview({ ...preview, hour: Number(e.target.value) })} />
      <button type="button" className="cp-icon-button" aria-label={words.reset} title={words.reset} disabled={preview.hour === undefined} onClick={() => setPreview(rest)}>
        <RefreshIcon />
      </button>
    </span>
  );
}
