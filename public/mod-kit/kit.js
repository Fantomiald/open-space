// The mod kit (with kit.css): the link between a mod's page and Open Space around it, and the components a mod is
// built from. Plain custom elements in the page's own DOM (no shadow root), so kit.css and the mod's own CSS reach
// them. Every component takes its data as a JSON attribute or as a property of the same name, and draws again when
// either changes or when its width does. See GUIDE.md (the CLAUDE.md of the mods folder) for how to use them.
(() => {
  'use strict';
  const host = window.parent !== window ? window.parent : null;
  const root = document.documentElement;
  let language = navigator.language || 'en';

  // ── Open Space around the page ──
  const watchers = new Map(); // name -> Set of functions
  const latest = new Map(); // name -> last value
  const refreshers = new Set();
  let envAsked = [];
  let themed;
  const ready = new Promise((resolve) => { themed = resolve; });
  const say = (message) => host?.postMessage({ openSpace: message.kind, ...message }, '*');
  addEventListener('message', (event) => {
    const message = event.data;
    if (event.source !== host || !message || typeof message.openSpace !== 'string') return;
    if (message.openSpace === 'theme') {
      for (const [name, value] of Object.entries(message.vars ?? {})) root.style.setProperty(name, value);
      if (message.style) root.dataset.windowStyle = message.style;
      if (message.language) { language = message.language; root.lang = language; }
      root.toggleAttribute('data-reduced-motion', !!message.reducedMotion);
      themed();
      dispatchEvent(new Event('os:theme'));
    }
    if (message.openSpace === 'data') {
      latest.set(message.name, message.value);
      for (const heard of watchers.get(message.name) ?? []) heard(message.value);
    }
    if (message.openSpace === 'env') {
      const asked = envAsked;
      envAsked = [];
      for (const resolve of asked) resolve({ ...(message.env ?? {}) });
    }
    if (message.openSpace === 'refresh') for (const refresh of refreshers) refresh();
    if (message.openSpace === 'store') heardStored(message.name, message.value ?? null);
  });
  // alone in a tab (opened by hand, or a test): the classic look, and no data
  if (!host) themed();

  /** Calls `heard` with what Open Space knows under `name` now, and each time it changes. Returns what stops it. */
  function watch(name, heard) {
    const known = watchers.get(name) ?? new Set();
    watchers.set(name, known);
    known.add(heard);
    if (latest.has(name)) heard(latest.get(name));
    if (known.size === 1) say({ kind: 'watch', name });
    return () => { known.delete(heard); if (!known.size) { watchers.delete(name); latest.delete(name); say({ kind: 'unwatch', name }); } };
  }
  /** What Open Space knows under `name` right now (null outside Open Space). */
  const data = (name) => new Promise((resolve) => {
    if (!host) { resolve(null); return; }
    const stop = watch(name, (value) => { queueMicrotask(() => stop()); resolve(value); });
  });
  /** The variables the user gave the mod in its settings ({ NAME: value }), read again at each call ({} outside Open Space). */
  const env = () => new Promise((resolve) => {
    if (!host) { resolve({}); return; }
    envAsked.push(resolve);
    say({ kind: 'env' });
  });
  /**
   * Calls `refresh` when the window refreshes the mod (its ↻ button, or the pace set in its settings), instead of
   * loading the page again. Returns what stops it.
   */
  function onRefresh(refresh) {
    refreshers.add(refresh);
    if (refreshers.size === 1) say({ kind: 'refreshable', on: true });
    return () => { refreshers.delete(refresh); if (!refreshers.size) say({ kind: 'refreshable', on: false }); };
  }
  // what the page saves, kept by Open Space in the mod's folder (in memory alone outside Open Space)
  const storeAsked = new Map(); // name -> resolve functions
  const storeWatchers = new Map(); // name -> Set of functions
  const alone = new Map();
  function heardStored(name, value) {
    const asked = storeAsked.get(name) ?? [];
    storeAsked.delete(name);
    for (const resolve of asked) resolve(value);
    for (const heard of storeWatchers.get(name) ?? []) heard(value);
  }
  const store = {
    /** The JSON value saved under `name` (letters, digits, "-" and "_"), null when nothing was. */
    get: (name) => new Promise((resolve) => {
      if (!host) { resolve(alone.get(name) ?? null); return; }
      storeAsked.set(name, [...(storeAsked.get(name) ?? []), resolve]);
      say({ kind: 'store-get', name });
    }),
    /** Saves `value` (JSON, 256 KB at most) under `name`: it is there after the window closes, and in every window of the mod. */
    set(name, value) {
      const copy = JSON.parse(JSON.stringify(value ?? null));
      if (!host) { alone.set(name, copy); for (const heard of storeWatchers.get(name) ?? []) heard(copy); return; }
      say({ kind: 'store-set', name, value: copy });
    },
    /** Calls `heard` with the value saved under `name`, then each time a window of the mod saves another. Returns what stops it. */
    watch(name, heard) {
      const known = storeWatchers.get(name) ?? new Set();
      storeWatchers.set(name, known);
      known.add(heard);
      void store.get(name).then((value) => { if (known.has(heard)) heard(value); });
      return () => { known.delete(heard); };
    },
  };
  /** A JSON file of the mod's own folder ("data/sales.json"), read fresh. */
  async function json(file) {
    const answer = await fetch(new URL(file, document.baseURI), { cache: 'no-store' });
    if (!answer.ok) throw new Error(`${file}: ${answer.status}`);
    return answer.json();
  }

  // ── words and numbers ──
  const number = (value, options) => new Intl.NumberFormat(language, { maximumFractionDigits: Math.abs(value) < 100 ? 1 : 0, ...options }).format(value);
  const format = {
    number,
    /** 1284 -> "1,3 k" */
    compact: (value) => number(value, { notation: 'compact', maximumFractionDigits: 1 }),
    money: (value, currency = 'USD') => number(value, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: Math.abs(value) < 100 ? 2 : 0 }),
    /** 0.62 -> "62 %" */
    percent: (value) => number(value, { style: 'percent', maximumFractionDigits: 0 }),
    /** a date or a time in ms -> "il y a 4 min" */
    ago(when) {
      const seconds = Math.min(0, (new Date(when).getTime() - Date.now()) / 1000);
      const relative = new Intl.RelativeTimeFormat(language, { numeric: 'auto', style: 'short' });
      for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]]) if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
      return relative.format(Math.round(seconds), 'second');
    },
    /** minutes -> "2 h 05" */
    duration(minutes) {
      const whole = Math.round(minutes);
      return whole < 60 ? `${whole} min` : `${Math.floor(whole / 60)} h ${String(whole % 60).padStart(2, '0')}`;
    },
    date: (when, options = { day: 'numeric', month: 'short' }) => new Intl.DateTimeFormat(language, options).format(new Date(when)),
  };

  // ── drawing helpers ──
  const SVG = 'http://www.w3.org/2000/svg';
  /** An element with its attributes and children: h('span', { class: 'x' }, 'text', other). */
  function h(tag, attributes = {}, ...children) {
    const svg = ['svg', 'path', 'line', 'rect', 'circle', 'text', 'g', 'polyline'].includes(tag);
    const element = svg ? document.createElementNS(SVG, tag) : document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) if (value !== null && value !== undefined && value !== false) element.setAttribute(name, value === true ? '' : String(value));
    for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) element.append(child);
    return element;
  }
  const series = (index) => `var(--series-${(index % 8) + 1})`;
  /** Round steps for an axis from 0 to at least `max`: [0, 10, 20, 30]. */
  function steps(max, count = 3) {
    if (!(max > 0)) return [0, 1];
    const rough = max / count, power = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 2.5, 5, 10].map((unit) => unit * power).find((unit) => unit >= rough);
    const ticks = [];
    for (let tick = 0; tick < max + step - 1e-9; tick += step) ticks.push(Number(tick.toFixed(10)));
    return ticks;
  }

  /**
   * The base of every component: reads its data from JSON attributes or properties, draws when connected and again
   * when its data or its width changes. `fields` are the attributes that hold JSON.
   */
  class Part extends HTMLElement {
    static fields = [];
    static get observedAttributes() { return this.watched ?? []; }
    #given = {};
    #drawing = false;
    #watching = null;
    connectedCallback() {
      // a property set before the element was defined
      for (const field of this.constructor.fields) if (Object.hasOwn(this, field)) { const value = this[field]; delete this[field]; this[field] = value; }
      if (this.constructor.resizes) { this.#watching = new ResizeObserver(() => this.redraw()); this.#watching.observe(this); }
      this.redraw();
    }
    disconnectedCallback() { this.#watching?.disconnect(); }
    attributeChangedCallback() { if (this.isConnected) this.redraw(); }
    /** The data of `field`: the property when set, else the attribute read as JSON, else `fallback`. */
    read(field, fallback) {
      if (field in this.#given) return this.#given[field] ?? fallback;
      const raw = this.getAttribute(field);
      if (raw === null) return fallback;
      try { return JSON.parse(raw); } catch { return fallback; }
    }
    give(field, value) { this.#given[field] = value; if (this.isConnected) this.redraw(); }
    /** Its children replaced by these, the empty ones (null, false, '') left out. */
    fill(...children) { this.replaceChildren(...children.flat().filter((child) => child !== null && child !== undefined && child !== false && child !== '')); }
    redraw() {
      if (this.#drawing) return;
      this.#drawing = true;
      queueMicrotask(() => { this.#drawing = false; if (this.isConnected) this.draw(); });
    }
    draw() {}
  }
  /** Defines a component: its tag, the attributes that redraw it, its JSON fields (also properties). */
  function define(tag, { attributes = [], fields = [], resizes = false }, Kind) {
    Kind.fields = fields;
    Kind.watched = [...attributes, ...fields];
    Kind.resizes = resizes;
    for (const field of fields) Object.defineProperty(Kind.prototype, field, { get() { return this.read(field); }, set(value) { this.give(field, value); }, configurable: true });
    customElements.define(tag, Kind);
  }

  // <os-stat label="30 jours" value="1 284 $" delta="+18 %" tone="good" hint="…" size="large">
  define('os-stat', { attributes: ['label', 'value', 'delta', 'tone', 'hint'] }, class extends Part {
    draw() {
      const delta = this.getAttribute('delta');
      this.fill(
        h('span', { class: 'os-stat__label' }, this.getAttribute('label') ?? ''),
        h('span', { class: 'os-stat__value' }, this.getAttribute('value') ?? '–', delta && h('span', { class: 'os-stat__delta', 'data-tone': this.getAttribute('tone') }, delta)),
        this.getAttribute('hint') && h('span', { class: 'os-stat__hint' }, this.getAttribute('hint')),
      );
    }
  });
  customElements.define('os-stats', class extends HTMLElement {});
  customElements.define('os-row', class extends HTMLElement {});

  // <os-section title="Par app"> … </os-section>: a title over what it holds; action="…" puts a word at its right
  define('os-section', { attributes: ['title', 'action'] }, class extends Part {
    draw() {
      this.querySelector(':scope > .os-title')?.remove();
      const title = this.getAttribute('title');
      if (title) this.prepend(h('div', { class: 'os-title' }, h('span', {}, title), this.getAttribute('action') && h('span', {}, this.getAttribute('action'))));
    }
  });

  /** The shared frame of the line and bar charts: the axis, the grid, and the tooltip that follows the pointer. */
  class Chart extends Part {
    frame(count, max, labels, paint, tip) {
      const width = Math.max(120, this.clientWidth), height = Number(this.getAttribute('height')) || (width < 300 ? 110 : 150);
      const unit = this.getAttribute('unit') ?? '';
      const ticks = steps(max), top = ticks[ticks.length - 1];
      const text = (value) => `${format.compact(value)}${unit ? ` ${unit}` : ''}`;
      const left = Math.max(...ticks.map((tick) => text(tick).length)) * 5.6 + 8, bottom = labels.length ? 16 : 4;
      const plot = { left, top: 6, width: width - left - 4, height: height - 6 - bottom };
      const y = (value) => plot.top + plot.height - (value / top) * plot.height;
      const svg = h('svg', { viewBox: `0 0 ${width} ${height}`, height, role: 'img', 'aria-label': this.getAttribute('label') ?? '' });
      for (const tick of ticks) svg.append(h('line', { class: 'os-chart__grid', x1: plot.left, x2: plot.left + plot.width, y1: y(tick), y2: y(tick) }), h('text', { class: 'os-chart__axis', x: plot.left - 6, y: y(tick) + 3, 'text-anchor': 'end' }, text(tick)));
      // as many labels as fit: the first, the last, and some between
      const longest = Math.max(1, ...labels.map((label) => String(label).length)), room = Math.max(2, Math.floor(plot.width / (longest * 6.6 + 16))), every = Math.max(1, Math.ceil(count / room));
      const x = paint(svg, plot, y);
      labels.forEach((label, at) => {
        const last = at === count - 1;
        if (!last && (at % every !== 0 || count - 1 - at < every)) return;
        svg.append(h('text', { class: 'os-chart__axis', x: x(at), y: height - 2, 'text-anchor': at === 0 ? 'start' : last ? 'end' : 'middle' }, label));
      });
      const box = h('div', { class: 'os-chart' }, svg), bubble = h('div', { class: 'os-tip', hidden: true });
      box.append(bubble);
      const guide = h('line', { class: 'os-chart__guide', y1: plot.top, y2: plot.top + plot.height, visibility: 'hidden' });
      svg.append(guide);
      box.addEventListener('pointermove', (event) => {
        const along = (event.clientX - svg.getBoundingClientRect().left - plot.left) / plot.width;
        const picked = Math.min(count - 1, Math.max(0, this.banded ? Math.floor(along * count) : Math.round(along * (count - 1))));
        guide.setAttribute('x1', x(picked)); guide.setAttribute('x2', x(picked)); guide.setAttribute('visibility', this.banded ? 'hidden' : 'visible');
        bubble.replaceChildren(...tip(picked, text));
        bubble.hidden = false;
        const side = x(picked) > width / 2;
        bubble.style.left = side ? '' : `${x(picked) + 10}px`;
        bubble.style.right = side ? `${width - x(picked) + 10}px` : '';
        svg.querySelectorAll('.os-chart__bar').forEach((bar) => bar.toggleAttribute('data-on', Number(bar.dataset.at) === picked));
      });
      box.addEventListener('pointerleave', () => { bubble.hidden = true; guide.setAttribute('visibility', 'hidden'); svg.querySelectorAll('[data-on]').forEach((bar) => bar.removeAttribute('data-on')); });
      this.fill(box);
    }
  }

  // <os-line series='[{"name":"SteadyMen","values":[1,2,3]}]' labels='["1 nov","2 nov","3 nov"]' unit="$" area legend>
  define('os-line', { attributes: ['height', 'unit', 'area', 'legend'], fields: ['series', 'labels'], resizes: true }, class extends Chart {
    draw() {
      const lines = (this.read('series', []) ?? []).filter((line) => Array.isArray(line?.values) && line.values.length);
      const labels = this.read('labels', []) ?? [];
      if (!lines.length) { this.fill(h('os-empty', { text: this.getAttribute('empty') ?? '' })); return; }
      const count = Math.max(...lines.map((line) => line.values.length)), max = Math.max(...lines.flatMap((line) => line.values), 0);
      let place = () => 0;
      this.frame(count, max, labels, (svg, plot, y) => {
        place = (at) => plot.left + (count > 1 ? (at / (count - 1)) * plot.width : plot.width / 2);
        lines.forEach((line, index) => {
          const colour = line.color ?? series(index), points = line.values.map((value, at) => `${place(at)},${y(value ?? 0)}`);
          if (this.hasAttribute('area') && lines.length === 1) svg.append(h('path', { class: 'os-chart__area', fill: colour, d: `M${points.join('L')}L${place(line.values.length - 1)},${y(0)}L${place(0)},${y(0)}Z` }));
          svg.append(h('polyline', { class: 'os-chart__line', stroke: colour, points: points.join(' ') }), h('circle', { cx: place(line.values.length - 1), cy: y(line.values.at(-1) ?? 0), r: 3, fill: colour }));
        });
        return place;
      }, (at, text) => [
        labels[at] && h('div', { class: 'os-tip__head' }, labels[at]),
        ...lines.map((line, index) => h('div', { class: 'os-tip__line' }, h('span', { class: 'os-dot', style: `--dot:${line.color ?? series(index)}` }), h('span', {}, line.name ?? ''), h('span', {}, line.values[at] === undefined || line.values[at] === null ? '–' : text(line.values[at])))),
      ]);
      if (this.hasAttribute('legend') && lines.length > 1) this.append(h('os-legend', { style: 'margin-top: var(--space-2)' }, lines.map((line, index) => h('span', {}, h('span', { class: 'os-dot', style: `--dot:${line.color ?? series(index)}` }), line.name ?? ''))));
    }
  });

  // <os-bars data='[{"label":"lun","value":12}]' unit="$">: one bar per entry; values='[…]' labels='[…]' also works
  define('os-bars', { attributes: ['height', 'unit'], fields: ['data', 'values', 'labels'], resizes: true }, class extends Chart {
    banded = true;
    draw() {
      const values = this.read('values', null), names = this.read('labels', []);
      const bars = this.read('data', null) ?? (values ?? []).map((value, at) => ({ value, label: names[at] ?? '' }));
      if (!bars.length) { this.fill(h('os-empty', { text: this.getAttribute('empty') ?? '' })); return; }
      const max = Math.max(...bars.map((bar) => bar.value ?? 0), 0);
      let place = () => 0;
      this.frame(bars.length, max, bars.map((bar) => bar.label ?? ''), (svg, plot, y) => {
        const band = plot.width / bars.length, thick = Math.max(2, Math.min(28, band * 0.7));
        place = (at) => plot.left + band * (at + 0.5);
        bars.forEach((bar, at) => {
          const tall = Math.max(bar.value > 0 ? 1.5 : 0, y(0) - y(bar.value ?? 0)), round = Math.min(4, thick / 2, tall);
          svg.append(h('rect', { class: 'os-chart__bar', 'data-at': at, x: place(at) - thick / 2, y: y(0) - tall, width: thick, height: tall, rx: round, fill: bar.color ?? series(0) }));
        });
        return place;
      }, (at, text) => [h('div', { class: 'os-tip__line' }, h('span', {}, bars[at].label ?? ''), h('span', {}, text(bars[at].value ?? 0)))]);
    }
  });

  // <os-spark values='[3,4,6,5,9]'>: a small line beside a number
  define('os-spark', { attributes: ['width', 'height', 'tone'], fields: ['values'] }, class extends Part {
    draw() {
      const values = this.read('values', []) ?? [], width = Number(this.getAttribute('width')) || 64, height = Number(this.getAttribute('height')) || 18;
      if (values.length < 2) { this.fill(); return; }
      const low = Math.min(...values), span = Math.max(...values) - low || 1;
      const points = values.map((value, at) => `${(at / (values.length - 1)) * width},${height - 2 - ((value - low) / span) * (height - 4)}`);
      this.fill(h('svg', { width, height, viewBox: `0 0 ${width} ${height}`, 'data-tone': this.getAttribute('tone'), 'aria-hidden': 'true' }, h('polyline', { class: 'os-chart__line', stroke: 'var(--tone, var(--series-1))', 'stroke-width': 1.5, points: points.join(' ') })));
    }
  });

  // <os-rows data='[{"label":"Ismaël","value":6.1,"text":"6,10 $"}]'>: ranked bars; max="…" for a fixed scale
  define('os-rows', { attributes: ['max'], fields: ['data'] }, class extends Part {
    draw() {
      const rows = this.read('data', []) ?? [], max = Number(this.getAttribute('max')) || Math.max(...rows.map((row) => row.value ?? 0), 0) || 1;
      this.fill(...rows.flatMap((row, index) => [
        h('span', { class: 'os-rows__label', title: row.label }, row.label ?? ''),
        h('span', { class: 'os-rows__track' }, h('span', { class: 'os-rows__fill', style: `display:block;width:${Math.min(100, ((row.value ?? 0) / max) * 100)}%;--dot:${row.color ?? (this.hasAttribute('colors') ? series(index) : series(0))}` })),
        h('span', { class: 'os-rows__value' }, row.text ?? format.number(row.value ?? 0)),
      ]));
    }
  });

  // <os-meter label="Quota 5 h" value="62" max="100" text="62 %" tone="warn">
  define('os-meter', { attributes: ['label', 'value', 'max', 'text', 'tone'] }, class extends Part {
    draw() {
      const share = Math.min(1, Math.max(0, Number(this.getAttribute('value')) / (Number(this.getAttribute('max')) || 100)));
      this.dataset.tone = this.getAttribute('tone') ?? 'info';
      this.fill(
        h('div', { class: 'os-meter__head' }, h('span', {}, this.getAttribute('label') ?? ''), h('span', {}, this.getAttribute('text') ?? format.percent(share))),
        h('div', { class: 'os-meter__track', role: 'progressbar', 'aria-valuenow': Math.round(share * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('div', { class: 'os-meter__fill', style: `width:${share * 100}%` })),
      );
    }
  });

  // <os-ring label="Objectif" value="41" max="60" text="41">: the same as a ring
  define('os-ring', { attributes: ['label', 'value', 'max', 'text', 'tone', 'size'] }, class extends Part {
    draw() {
      const share = Math.min(1, Math.max(0, Number(this.getAttribute('value')) / (Number(this.getAttribute('max')) || 100)));
      const size = Number(this.getAttribute('size')) || 72, thick = 7, radius = (size - thick) / 2, around = 2 * Math.PI * radius;
      this.dataset.tone = this.getAttribute('tone') ?? 'info';
      this.fill(
        h('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': `${this.getAttribute('label') ?? ''} ${format.percent(share)}` },
          h('circle', { class: 'os-ring__track', cx: size / 2, cy: size / 2, r: radius, 'stroke-width': thick }),
          h('circle', { class: 'os-ring__fill', cx: size / 2, cy: size / 2, r: radius, 'stroke-width': thick, 'stroke-dasharray': around, 'stroke-dashoffset': around * (1 - share), transform: `rotate(-90 ${size / 2} ${size / 2})` }),
          h('text', { class: 'os-ring__value', x: size / 2, y: size / 2 + 5, 'text-anchor': 'middle' }, this.getAttribute('text') ?? format.percent(share))),
        this.getAttribute('label') && h('span', { class: 'os-ring__label' }, this.getAttribute('label')),
      );
    }
  });

  // <os-list data='[{"title":"…","text":"…","value":"…","tone":"good","href":"https://…"}]' wrap>
  define('os-list', { fields: ['data'], attributes: ['empty'] }, class extends Part {
    draw() {
      const items = this.read('data', []) ?? [];
      if (!items.length) { this.fill(h('os-empty', { text: this.getAttribute('empty') ?? '' })); return; }
      this.fill(...items.map((item) => h(item.href ? 'a' : 'div', { class: 'os-item', href: item.href, target: item.href && '_blank', rel: item.href && 'noreferrer', 'data-tone': item.tone },
        item.tone && h('span', { class: 'os-item__mark' }),
        h('span', { class: 'os-item__text' }, h('span', { class: 'os-item__title' }, item.title ?? ''), item.text && h('span', { class: 'os-item__sub' }, item.text)),
        item.value !== undefined && h('span', { class: 'os-item__value' }, String(item.value)),
      )));
    }
  });

  // <os-table columns='[{"key":"app","label":"App","wide":true},{"key":"mrr","label":"MRR","align":"right"}]' rows='[{"app":"…","mrr":"…"}]'>
  define('os-table', { fields: ['columns', 'rows'] }, class extends Part {
    draw() {
      const columns = this.read('columns', []) ?? [], rows = this.read('rows', []) ?? [];
      this.fill(h('table', {},
        h('thead', {}, h('tr', {}, columns.map((column) => h('th', { 'data-align': column.align }, column.label ?? column.key)))),
        h('tbody', {}, rows.map((row) => h('tr', {}, columns.map((column) => h('td', { 'data-align': column.align, 'data-wide': column.wide }, String(row[column.key] ?? '')))))),
      ));
    }
  });

  // <os-tabs options='["Jour","Semaine","Mois"]' value="Jour">: fires "change" with event.detail the option picked
  define('os-tabs', { attributes: ['value'], fields: ['options'] }, class extends Part {
    draw() {
      const options = this.read('options', []) ?? [], chosen = this.getAttribute('value') ?? options[0];
      this.fill(...options.map((option) => {
        const button = h('button', { type: 'button', 'aria-pressed': String(option === chosen) }, option);
        button.addEventListener('click', () => { this.setAttribute('value', option); this.dispatchEvent(new CustomEvent('change', { detail: option, bubbles: true })); });
        return button;
      }));
    }
  });
  customElements.define('os-badge', class extends HTMLElement { connectedCallback() { if (this.hasAttribute('tone')) this.dataset.tone = this.getAttribute('tone'); } });
  customElements.define('os-legend', class extends HTMLElement {});

  // <os-updated at="2026-11-10T08:00:00Z" label="RevenueCat">: "RevenueCat · il y a 4 min", kept up to date
  define('os-updated', { attributes: ['at', 'label'] }, class extends Part {
    #tick = null;
    connectedCallback() { super.connectedCallback(); this.#tick = setInterval(() => this.redraw(), 30_000); }
    disconnectedCallback() { super.disconnectedCallback(); clearInterval(this.#tick); }
    draw() {
      const at = this.getAttribute('at'), when = at && !Number.isNaN(Number(at)) ? Number(at) : at;
      this.textContent = [this.getAttribute('label'), when ? format.ago(when) : null].filter(Boolean).join(' · ');
    }
  });

  // <os-empty title="Rien pour l'instant" text="…">, <os-error text="…">, <os-loading rows="3" block>
  const notice = (tag) => define(tag, { attributes: ['title', 'text'] }, class extends Part {
    draw() { this.fill(this.getAttribute('title') && h('span', { class: 'os-empty__title' }, this.getAttribute('title')), this.getAttribute('text') && h('span', {}, this.getAttribute('text'))); }
  });
  notice('os-empty');
  notice('os-error');
  define('os-loading', { attributes: ['rows', 'block'] }, class extends Part {
    draw() {
      this.setAttribute('aria-busy', 'true');
      this.fill(this.hasAttribute('block') && h('div', { class: 'os-skeleton', 'data-block': true }), ...Array.from({ length: Number(this.getAttribute('rows')) || 3 }, () => h('div', { class: 'os-skeleton' })));
    }
  });

  window.OpenSpace = { ready, watch, data, env, onRefresh, store, json, format, h };
  // the height its content needs, for its window to fit it (until the user gives the window a size of their own)
  let told = 0;
  const measure = () => {
    const body = document.body;
    if (!body) return;
    // what the content covers, nested parts included (a wrapper in display: contents has no box of its own)
    const range = document.createRange();
    range.selectNodeContents(body);
    const bottom = range.getBoundingClientRect().bottom;
    const height = Math.ceil(bottom + window.scrollY + parseFloat(getComputedStyle(body).paddingBottom));
    if (height > 0 && Math.abs(height - told) > 1) { told = height; say({ kind: 'size', height }); }
  };
  const sizing = new ResizeObserver(() => requestAnimationFrame(measure));
  const observeAll = () => { if (!document.body) return; sizing.observe(document.body); for (const child of document.body.children) sizing.observe(child); };
  new MutationObserver(observeAll).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  addEventListener('DOMContentLoaded', () => { observeAll(); measure(); });
  // Escape pressed in the mod reaches Open Space's page, as in any page it frames
  addEventListener('keydown', (event) => { if (event.key === 'Escape') say({ kind: 'escape' }); });
  say({ kind: 'ready' });
})();
