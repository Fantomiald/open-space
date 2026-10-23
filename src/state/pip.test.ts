import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fitPip, PIP_HEAD, PIP_MARGIN, placePip, resizePip, wentToPage } from './pip.ts';

const screen = { width: 1600, height: 1000 };
/** the page's height per pixel of width, title bar aside */
const proportion = (box: { width: number; height: number }) => (box.height - PIP_HEAD) / box.width;

describe('the floating browser', () => {
  it('opens at the top left, under the header, its page without bands', () => {
    const box = fitPip(null, 'desktop', screen);
    assert.equal(box.width, 480);
    assert.equal(box.height, 270 + PIP_HEAD);
    assert.deepEqual([box.left, box.top], [PIP_MARGIN, 72]);
  });

  it('turns into a phone in the corner it was in, tall enough to read', () => {
    const desktop = { left: PIP_MARGIN, top: PIP_MARGIN, width: 480, height: 306 };
    const phone = fitPip(desktop, 'mobile', screen);
    assert.equal(phone.height, 680);
    assert.ok(Math.abs(proportion(phone) - 844 / 390) < 0.01);
    assert.deepEqual([phone.left, phone.top], [PIP_MARGIN, PIP_MARGIN]);
  });

  it('is never taller than the window', () => {
    const phone = fitPip(null, 'mobile', { width: 800, height: 400 });
    assert.ok(phone.height <= 400 - 2 * PIP_MARGIN);
  });

  it('keeps its title bar within the window and sticks to an edge brought near', () => {
    assert.deepEqual(placePip({ left: -300, top: 5000, width: 480, height: 306 }, screen), { left: PIP_MARGIN, top: screen.height - PIP_MARGIN - 306, width: 480, height: 306 });
    assert.equal(placePip({ left: 25, top: 300, width: 480, height: 306 }, screen).left, PIP_MARGIN);
    assert.equal(placePip({ left: 60, top: 300, width: 480, height: 306 }, screen).left, 60);
  });

  it('keeps the page’s proportions when pulled, its opposite corner in place', () => {
    const start = { left: 1000, top: 600, width: 480, height: 306 };
    const bigger = resizePip(start, 'nw', -160, 0, 'desktop', screen);
    assert.equal(bigger.width, 640);
    assert.equal(bigger.height, 360 + PIP_HEAD);
    assert.deepEqual([bigger.left + bigger.width, bigger.top + bigger.height], [start.left + start.width, start.top + start.height]);
    const taller = resizePip(start, 's', 0, 90, 'desktop', screen);
    assert.equal(taller.height, start.height + 90);
    assert.equal(taller.top, start.top);
  });

  it('floats a browser that goes to a page, not one that opens blank or stays where it is', () => {
    const at = (url: string) => ({ tabs: [{ id: 't', url, title: '' }], active: 't', format: 'desktop' as const });
    assert.equal(wentToPage(undefined, at('about:blank')), false);
    assert.equal(wentToPage(at('about:blank'), at('http://localhost:3000/')), true);
    assert.equal(wentToPage(at('http://localhost:3000/'), at('http://localhost:3000/')), false);
    assert.equal(wentToPage(at('http://localhost:3000/'), null), false);
  });

  it('is no smaller than a page one can still make out', () => {
    assert.equal(resizePip({ left: 100, top: 100, width: 480, height: 306 }, 'e', -1000, 0, 'desktop', screen).width, 240);
  });
});
