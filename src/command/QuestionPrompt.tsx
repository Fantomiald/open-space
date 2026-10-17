import { useRef, useState, type KeyboardEvent } from 'react';
import type { PermissionPrompt, Question } from '../../shared/protocol.ts';
import { t } from '../i18n/index.ts';
import { questionAnswers } from '../state/questions.ts';
import { useSessions } from '../state/sessions.ts';
import { useAnswerButtons } from './useAnswerButtons.ts';

/** How long a picked choice stays in view before the next question comes. */
const ADVANCE_MS = 220;

/**
 * The questions of an AskUserQuestion call, one at a time as in Claude Code: a tab per question and a last one to send
 * them, Previous and Next (or the arrow keys) in between. Picking the one choice of a question goes on to the next;
 * a question with several choices, or a free answer, goes on with Next. Mount with `key={prompt.requestId}`.
 */
export function QuestionPrompt({ sessionId, prompt }: { sessionId: string; prompt: PermissionPrompt }) {
  const answerQuestions = useSessions((s) => s.answerQuestions);
  const buttons = useAnswerButtons();
  const questions = prompt.questions ?? [];
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const advancing = useRef<number | undefined>(undefined);
  const answers = questionAnswers(questions, chosen, other);
  const missing = questions.filter(({ question }) => !answers[question]).length;
  // with several questions, the step after the last one is the summary, where they are sent
  const many = questions.length > 1;
  const last = many ? questions.length : 0;
  const current = questions[step];

  const go = (to: number) => { window.clearTimeout(advancing.current); setStep(Math.max(0, Math.min(last, to))); };
  const send = () => { if (!missing) buttons.sent(answerQuestions(sessionId, prompt.requestId, answers)); };

  const pick = (index: number, { question, multiSelect }: Question, label: string) => {
    const picked = chosen[question] ?? [];
    const next = multiSelect ? (picked.includes(label) ? picked.filter((item) => item !== label) : [...picked, label]) : [label];
    setChosen({ ...chosen, [question]: next });
    if (multiSelect) return;
    setOther({ ...other, [question]: '' });
    if (many) {
      window.clearTimeout(advancing.current);
      advancing.current = window.setTimeout(() => setStep(Math.min(last, index + 1)), ADVANCE_MS);
    }
  };
  const write = ({ question, multiSelect }: Question, text: string) => {
    setOther({ ...other, [question]: text });
    if (!multiSelect && text.trim()) setChosen({ ...chosen, [question]: [] });
  };

  // the arrows move between questions, except while a free answer is being typed
  const onKeyDown = (event: KeyboardEvent) => {
    if (!many || event.target instanceof HTMLInputElement) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); go(step + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); go(step - 1); }
  };

  const words = t.composer.question;
  return (
    <form className="cp-question" aria-label={words.formLabel} onKeyDown={onKeyDown} onSubmit={(e) => { e.preventDefault(); if (current && many) go(step + 1); else send(); }}>
      {many && (
        <div className="cp-question__tabs" role="tablist" aria-label={words.tabs}>
          {questions.map((item, index) => (
            <button
              key={item.question} type="button" role="tab" aria-selected={index === step} data-answered={Boolean(answers[item.question])}
              className="cp-question__tab" onClick={() => go(index)}
            >
              <span className="cp-question__check" aria-hidden="true" />
              {item.header || words.numbered(index + 1)}
            </button>
          ))}
          <button type="button" role="tab" aria-selected={step === last} className="cp-question__tab" data-send="true" onClick={() => go(last)}>{words.send}</button>
        </div>
      )}

      {current ? (
        <QuestionStep
          key={current.question} item={current} picked={chosen[current.question] ?? []} written={other[current.question] ?? ''}
          onPick={(label) => pick(step, current, label)} onWrite={(text) => write(current, text)}
        />
      ) : (
        <div className="cp-question__summary" role="tabpanel" aria-label={words.summary}>
          <p className="cp-question__text">{words.summary}</p>
          <ul>
            {questions.map((item, index) => (
              <li key={item.question}>
                <button type="button" className="cp-question__recap" data-missing={!answers[item.question]} onClick={() => go(index)}>
                  <span className="cp-question__topic">{item.header || words.numbered(index + 1)}</span>
                  <span>{answers[item.question] || words.unanswered}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="cp-question__foot">
        {many && <button type="button" className="cp-button" disabled={step === 0} onClick={() => go(step - 1)}>{words.previous}</button>}
        <span className="cp-question__status" aria-live="polite">
          {current && many ? words.stepOf(step + 1, questions.length) : missing === 0 ? words.ready : many ? words.stillMissing(missing) : words.pickOne}
        </span>
        {current && many
          ? <button type="submit" className="cp-button" data-variant={answers[current.question] ? 'primary' : undefined}>{words.next}</button>
          : <button type="submit" className="cp-button" data-variant="primary" disabled={missing > 0 || buttons.disabled}>{many ? words.sendAnswers : words.answer}</button>}
      </div>
    </form>
  );
}

/** One question: its text, its choices (one, or several), and a free answer at the end of the list. */
function QuestionStep({ item, picked, written, onPick, onWrite }: {
  item: Question; picked: string[]; written: string; onPick: (label: string) => void; onWrite: (text: string) => void;
}) {
  const words = t.composer.question;
  return (
    <fieldset className="cp-question__item" role="tabpanel">
      <legend className="cp-sr-only">{item.header || words.question}</legend>
      <p className="cp-question__text">{item.question}</p>
      {item.multiSelect && <p className="cp-question__hint">{words.several}</p>}
      <div className="cp-question__options" data-multiple={item.multiSelect === true}>
        {item.options.map((option) => (
          <button key={option.label} type="button" className="cp-question__option" aria-pressed={picked.includes(option.label)} onClick={() => onPick(option.label)}>
            <span className="cp-question__mark" aria-hidden="true" />
            <span className="cp-question__label">{option.label}</span>
            {option.description && <span className="cp-question__description">{option.description}</span>}
          </button>
        ))}
        <label className="cp-question__other" data-filled={written.trim() !== ''}>
          <span className="cp-question__mark" aria-hidden="true" />
          <span className="cp-sr-only">{words.other}</span>
          <input value={written} onChange={(e) => onWrite(e.target.value)} placeholder={words.otherPlaceholder} />
        </label>
      </div>
    </fieldset>
  );
}
