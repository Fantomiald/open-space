// The Connexions page of the Automates panel: the user's chat bots (Telegram now), how to make one, then for each the
// one thing left to do (link the phone, or replace a token Telegram refuses), its settings, and its deletion, confirmed
// in place. The other chat apps are shown as coming.
import { useState } from 'react';
import { MESSENGER_MODEL, parseMessengerInput, SOON_MESSENGERS, type Messenger } from '../../shared/messengers.ts';
import { t } from '../i18n/index.ts';
import { useSessions } from '../state/sessions.ts';
import { Copyable } from './Copyable.tsx';
import { AgentIcon, BrandIcon, CrewIcon, ExternalLinkIcon, KeyIcon, MessageIcon, PlusIcon, RemoveIcon, TagIcon } from './Icons.tsx';
import { PageHead } from './PageHead.tsx';
import { Row } from './PrefsRow.tsx';
import { Switch } from './Switch.tsx';

const AGENT_MODELS = [['haiku', 'Haiku'], ['sonnet', 'Sonnet'], ['opus', 'Opus']] as const;
const BRAND_NAMES = { telegram: 'Telegram', slack: 'Slack', discord: 'Discord' } as const;

export function ConnectionsPage({ close }: { close: () => void }) {
  const bots = useSessions((s) => s.triggers.messengers);
  const [adding, setAdding] = useState(false);
  const words = t.automata.connections;
  return (
    <>
      <PageHead picture={<MessageIcon />} title={t.automata.tabs.connections} intro={words.head} close={close} />
      <div className="cp-prefs__content">
        <section className="cp-prefs__group" aria-label={words.bots}>
          <div className="cp-connections__title">
            <h4 className="cp-prefs__group-title">{bots.length ? words.bots : BRAND_NAMES.telegram}</h4>
            {bots.length > 0 && !adding && <button type="button" className="cp-button" data-size="small" onClick={() => setAdding(true)}><PlusIcon />{words.add}</button>}
          </div>
          {!bots.length && <p className="cp-trigger__note">{words.intro}</p>}
          {(adding || !bots.length) && <AddBot first={!bots.length} done={() => setAdding(false)} />}
          {bots.map((bot) => <BotCard key={bot.id} bot={bot} />)}
        </section>
        <section className="cp-prefs__group" aria-label={words.soon}>
          <h4 className="cp-prefs__group-title">{words.soon}</h4>
          <div className="cp-connections__soon">
            {SOON_MESSENGERS.map((brand) => <span key={brand}><BrandIcon brand={brand} />{BRAND_NAMES[brand]}</span>)}
          </div>
        </section>
      </div>
    </>
  );
}

/** How to make a bot with @BotFather (open the first time, folded after), and where to paste its token. */
function AddBot({ first, done }: { first: boolean; done: () => void }) {
  const saveMessenger = useSessions((s) => s.saveMessenger);
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const words = t.automata.connections;
  const add = () => {
    const parsed = parseMessengerInput({ name, token, allSessions: false, model: '' }, true);
    if ('error' in parsed) return setProblem(words.errors[parsed.error]);
    if (!saveMessenger(null, parsed.input)) return setProblem(t.settings.noServer);
    done();
  };
  return (
    <form className="cp-prefs__card cp-connections__add" aria-label={words.addTelegram} onSubmit={(e) => { e.preventDefault(); add(); }}>
      <div className="cp-connections__add-head"><BrandIcon brand="telegram" /><strong>{words.addTelegram}</strong></div>
      <details className="cp-connections__guide" open={first}>
        <summary>{words.guide}</summary>
        <ol>
          <li>{words.steps[0]} <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">{words.openFather}</a></li>
          <li>{words.steps[1]}</li>
          <li>{words.steps[2]}</li>
        </ol>
      </details>
      <Row id="bot-token" wide icon={<KeyIcon />} title={words.token} hint={words.tokenHint}>
        <input type="password" value={token} placeholder={words.tokenPlaceholder} aria-label={words.token} autoComplete="off" spellCheck={false} data-autofocus onChange={(e) => { setToken(e.target.value); setProblem(null); }} />
      </Row>
      <Row id="bot-name" icon={<TagIcon />} title={words.name} hint={words.nameHint}>
        <input value={name} maxLength={40} placeholder={words.namePlaceholder} aria-label={words.name} onChange={(e) => setName(e.target.value)} />
      </Row>
      {problem && <p className="cp-trigger__error" role="alert">{problem}</p>}
      <div className="cp-connections__actions">
        {!first && <button type="button" className="cp-button" onClick={done}>{words.cancel}</button>}
        <button type="submit" className="cp-button" data-variant="primary" disabled={!token.trim()}>{words.save}</button>
      </div>
    </form>
  );
}

/** A bot: what is left to do or that it works, its settings, and its deletion (confirmed first). */
function BotCard({ bot }: { bot: Messenger }) {
  const { saveMessenger, deleteMessenger, send } = useSessions.getState();
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(bot.name);
  const words = t.automata.connections;
  const change = (next: Partial<Pick<Messenger, 'name' | 'allSessions' | 'model'>> & { token?: string }) => saveMessenger(bot.id, { name: bot.name, allSessions: bot.allSessions, model: bot.model, ...next });
  return (
    <div className="cp-prefs__card cp-connections__bot">
      <div className="cp-connections__bot-head">
        <BrandIcon brand={bot.kind} />
        <div><strong>{bot.name}</strong>{bot.username && <small>@{bot.username}</small>}</div>
        <span className="cp-connections__state" data-state={bot.problem ? 'problem' : bot.linked ? 'linked' : 'waiting'}>{bot.problem ? words.problem : bot.linked ? words.linked : words.waiting}</span>
      </div>
      {bot.problem === 'token' ? <ReplaceToken bot={bot} replace={(token) => change({ token })} />
        : bot.problem ? <p className="cp-trigger__error" role="alert">{words.problems[bot.problem]}</p>
        : !bot.linked && bot.linkCode ? <LinkPhone bot={bot} code={bot.linkCode} />
        : bot.linked && (
          <div className="cp-connections__step" data-state="linked">
            <p>{words.linkedText}</p>
            <div className="cp-connections__actions">
              <button type="button" className="cp-button" data-size="small" onClick={() => send({ t: 'relinkMessenger', id: bot.id })}>{words.relink}</button>
              <button type="button" className="cp-button" data-size="small" data-variant="primary" onClick={() => send({ t: 'testMessenger', id: bot.id })}><MessageIcon />{words.test}</button>
            </div>
          </div>
        )}
      <Row id={`bot-${bot.id}-name`} icon={<TagIcon />} title={words.name}>
        <input value={name} maxLength={40} aria-label={words.name} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name.trim() && name.trim() !== bot.name) change({ name: name.trim() }); }} />
      </Row>
      <Row id={`bot-${bot.id}-all`} icon={<CrewIcon />} title={words.allSessions} hint={words.allSessionsHint}>
        <Switch checked={bot.allSessions} label={words.allSessions} onChange={(allSessions) => change({ allSessions })} />
      </Row>
      <Row id={`bot-${bot.id}-model`} icon={<AgentIcon />} title={words.model} hint={words.modelHint}>
        <select value={bot.model || MESSENGER_MODEL} aria-label={words.model} onChange={(e) => change({ model: e.target.value })}>
          {AGENT_MODELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </Row>
      {confirming ? (
        <div className="cp-connections__confirm" role="alertdialog" aria-label={words.confirmTitle(bot.name)}>
          <strong>{words.confirmTitle(bot.name)}</strong>
          <p>{words.confirm}</p>
          <div className="cp-connections__actions">
            <button type="button" className="cp-button" data-autofocus onClick={() => setConfirming(false)}>{words.cancel}</button>
            <button type="button" className="cp-button" data-variant="danger" onClick={() => deleteMessenger(bot.id)}><RemoveIcon />{words.confirmRemove}</button>
          </div>
        </div>
      ) : (
        <div className="cp-connections__actions">
          <button type="button" className="cp-button" data-size="small" data-variant="quiet" data-tone="danger" onClick={() => setConfirming(true)}><RemoveIcon />{words.remove}</button>
        </div>
      )}
    </div>
  );
}

/** The last step: one tap on Telegram's link to the bot sends it the code; the code by hand otherwise. */
function LinkPhone({ bot, code }: { bot: Messenger; code: string }) {
  const words = t.automata.connections;
  return (
    <div className="cp-connections__step" data-state="waiting">
      <strong>{words.linkTitle}</strong>
      <p>{words.linkText}</p>
      {bot.username && <a className="cp-button" data-variant="primary" href={`https://t.me/${bot.username}?start=${code}`} target="_blank" rel="noreferrer"><ExternalLinkIcon />{words.open(bot.username)}</a>}
      <details className="cp-connections__guide">
        <summary>{words.byHand}</summary>
        <p>{words.byHandText(bot.username)}</p>
        <Copyable text={`/start ${code}`} />
      </details>
    </div>
  );
}

/** Telegram refuses the token: a new one, pasted in place. */
function ReplaceToken({ bot, replace }: { bot: Messenger; replace: (token: string) => void }) {
  const [token, setToken] = useState('');
  const [wrong, setWrong] = useState(false);
  const words = t.automata.connections;
  const submit = () => {
    const parsed = parseMessengerInput({ name: bot.name, token, allSessions: bot.allSessions, model: bot.model }, true);
    if ('error' in parsed) return setWrong(true);
    replace(token.trim());
    setToken('');
  };
  return (
    <form className="cp-connections__step" data-state="problem" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <strong>{words.problems.token}</strong>
      <div className="cp-connections__replace">
        <input type="password" value={token} placeholder={words.tokenPlaceholder} aria-label={words.replaceToken} aria-invalid={wrong} autoComplete="off" spellCheck={false} onChange={(e) => { setToken(e.target.value); setWrong(false); }} />
        <button type="submit" className="cp-button" data-variant="primary" disabled={!token.trim()}>{words.replace}</button>
      </div>
      {wrong && <p className="cp-trigger__error" role="alert">{words.errors.token}</p>}
    </form>
  );
}
