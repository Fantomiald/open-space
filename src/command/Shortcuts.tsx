import { t } from '../i18n/index.ts';

const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const MODIFIER = MAC ? '⌘' : 'Ctrl';
const OPTION = MAC ? '⌥' : 'Alt';

/** The keyboard shortcuts, as App.tsx and the windows listen to them (read-only). */
export function Shortcuts() {
  const words = t.settings.prefs.shortcuts;
  const groups: readonly (readonly [string, readonly (readonly [string, readonly string[]])[]])[] = [
    [words.groups.everywhere, [[words.search, [MODIFIER, 'K']], [words.settings, [MODIFIER, ',']], [words.focus, [MODIFIER, '.']], [words.terminal, MAC ? [OPTION, MODIFIER, 'T'] : [MODIFIER, OPTION, 'T']]]],
    [words.groups.sessions, [
      [words.newSession, ['N']], [words.quickSession, ['⇧', 'N']], [words.command, ['/']], [words.threadSearch, [MODIFIER, 'F']],
      [words.interrupt, ['esc']], [words.hide, ['tab']],
    ]],
    [words.groups.windows, [[words.move, [OPTION, words.drag]], [words.zoom, [OPTION, words.wheel]], [words.magnets, [MODIFIER]]]],
  ];
  return groups.map(([title, keys]) => (
    <section key={title} className="cp-prefs__group" aria-label={title}>
      <h4 className="cp-prefs__group-title">{title}</h4>
      <dl className="cp-prefs__card cp-keys">
        {keys.map(([label, combo]) => (
          <div key={label} className="cp-keys__row">
            <dt>{label}</dt>
            <dd>{combo.map((key) => <kbd key={key} className="cp-kbd">{key}</kbd>)}</dd>
          </div>
        ))}
      </dl>
    </section>
  ));
}
