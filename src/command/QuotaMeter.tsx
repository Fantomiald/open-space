import type { Quota } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { quotaWindowName, resetLabel, usageLevel } from '../lib/format.ts';

const percent = (utilization: number) => Math.round(utilization * 100);

/**
 * The usage in the header, as two rings that fill up: the five hours, then the fullest longer window (the week); hovering
 * or focusing them shows every usage window and when each frees up.
 */
export function QuotaMeter({ quota }: { quota: Quota }) {
  const windows = quota.windows.length ? quota.windows : [{ name: 'five_hour', utilization: quota.fiveHour, resetsAt: quota.resetsAt }];
  const five = windows.find((window) => window.name === 'five_hour') ?? { name: 'five_hour', utilization: quota.fiveHour, resetsAt: quota.resetsAt };
  const longer = windows.filter((window) => window.name !== 'five_hour').reduce<(typeof windows)[number] | null>((most, window) => (!most || window.utilization > most.utilization ? window : most), null);
  const now = new Date();
  const words = t.common.quota;
  return (
    <div className="cp-quota">
      {/* Escape closes the details here: going further, it would close or interrupt the open session (App.tsx) */}
      <button
        type="button" className="cp-quota__trigger" aria-describedby="quota-details"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); e.currentTarget.blur(); } }}
      >
        <Ring name={five.name} utilization={five.utilization} />
        {longer && <Ring name={longer.name} utilization={longer.utilization} />}
      </button>
      <div className="cp-quota__details" id="quota-details" role="tooltip">
        <p className="cp-quota__heading">{words.heading}</p>
        <ul className="cp-quota__windows">
          {windows.map((window) => (
            <li key={window.name}>
              <span className="cp-quota__name">{quotaWindowName(window.name)}</span>
              <span className="cp-quota__percent">{t.common.percent(percent(window.utilization))}</span>
              <progress className="cp-meter" data-level={usageLevel(window.utilization)} value={percent(window.utilization)} max={100} />
              <span className="cp-quota__reset">{window.resetsAt ? words.resetsAt(resetLabel(window.resetsAt, now)) : words.resetUnknown}</span>
            </li>
          ))}
        </ul>
        <p className="cp-quota__note">{words.note}</p>
      </div>
    </div>
  );
}

/** One usage window as a ring, its percentage in the middle (its name for screen readers and on hover). */
function Ring({ name, utilization }: { name: string; utilization: number }) {
  return (
    <span className="cp-quota__ring" data-level={usageLevel(utilization)} title={quotaWindowName(name)}>
      <span className="cp-sr-only">{quotaWindowName(name)}</span>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r="15.5" pathLength={100} />
        <circle cx="18" cy="18" r="15.5" pathLength={100} strokeDasharray={`${percent(utilization)} 100`} />
      </svg>
      <span className="cp-quota__value">{percent(utilization)}<span className="cp-sr-only"> %</span></span>
    </span>
  );
}
