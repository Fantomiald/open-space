import type { KeyboardEvent } from 'react';
import type { Look } from '../../shared/look.ts';
import { t } from '../i18n/index.ts';
import { MODIFIER } from '../lib/platform.ts';
import { ShowcaseArt } from './ShowcaseArt.tsx';

/** The features the tour shows, in its order: what the room is, then what a newcomer would not find alone. */
export const SLIDES = ['room', 'parallel', 'automata', 'mods', 'browser', 'layout'] as const;
export type Slide = (typeof SLIDES)[number];
/** The onboarding's welcome already draws the room: its tour starts with the rest. */
export const ONBOARDING_SLIDES = SLIDES.filter((slide) => slide !== 'room');

/**
 * One feature at a time: its drawing beside a title and a sentence, and the dots to jump to another. The buttons to
 * move on belong to who shows it (the onboarding's own, or the dialog's), so the arrow keys move it too.
 */
export function Tour({ index, onIndex, look, inDialog = false, slides = SLIDES }: { index: number; onIndex: (index: number) => void; look?: Look; inDialog?: boolean; slides?: readonly Slide[] }) {
  const Heading = inDialog ? 'h2' : 'h1';
  const words = t.showcase.tour;
  const id = slides[index];
  const slide = words.slides[id];
  const text = typeof slide.text === 'function' ? slide.text(MODIFIER) : slide.text;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' && index < slides.length - 1) { e.preventDefault(); onIndex(index + 1); }
    if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); onIndex(index - 1); }
  };
  return (
    <section className="cp-tour" aria-roledescription="carousel" aria-label={words.label} onKeyDown={onKey}>
      <div key={id} className="cp-tour__slide" role="group" aria-roledescription="slide" aria-label={words.slide(index + 1, slides.length)}>
        <ShowcaseArt art={id} look={look} />
        <div className="cp-tour__text" aria-live="polite">
          <p className="cp-tour__kicker">{slide.kicker}</p>
          <Heading id={inDialog ? undefined : 'onboarding-title'}>{slide.title}</Heading>
          <p>{text}</p>
        </div>
      </div>
      <div className="cp-tour__dots">
        {slides.map((slideId, at) => (
          <button key={slideId} type="button" aria-label={words.goTo(at + 1)} aria-current={at === index ? 'step' : undefined} onClick={() => onIndex(at)} />
        ))}
      </div>
    </section>
  );
}
