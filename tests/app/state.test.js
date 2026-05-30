import { describe, it, expect, beforeEach } from 'vitest';
import {
  getState,
  setState,
  setStateSilent,
  subscribe,
  setEpicViewState,
  subscribeEpicView,
  setSprintViewState,
  subscribeSprintView,
  activeSprint,
  activeEpic,
} from '../../src/app/state.js';

describe('main channel', () => {
  it('patches state and notifies subscribers', () => {
    let seen = null;
    const off = subscribe((s) => { seen = s.error; });
    setState({ error: 'boom' });
    expect(getState().error).toBe('boom');
    expect(seen).toBe('boom');
    off();
    setState({ error: null });
    expect(seen).toBe('boom'); // no longer notified after unsubscribe
  });
});

describe('setStateSilent', () => {
  it('patches without notifying', () => {
    let notified = false;
    const off = subscribe(() => { notified = true; });
    setStateSilent({ pendingBoardId: 'XYZ' });
    expect(getState().pendingBoardId).toBe('XYZ');
    expect(notified).toBe(false);
    off();
  });
});

describe('channel isolation', () => {
  beforeEach(() => {
    setStateSilent({ error: null });
  });

  it('epic-view channel does not notify main subscribers', () => {
    let mainCalls = 0;
    let epicCalls = 0;
    const offMain = subscribe(() => { mainCalls++; });
    const offEpic = subscribeEpicView(() => { epicCalls++; });
    setEpicViewState({ activeEpicId: 'EPIC-1' });
    expect(epicCalls).toBe(1);
    expect(mainCalls).toBe(0);
    offMain();
    offEpic();
  });

  it('sprint-view channel notifies its own subscribers only', () => {
    let sprintCalls = 0;
    const off = subscribeSprintView(() => { sprintCalls++; });
    setSprintViewState({ activeSprintId: 'sp-23' });
    expect(sprintCalls).toBe(1);
    off();
  });
});

describe('selectors', () => {
  it('activeSprint resolves by id and falls back to first', () => {
    setStateSilent({
      sprints: [{ id: 'a' }, { id: 'b' }],
      activeSprintId: 'b',
    });
    expect(activeSprint().id).toBe('b');
    setStateSilent({ activeSprintId: 'missing' });
    expect(activeSprint().id).toBe('a');
  });

  it('activeEpic resolves by id and falls back to first', () => {
    setStateSilent({
      epics: [{ id: 'e1' }, { id: 'e2' }],
      activeEpicId: 'e2',
    });
    expect(activeEpic().id).toBe('e2');
    setStateSilent({ activeEpicId: null });
    expect(activeEpic().id).toBe('e1');
  });
});
