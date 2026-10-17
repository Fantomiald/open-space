import { useMemo, useState } from 'react';
import { folderName, homeRelative } from '../lib/format.ts';
import { buildFeed } from '../state/feed.ts';
import { isRunning } from '../state/labels.ts';
import { attentionKind } from '../state/queue.ts';
import { useSessions } from '../state/sessions.ts';
import { DropOverlay } from './Attachments.tsx';
import { AsidePanel } from './AsidePanel.tsx';
import { Composer } from './Composer.tsx';
import { Feed } from './Feed.tsx';
import { CloseIcon, PauseIcon, PencilIcon, PowerIcon, RestIcon, SearchIcon, TagIcon } from './Icons.tsx';
import { Modal } from './Modal.tsx';
import { PermissionPrompt } from './PermissionPrompt.tsx';
import { QuestionPrompt } from './QuestionPrompt.tsx';
import { StateBadge } from './StateBadge.tsx';
import { useAttachments } from './useAttachments.ts';

const NO_EVENTS: never[] = [];
const NO_DRAFTS: Readonly<Record<string, string>> = {};

export function Detail() {
  const selectedId = useSessions((s) => s.selectedId);
  const session = useSessions((s) => (s.selectedId ? s.sessions[s.selectedId] : undefined));
  const events = useSessions((s) => (s.selectedId ? s.logs[s.selectedId] : undefined)) ?? NO_EVENTS;
  const loaded = useSessions((s) => (s.selectedId ? s.logLoaded[s.selectedId] === true : false));
  const drafts = useSessions((s) => (s.selectedId ? s.partials[s.selectedId] : undefined)) ?? NO_DRAFTS;
  const send = useSessions((s) => s.send);
  const select = useSessions((s) => s.select);
  const searchOpen = useSessions((s) => s.searchOpen);
  const openSearch = useSessions((s) => s.openSearch);
  const seen = useSessions((s) => s.seen);
  const feed = useMemo(() => buildFeed(events), [events]);
  const [editing, setEditing] = useState<'name' | 'tag' | null>(null);
  const [switchingOff, setSwitchingOff] = useState(false);
  // the pictures of the next message: dropped anywhere on the panel, pasted or picked in the composer (App keys the
  // panel by session, so another session starts without them)
  const attachments = useAttachments();
  if (!selectedId || !session) return null;

  const model = session.activeModel || session.model || 'modèle par défaut';
  const [first, ...others] = session.permissions;
  /** The name or the tag, edited in place: Enter saves, Escape or leaving the field cancels. */
  const field = (kind: 'name' | 'tag') => (
    <form className="cp-detail__edit" onSubmit={(e) => {
      e.preventDefault();
      const value = String(new FormData(e.currentTarget).get('value') ?? '').trim();
      if (kind === 'name' && value) send({ t: 'rename', sessionId: session.id, name: value });
      if (kind === 'tag') send({ t: 'tag', sessionId: session.id, tag: value });
      setEditing(null);
    }}>
      <label className="cp-sr-only" htmlFor={`${kind}-field`}>{kind === 'name' ? 'Nouveau prénom' : 'Tag de la session'}</label>
      <input
        id={`${kind}-field`} name="value" defaultValue={kind === 'name' ? session.name : session.tag ?? ''} maxLength={kind === 'name' ? 40 : 24} autoFocus
        placeholder={kind === 'tag' ? 'urgent, perso, Jarvis…' : undefined}
        onBlur={() => setEditing(null)} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); } }}
      />
    </form>
  );

  return (
    <aside className="cp-detail" aria-label={`Session ${session.name}`} {...attachments.dropTarget}>
      <DropOverlay attachments={attachments} />
      <header className="cp-detail__head">
        <div className="cp-detail__title">
          {editing === 'name' ? field('name') : (
            <h2>
              {session.name}
              <button type="button" className="cp-icon-button" data-size="small" aria-label={`Renommer ${session.name}`} title="Renommer" onClick={() => setEditing('name')}><PencilIcon /></button>
            </h2>
          )}
          <StateBadge session={session} kind={attentionKind(session, seen)} />
          <div className="cp-detail__controls">
            <button type="button" className="cp-icon-button" data-variant="outlined" aria-label="Chercher dans la conversation" aria-pressed={searchOpen} title="Chercher dans la conversation (Cmd F)" onClick={() => openSearch(!searchOpen)}><SearchIcon /></button>
            {isRunning(session) && (
              <button type="button" className="cp-icon-button" data-variant="outlined" aria-label="Interrompre" title="Interrompre ce qu’elle fait (la session reste ouverte)" disabled={session.state === 'starting'} onClick={() => send({ t: 'interrupt', sessionId: session.id })}><PauseIcon /></button>
            )}
            {!session.resting && (
              <button type="button" className="cp-icon-button" data-variant="outlined" aria-label="Repos" title="En salle de repos : Claude Code s’arrête, un message la rappelle" onClick={() => send({ t: 'rest', sessionId: session.id })}><RestIcon /></button>
            )}
            <button type="button" className="cp-icon-button" data-variant="outlined" aria-label="Éteindre" title="Éteindre : elle disparaît d’Open Space" onClick={() => setSwitchingOff(true)}><PowerIcon /></button>
            <button type="button" className="cp-icon-button" data-variant="outlined" aria-label="Masquer le panneau" title="Masquer ce panneau, la session continue" onClick={() => select(null)}><CloseIcon /></button>
          </div>
        </div>
        <div className="cp-detail__line">
          {editing === 'tag' ? field('tag') : session.tag
            ? <button type="button" className="cp-tag" title="Changer le tag (vide pour l’enlever)" onClick={() => setEditing('tag')}><TagIcon />{session.tag}</button>
            : <button type="button" className="cp-tag" data-empty="true" onClick={() => setEditing('tag')}><TagIcon />Ajouter un tag</button>}
          <p className="cp-detail__meta" title={session.cwd}>
            {folderName(session.cwd)} <span className="cp-muted">({homeRelative(session.cwd)})</span> · {model}
            {session.untrusted && <span className="cp-detail__untrusted" title="Ce dossier n’a pas été approuvé : ses hooks et ses serveurs MCP ne démarrent pas"> · sans les réglages du dossier</span>}
          </p>
        </div>
        {switchingOff && (
          <Modal title={`Éteindre ${session.name} ?`} onClose={() => setSwitchingOff(false)}>
            <p className="cp-muted">Elle disparaît d’Open Space, avec son fil. La conversation de Claude Code reste sur ton disque : tu peux la reprendre depuis « Reprendre ».</p>
            <div className="cp-form__actions">
              <button type="button" className="cp-button" autoFocus onClick={() => setSwitchingOff(false)}>Annuler</button>
              <button type="button" className="cp-button" data-variant="danger" onClick={() => { send({ t: 'forget', sessionId: session.id }); setSwitchingOff(false); select(null); }}>Éteindre</button>
            </div>
          </Modal>
        )}
        {session.error && <p className="cp-detail__error" role="alert">{session.error}</p>}
      </header>
      {first && (first.questions
        ? <QuestionPrompt key={first.requestId} sessionId={session.id} prompt={first} />
        : <PermissionPrompt key={first.requestId} sessionId={session.id} prompt={first} more={others.length} />)}
      {feed.plan.length > 0 && (
        <details className="cp-plan">
          <summary>Plan ({feed.plan.filter((item) => item.status === 'completed').length}/{feed.plan.length})</summary>
          <ul>{feed.plan.map((item) => <li key={item.text} data-status={item.status}>{item.text}</li>)}</ul>
        </details>
      )}
      <Feed feed={feed} loading={!loaded} speaker={session.name} working={isRunning(session) && session.state !== 'perm'} drafts={drafts} />
      <AsidePanel session={session} />
      <Composer key={session.id} session={session} attachments={attachments} />
    </aside>
  );
}
