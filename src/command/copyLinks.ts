import type { ClipboardEvent } from 'react';
import { type CopiedLink, withLinks } from '../lib/links.ts';

/** The links of rendered Markdown (Prose); the app's own buttons and downloads are not copied as links. */
const PROSE_LINKS = '.cp-prose a[href]';

/** The part of `node` that `range` takes in: all of it, or what is left once the range cut it. */
function takenOf(range: Range, node: Node): Range {
  const taken = document.createRange();
  taken.selectNodeContents(node);
  if (range.compareBoundaryPoints(Range.START_TO_START, taken) > 0) taken.setStart(range.startContainer, range.startOffset);
  if (range.compareBoundaryPoints(Range.END_TO_END, taken) < 0) taken.setEnd(range.endContainer, range.endOffset);
  return taken;
}

/** The Prose links a range takes in, in the page's order, each with the text between it and the previous one. */
function linksIn(range: Range): CopiedLink[] {
  const around = range.commonAncestorContainer;
  const element = around instanceof Element ? around : around.parentElement;
  if (!element) return [];
  const inside = element.closest<HTMLAnchorElement>(PROSE_LINKS);
  const anchors = inside ? [inside] : [...element.querySelectorAll<HTMLAnchorElement>(PROSE_LINKS)].filter((anchor) => range.intersectsNode(anchor));
  const between = range.cloneRange();
  return anchors.map((anchor) => {
    const taken = takenOf(range, anchor);
    between.setEnd(taken.startContainer, taken.startOffset);
    const before = between.toString();
    between.setStart(taken.endContainer, taken.endOffset);
    return { text: taken.toString(), href: anchor.getAttribute('href') ?? '', label: anchor.textContent ?? '', before };
  });
}

const rangesOf = (selection: Selection) => Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index));

/** The selected text as the browser copies it (its line breaks), with the Prose links written `[text](address)`. */
export function selectedWithLinks(selection: Selection, plain = selection.toString()): string {
  return withLinks(plain, rangesOf(selection).flatMap(linksIn));
}

/**
 * Copying a selection that takes in links of a message: the plain text keeps their addresses as Markdown, and the
 * HTML (what a rich paste reads) is the selection's own markup, links included. The browser fills the clipboard only
 * when the copy is left to it, so both are written here; a selection without such a link is left to the browser.
 */
export function copyWithLinks(event: ClipboardEvent) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;
  const plain = selection.toString();
  const copied = selectedWithLinks(selection, plain);
  if (copied === plain) return;
  const html = document.createElement('div');
  for (const range of rangesOf(selection)) {
    // A selection inside one link clones only its text: the link is put back around it, or a rich paste loses it
    const around = range.commonAncestorContainer;
    const anchor = (around instanceof Element ? around : around.parentElement)?.closest(PROSE_LINKS);
    const wrapper = anchor ? anchor.cloneNode(false) : html;
    wrapper.appendChild(range.cloneContents());
    if (wrapper !== html) html.append(wrapper);
  }
  event.clipboardData.setData('text/plain', copied);
  event.clipboardData.setData('text/html', html.innerHTML);
  event.preventDefault();
}
