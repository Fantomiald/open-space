import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { dayOf, isPriced, modelName, totalTokens, USAGE_DAYS, type CostReport, type Tokens } from '../../shared/usage.ts';
import { locale, t } from '../i18n/index.ts';
import { folderName, formatClock, formatDollars, formatMinutes, formatTokens, homeRelative } from '../lib/format.ts';
import { useSessions } from '../state/sessions.ts';
import {
  byModel, byProject, daysAfter, daysUntil, mondayOf, OTHERS, perDay, rewindOf, SERIES_SLOTS, seriesOf, spentOn, measure, type Metric, type Spending,
} from '../state/usage.ts';
import { BarChart, type Column } from './BarChart.tsx';
import {
  ActivityIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, CostIcon, FolderIcon, PeakIcon, RefreshIcon, TrendIcon, WeekIcon,
} from './Icons.tsx';

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];
const DAYS_SHOWN = 7;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** The colour slot of a model in the charts ("0" to "3"), or the others. */
const slotKey = (series: readonly string[], model: string) => {
  const rank = series.indexOf(model);
  return rank >= 0 && rank < SERIES_SLOTS ? String(rank) : OTHERS;
};
const slotsOf = (series: readonly string[]) => [...series.slice(0, SERIES_SLOTS).map((_, rank) => String(rank)), ...(series.length > SERIES_SLOTS ? [OTHERS] : [])];
const slotName = (series: readonly string[], slot: string) => (slot === OTHERS ? t.usage.chart.others : modelName(series[Number(slot)]));

const detail = (tokens: Tokens) => t.usage.tokensDetail(formatTokens(tokens.input), formatTokens(tokens.output), formatTokens(tokens.cacheWrite5m + tokens.cacheWrite1h), formatTokens(tokens.cacheRead));
const weekdayOf = (day: string, length: 'short' | 'long' = 'short') => new Date(`${day}T12:00`).toLocaleDateString(locale(), { weekday: length });
const shortDay = (day: string) => new Date(`${day}T12:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });

/** What Claude Code used on this computer: the overview (days, models, projects) and the week's rewind. */
export function UsagePanel() {
  const report = useSessions((s) => s.costs);
  const row = useSessions((s) => s.settingsRow);
  const [tab, setTab] = useState<'overview' | 'rewind'>(row === 'rewind' ? 'rewind' : 'overview');
  const [refreshing, setRefreshing] = useState(false);
  const store = useSessions.getState;
  const words = t.usage;

  useEffect(() => { store().loadCosts(); }, [store]);
  useEffect(() => { if (report && !report.scanning) setRefreshing(false); }, [report]);
  useEffect(() => { if (row === 'rewind') setTab('rewind'); }, [row]);

  const refresh = () => { setRefreshing(true); store().loadCosts(true); };
  const busy = refreshing || !report || report.scanning;

  return (
    <div className="cp-usage">
      <div className="cp-usage__bar">
        <div className="cp-segmented" role="tablist" aria-label={words.tabsLabel}>
          {(['overview', 'rewind'] as const).map((id) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{words.tabs[id]}</button>
          ))}
        </div>
        <span className="cp-usage__updated" role="status">
          {!report ? words.loading : report.scanning ? words.scanning : words.updated(formatClock(report.generatedAt))}
        </span>
        <button type="button" className="cp-icon-button" data-busy={busy} aria-label={words.refresh} title={words.refresh} disabled={busy} onClick={refresh}><RefreshIcon /></button>
      </div>
      {report && report.models.length === 0 && !report.scanning ? <p className="cp-usage__empty">{words.empty}</p>
        : report ? (tab === 'overview' ? <Overview report={report} /> : <WeekRewind report={report} />)
        : <div className="cp-usage__placeholder" aria-hidden="true" />}
      <p className="cp-usage__note">{words.note}</p>
    </div>
  );
}

function Tile({ icon, label, value, hint, tone }: { icon: ReactNode; label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="cp-usage__tile" data-tone={tone}>
      <span className="cp-usage__tile-label">{icon}{label}</span>
      <span className="cp-usage__tile-value">{value}</span>
      {hint && <span className="cp-usage__tile-hint">{hint}</span>}
    </div>
  );
}

/** A model's coloured key, for the legends and the cards. */
const Key = ({ slot }: { slot: string }) => <span className="cp-usage__key" data-slot={slot} aria-hidden="true" />;

function Legend({ series }: { series: readonly string[] }) {
  return (
    <ul className="cp-usage__legend">
      {slotsOf(series).map((slot) => <li key={slot}><Key slot={slot} />{slotName(series, slot)}</li>)}
    </ul>
  );
}

/** The card shown over a hovered column: the day, each model's share, the total. */
function ColumnCard({ title, column, series, format }: { title: string; column: Column; series: readonly string[]; format: (value: number) => string }) {
  const slots = slotsOf(series).filter((slot) => (column.values[slot] ?? 0) > 0);
  const total = slots.reduce((sum, slot) => sum + (column.values[slot] ?? 0), 0);
  return (
    <>
      <strong>{title}</strong>
      {slots.map((slot) => <span key={slot} className="cp-chart__card-line"><Key slot={slot} />{slotName(series, slot)}<b>{format(column.values[slot] ?? 0)}</b></span>)}
      {slots.length !== 1 && <span className="cp-chart__card-line cp-chart__card-total">{t.usage.total}<b>{format(total)}</b></span>}
    </>
  );
}

const columnsOf = (days: ReturnType<typeof perDay>, series: readonly string[], metric: Metric, label: (day: string) => string): Column[] =>
  days.map(({ day, values }) => {
    const byslot: Record<string, number> = {};
    for (const [model, spending] of Object.entries(values)) {
      const slot = model === OTHERS ? OTHERS : slotKey(series, model);
      byslot[slot] = (byslot[slot] ?? 0) + measure(spending, metric);
    }
    return { key: day, label: label(day), values: byslot };
  });

/** A list of spendings with a bar of its share of the largest. */
function Ranking({ rows }: { rows: { key: string; slot?: string; title: ReactNode; detail: string; cost: number; unpriced?: boolean }[] }) {
  const top = Math.max(...rows.map((entry) => entry.cost), 0) || 1;
  return (
    <ul className="cp-usage__ranking">
      {rows.map((entry) => (
        <li key={entry.key}>
          <span className="cp-usage__ranking-text">
            <span className="cp-usage__ranking-title">{entry.slot && <Key slot={entry.slot} />}{entry.title}</span>
            <span className="cp-usage__ranking-detail">{entry.detail}</span>
          </span>
          <span className="cp-usage__meter" aria-hidden="true"><span data-slot={entry.slot ?? 'neutral'} style={{ '--share': entry.cost / top } as CSSProperties} /></span>
          <span className="cp-usage__ranking-cost">{entry.unpriced ? t.usage.unpriced : formatDollars(entry.cost)}</span>
        </li>
      ))}
    </ul>
  );
}

function Overview({ report }: { report: CostReport }) {
  const words = t.usage;
  const [metric, setMetric] = useState<Metric>('cost');
  const [range, setRange] = useState<Range>(30);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [allDays, setAllDays] = useState(false);
  const today = dayOf(report.generatedAt);
  const series = useMemo(() => seriesOf(report), [report]);
  const days = useMemo(() => daysUntil(today, range), [today, range]);
  const format = metric === 'cost' ? (value: number) => formatDollars(value) : formatTokens;
  const columns = useMemo(() => columnsOf(perDay(report, days, series), series, metric, shortDay), [report, days, series, metric]);
  const spent = spentOn(report, days);
  const models = byModel(report, days);
  const projects = byProject(report, days).slice(0, 8);
  const recent = useMemo(() => perDay(report, daysUntil(today, USAGE_DAYS), series).reverse().filter((entry) => Object.keys(entry.values).length), [report, today, series]);
  const listed = allDays ? recent : recent.slice(0, DAYS_SHOWN);
  const dayName = (day: string) => (day === today ? words.today : day === daysUntil(today, 2)[0] ? words.yesterday : new Date(`${day}T12:00`).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' }));

  return (
    <>
      <div className="cp-usage__tiles">
        <Tile icon={<CostIcon />} tone="0" label={words.tiles.today} value={formatDollars(spentOn(report, [today]).cost)} hint={words.turns(spentOn(report, [today]).turns)} />
        <Tile icon={<TrendIcon />} tone="1" label={words.tiles.week} value={formatDollars(spentOn(report, daysUntil(today, 7)).cost)} hint={words.tokensShort(formatTokens(totalTokens(spentOn(report, daysUntil(today, 7)).tokens)))} />
        <Tile icon={<WeekIcon />} tone="2" label={words.tiles.month} value={formatDollars(spentOn(report, daysUntil(today, 30)).cost)} hint={words.tokensShort(formatTokens(totalTokens(spentOn(report, daysUntil(today, 30)).tokens)))} />
      </div>

      <section className="cp-usage__card" aria-label={metric === 'cost' ? words.chart.cost : words.chart.tokens}>
        <header className="cp-usage__card-head">
          <div>
            <h4 className="cp-usage__eyebrow">{metric === 'cost' ? words.chart.cost : words.chart.tokens}</h4>
            <p className="cp-usage__sub">{words.chart.over(metric === 'cost' ? formatDollars(spent.cost) : formatTokens(totalTokens(spent.tokens)), range)}</p>
          </div>
          <div className="cp-usage__controls">
            <div className="cp-segmented" data-size="small" role="radiogroup" aria-label={words.chart.metric}>
              {(['cost', 'tokens'] as const).map((id) => <button key={id} type="button" role="radio" aria-checked={metric === id} onClick={() => setMetric(id)}>{words.chart.metrics[id]}</button>)}
            </div>
            <div className="cp-segmented" data-size="small" role="radiogroup" aria-label={words.chart.range}>
              {RANGES.map((id) => <button key={id} type="button" role="radio" aria-checked={range === id} onClick={() => setRange(id)}>{words.chart.ranges(id)}</button>)}
            </div>
          </div>
        </header>
        <Legend series={series} />
        <BarChart
          columns={columns} slots={slotsOf(series)} format={metric === 'cost' ? (value) => formatDollars(value, true) : formatTokens}
          label={words.chart.label(words.chart.metrics[metric], range)}
          describe={(column) => <ColumnCard title={dayName(column.key)} column={column} series={series} format={format} />}
        />
      </section>

      <div className="cp-usage__split">
        <section className="cp-usage__card" aria-label={words.byModel}>
          <h4 className="cp-usage__eyebrow">{words.byModel}</h4>
          <Ranking rows={models.map((entry) => ({ key: entry.model, slot: slotKey(series, entry.model), title: modelName(entry.model), detail: detail(entry.tokens), cost: entry.cost, unpriced: !isPriced(entry.model) }))} />
        </section>
        <section className="cp-usage__card" aria-label={words.byProject}>
          <h4 className="cp-usage__eyebrow">{words.byProject}</h4>
          <Ranking rows={projects.map((entry) => ({ key: entry.project, title: <><FolderIcon /><span title={homeRelative(entry.project)}>{entry.project ? folderName(entry.project) : words.noProject}</span></>, detail: words.tokensShort(formatTokens(totalTokens(entry.tokens))), cost: entry.cost }))} />
        </section>
      </div>

      <section className="cp-usage__card" aria-label={words.byDay}>
        <h4 className="cp-usage__eyebrow">{words.byDay}</h4>
        <ul className="cp-usage__days">
          {listed.map(({ day, values }) => {
            const entries = Object.entries(values).sort((a, b) => b[1].cost - a[1].cost) as [string, Spending][];
            const cost = entries.reduce((sum, [, spending]) => sum + spending.cost, 0);
            const tokens = entries.reduce((sum, [, spending]) => sum + totalTokens(spending.tokens), 0);
            const open = openDay === day;
            return (
              <li key={day} data-open={open}>
                <button type="button" className="cp-usage__day" aria-expanded={open} onClick={() => setOpenDay(open ? null : day)}>
                  <ChevronDownIcon />
                  <span className="cp-usage__day-name">{dayName(day)}</span>
                  <span className="cp-usage__day-models">{entries.map(([model]) => (model === OTHERS ? words.chart.others : modelName(model))).join(', ')}</span>
                  <span className="cp-usage__day-tokens">{words.tokensShort(formatTokens(tokens))}</span>
                  <span className="cp-usage__day-cost">{formatDollars(cost)}</span>
                </button>
                {open && (
                  <ul className="cp-usage__day-detail">
                    {byModel(report, [day]).map((entry) => (
                      <li key={entry.model}>
                        <span><Key slot={slotKey(series, entry.model)} />{modelName(entry.model)}</span>
                        <span className="cp-usage__ranking-detail">{detail(entry.tokens)}</span>
                        <span className="cp-usage__ranking-cost">{formatDollars(entry.cost)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        {!allDays && recent.length > DAYS_SHOWN && <button type="button" className="cp-button cp-usage__more" data-variant="quiet" onClick={() => setAllDays(true)}>{words.more(recent.length - DAYS_SHOWN)}</button>}
      </section>
    </>
  );
}

function WeekRewind({ report }: { report: CostReport }) {
  const words = t.usage.rewind;
  const today = dayOf(report.generatedAt);
  const thisWeek = mondayOf(today);
  const [monday, setMonday] = useState(thisWeek);
  const [cell, setCell] = useState<{ day: number; hour: number } | null>(null);
  const series = useMemo(() => seriesOf(report), [report]);
  const rewind = useMemo(() => rewindOf(report, monday, series), [report, monday, series]);
  const oldest = mondayOf(daysUntil(today, USAGE_DAYS)[0]);
  const step = (weeks: number) => setMonday(daysAfter(monday, weeks * 7)[0]);
  const last = rewind.days[6];
  const range = `${shortDay(monday)} - ${shortDay(last)}`;
  const peakMinutes = Math.max(1, ...rewind.heatmap.flat());
  const costColumns = columnsOf(rewind.costByDay, series, 'cost', (day) => weekdayOf(day));
  const sessionColumns: Column[] = rewind.days.map((day, at) => ({ key: day, label: weekdayOf(day), values: { neutral: rewind.sessionsByDay[at] } }));

  return (
    <>
      <div className="cp-usage__week">
        <button type="button" className="cp-icon-button" aria-label={words.previous} title={words.previous} disabled={monday <= oldest} onClick={() => step(-1)}><ChevronLeftIcon /></button>
        <span className="cp-usage__week-range" aria-live="polite">{range}</span>
        <button type="button" className="cp-icon-button" aria-label={words.next} title={words.next} disabled={monday >= thisWeek} onClick={() => step(1)}><ChevronRightIcon /></button>
      </div>
      <div className="cp-usage__tiles" data-count="6">
        <Tile icon={<ClockIcon />} tone="0" label={words.agentTime} value={formatMinutes(rewind.minutes)} hint={words.agentTimeHint} />
        <Tile icon={<ActivityIcon />} tone="3" label={words.sessions} value={String(rewind.sessions)} hint={words.sessionsHint} />
        <Tile icon={<CostIcon />} tone="1" label={words.cost} value={formatDollars(rewind.cost)} hint={words.costHint} />
        <Tile icon={<PeakIcon />} tone="2" label={words.peak} value={rewind.peak ? words.hours(rewind.peak.from, rewind.peak.from + 3) : words.none} hint={rewind.peak ? words.peakHint(formatMinutes(rewind.peak.minutes)) : undefined} />
        <Tile icon={<FolderIcon />} tone="0" label={words.topProject} value={rewind.topProject ? folderName(rewind.topProject.project) || t.usage.noProject : words.none} hint={rewind.topProject ? words.topProjectHint(rewind.topProject.sessions) : undefined} />
        <Tile icon={<WeekIcon />} tone="3" label={words.busiestDay} value={rewind.busiestDay ? weekdayOf(rewind.busiestDay.day, 'long') : words.none} hint={rewind.busiestDay ? words.busiestDayHint(formatMinutes(rewind.busiestDay.minutes)) : undefined} />
      </div>
      {rewind.minutes === 0 && rewind.cost === 0 ? <p className="cp-usage__empty">{words.quiet}</p> : (
        <>
          <div className="cp-usage__split">
            <section className="cp-usage__card" aria-label={words.sessionsByDay}>
              <h4 className="cp-usage__eyebrow">{words.sessionsByDay}</h4>
              <BarChart columns={sessionColumns} slots={['neutral']} format={(value) => String(Math.round(value))} label={words.sessionsByDay} labelWidth={32}
                describe={(column) => <><strong>{weekdayOf(column.key, 'long')}</strong><span className="cp-chart__card-line">{words.sessions}<b>{column.values.neutral}</b></span></>} />
            </section>
            <section className="cp-usage__card" aria-label={words.costByDay}>
              <h4 className="cp-usage__eyebrow">{words.costByDay}</h4>
              <BarChart columns={costColumns} slots={slotsOf(series)} format={(value) => formatDollars(value, true)} label={words.costByDay} labelWidth={32}
                describe={(column) => <ColumnCard title={weekdayOf(column.key, 'long')} column={column} series={series} format={(value) => formatDollars(value)} />} />
            </section>
          </div>
          <div className="cp-usage__split">
            <section className="cp-usage__card" aria-label={words.heatmap}>
              <h4 className="cp-usage__eyebrow">{words.heatmap}</h4>
              <div className="cp-heatmap" role="img" aria-label={words.heatmapLabel} onMouseLeave={() => setCell(null)}>
                <span />
                {HOURS.map((hour) => <span key={hour} className="cp-heatmap__hour">{hour % 3 === 0 ? hour : ''}</span>)}
                {rewind.heatmap.map((hours, day) => (
                  <div key={rewind.days[day]} className="cp-heatmap__row">
                    <span className="cp-heatmap__day">{weekdayOf(rewind.days[day]).slice(0, 2)}</span>
                    {HOURS.map((hour) => (
                      <span
                        key={hour} className="cp-heatmap__cell" data-level={hours[hour] === 0 ? 0 : Math.min(4, Math.ceil((hours[hour] / peakMinutes) * 4))}
                        data-active={cell?.day === day && cell.hour === hour} onMouseEnter={() => setCell({ day, hour })}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <p className="cp-usage__caption" aria-live="polite">
                {cell ? `${weekdayOf(rewind.days[cell.day], 'long')} ${words.hours(cell.hour, cell.hour + 1)} : ${formatMinutes(rewind.heatmap[cell.day][cell.hour])}` : ' '}
              </p>
            </section>
            <section className="cp-usage__card" aria-label={words.models}>
              <h4 className="cp-usage__eyebrow">{words.models}</h4>
              <Ranking rows={rewind.models.map((entry) => ({ key: entry.model, slot: slotKey(series, entry.model), title: modelName(entry.model), detail: `${t.usage.turns(entry.turns)} · ${t.usage.tokensShort(formatTokens(totalTokens(entry.tokens)))}`, cost: entry.cost, unpriced: !isPriced(entry.model) }))} />
            </section>
          </div>
        </>
      )}
    </>
  );
}
