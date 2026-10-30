import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { browserLanes, drivesBrowser, floatsOutOfSight, isBrowserTool, launchedByLooking, modifiersOf, pictureFraction, shownLane, testersAtWork } from './browser.ts';
import { SHARED_LANE } from '../../shared/browser.ts';

describe('the picture of a session’s browser', () => {
  const box = { left: 100, top: 50, width: 800, height: 600 };
  const page = { width: 1280, height: 800 };

  it('finds the point of the page under the pointer, the picture centred in its box', () => {
    // 800 wide: the picture is 800 × 500, with 50 px bands above and under it
    assert.deepEqual(pictureFraction(box, page, { x: 500, y: 350 }), { x: 0.5, y: 0.5 });
    assert.deepEqual(pictureFraction(box, page, { x: 100, y: 100 }), { x: 0, y: 0 });
  });

  it('finds nothing over a band, nor before the first picture', () => {
    assert.equal(pictureFraction(box, page, { x: 500, y: 60 }), null);
    assert.equal(pictureFraction(box, { width: 0, height: 0 }, { x: 500, y: 350 }), null);
  });

  it('knows the tools of a Playwright server, whatever its name', () => {
    assert.equal(isBrowserTool('mcp__playwright__browser_click'), true);
    assert.equal(isBrowserTool('mcp__web__browser_navigate'), true);
    assert.equal(isBrowserTool('Bash'), false);
    assert.equal(isBrowserTool('mcp__posthog__exec'), false);
  });

  it('sums the modifier keys as CDP counts them', () => {
    assert.equal(modifiersOf({ altKey: false, ctrlKey: false, metaKey: true, shiftKey: true }), 12);
  });
});

describe('whether a session drives its browser', () => {
  const tool = (id: number, name: string, agent: string | null = null) => ({ id, kind: 'tool' as const, at: id, tool: name, detail: '', author: null, agent, ok: true, callId: String(id) });
  const turn = (id: number) => ({ id, kind: 'turn' as const, at: id, ok: true, stopped: false, ms: 1, startId: 0 });

  it('says so from its last tool of the turn, even between two calls', () => {
    assert.equal(drivesBrowser([tool(1, 'Bash'), tool(2, 'mcp__playwright__browser_click')]), true);
    assert.equal(drivesBrowser([tool(1, 'mcp__playwright__browser_click'), tool(2, 'Edit')]), false);
  });

  it('not once the turn is over, nor for a sub-agent’s tools', () => {
    assert.equal(drivesBrowser([tool(1, 'mcp__playwright__browser_click'), turn(2)]), false);
    assert.equal(drivesBrowser([tool(1, 'Bash'), tool(2, 'mcp__playwright__browser_click', 'agent-1')]), false);
  });
});

describe('the testers of a session', () => {
  it('are named after the sub-agent at work in each lane', () => {
    assert.deepEqual(testersAtWork([
      { id: 'a', name: 'Inès', type: 'browser-tester-2' },
      { id: 'b', name: 'Tom', type: 'Explore' },
      { id: 'c', name: 'Léa', type: 'browser-tester-1' },
    ]), { 1: 'Léa', 2: 'Inès' });
  });
});

describe('the browsers of a session to pick from', () => {
  it('offers its own, its testers’ running, then the shared browser, always', () => {
    assert.deepEqual(browserLanes([2, 0], true), [0, 2, SHARED_LANE]);
    assert.deepEqual(browserLanes([SHARED_LANE, 1], true), [0, 1, SHARED_LANE]);
    assert.deepEqual(browserLanes([2, 0], false), [0, 2]);
  });

  it('shows the shared browser when picked even before it runs, a tester’s only while it runs', () => {
    assert.equal(shownLane(SHARED_LANE, [0], true), SHARED_LANE);
    assert.equal(shownLane(SHARED_LANE, [0], false), 0);
    assert.equal(shownLane(3, [0], true), 0);
    assert.equal(shownLane(3, [0, 3], true), 3);
    assert.equal(shownLane(0, [2], true), 2);
  });

  it('starts the session’s own browser and the shared one when looked at, never a tester’s', () => {
    assert.equal(launchedByLooking(0), true);
    assert.equal(launchedByLooking(SHARED_LANE), true);
    assert.equal(launchedByLooking(2), false);
  });
});

describe('a browser at work out of sight', () => {
  it('floats over the office for a tester only, not for the session’s own nor the shared one', () => {
    assert.equal(floatsOutOfSight(2), true);
    assert.equal(floatsOutOfSight(0), false);
    assert.equal(floatsOutOfSight(SHARED_LANE), false);
  });
});
