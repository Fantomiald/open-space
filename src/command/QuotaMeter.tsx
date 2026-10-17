import type { Quota } from '../../shared/protocol.ts';
import { quotaWindowName, resetLabel, usageLevel } from '../lib/format.ts';

const percent = (utilization: number) => Math.round(utilization * 100);

/** The five-hour usage in the header; hovering or focusing it shows every usage window and when each frees up. */
export function QuotaMeter({ quota }: { quota: Quota }) {
  const windows = quota.windows.length ? quota.windows : [{ name: 'five_hour', utilization: quota.fiveHour, resetsAt: quota.resetsAt }];
  const now = new Date();
  return (
    <div className="cp-quota">
      <button type="button" className="cp-quota__trigger" aria-describedby="quota-details">
        <span className="cp-quota__label">5 h</span>
        <progress className="cp-meter" data-level={usageLevel(quota.fiveHour)} value={percent(quota.fiveHour)} max={100} />
        <span className="cp-quota__value">{percent(quota.fiveHour)} %</span>
      </button>
      <div className="cp-quota__details" id="quota-details" role="tooltip">
        <p className="cp-quota__heading">Ton abonnement</p>
        <ul className="cp-quota__windows">
          {windows.map((window) => (
            <li key={window.name}>
              <span className="cp-quota__name">{quotaWindowName(window.name)}</span>
              <span className="cp-quota__percent">{percent(window.utilization)} %</span>
              <progress className="cp-meter" data-level={usageLevel(window.utilization)} value={percent(window.utilization)} max={100} />
              <span className="cp-quota__reset">{window.resetsAt ? `Repart à zéro ${resetLabel(window.resetsAt, now)}` : 'Heure de remise à zéro inconnue'}</span>
            </li>
          ))}
        </ul>
        <p className="cp-quota__note">Claude Code donne ces chiffres pendant qu’une session travaille : ce sont les derniers reçus.</p>
      </div>
    </div>
  );
}
