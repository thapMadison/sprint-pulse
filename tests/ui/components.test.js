// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderTopbar } from '../../src/ui/components/topbar.js';
import { renderViewTabs } from '../../src/ui/components/view-tabs.js';
import { renderSprintFilter } from '../../src/ui/components/sprint-filter.js';
import { renderEpicFilterBar } from '../../src/ui/components/epic-filter-bar.js';
import { renderWorkloadTable } from '../../src/ui/components/workload-table.js';
import { renderEpicTasksTable } from '../../src/ui/components/epic-tasks-table.js';
import { renderEpicDetailPanel } from '../../src/ui/components/epic-detail-panel.js';
import { renderEpicRoadmap } from '../../src/charts/epic-roadmap.js';
import { renderProgressOverlay } from '../../src/ui/components/progress-overlay.js';
import { buildLightweightEpics } from '../../src/domain/epic-builder.js';
import { DEFAULT_EPIC_FILTERS } from '../../src/app/state.js';
import { DEMO_SPRINTS, DEMO_EPICS, DEMO_TODAY } from '../../src/data/demo.js';

const noop = () => {};
const activeSprint = DEMO_SPRINTS.find((s) => s.state === 'active');
const epics = buildLightweightEpics(DEMO_SPRINTS, DEMO_EPICS, DEMO_TODAY);
const realEpic = epics.find((e) => !e.isNoEpic);

describe('UI components (golden master DOM)', () => {
  it('renderTopbar (logged out)', () => {
    const node = renderTopbar({
      today: DEMO_TODAY, sourceLabel: 'Demo · synced', user: null,
      onLogin: noop, onLogout: noop,
    });
    expect(node.outerHTML).toMatchSnapshot();
  });

  it('renderViewTabs', () => {
    expect(renderViewTabs({ active: 'sprint', onChange: noop }).outerHTML).toMatchSnapshot();
  });

  it('renderSprintFilter', () => {
    const node = renderSprintFilter({ sprints: DEMO_SPRINTS, activeId: 'sp-24', onChange: noop });
    expect(node.outerHTML).toMatchSnapshot();
  });

  it('renderEpicFilterBar', () => {
    const node = renderEpicFilterBar({
      filters: { ...DEFAULT_EPIC_FILTERS }, sprints: DEMO_SPRINTS,
      totalEpics: epics.length, visibleEpics: epics.length,
      onStatusChange: noop, onSprintChange: noop, onSearchInput: noop, onClearAll: noop,
    });
    expect(node.outerHTML).toMatchSnapshot();
  });

  it('renderWorkloadTable', () => {
    expect(renderWorkloadTable({ sprint: activeSprint }).outerHTML).toMatchSnapshot();
  });

  it('renderEpicTasksTable', () => {
    expect(renderEpicTasksTable({ epic: realEpic }).outerHTML).toMatchSnapshot();
  });

  it('renderEpicDetailPanel', () => {
    expect(renderEpicDetailPanel({ epic: realEpic, today: DEMO_TODAY, onClose: noop }).outerHTML).toMatchSnapshot();
  });

  it('renderEpicRoadmap (collapsed)', () => {
    const node = renderEpicRoadmap({
      epics, sprints: DEMO_SPRINTS, today: DEMO_TODAY,
      expandedIds: new Set(), filters: { ...DEFAULT_EPIC_FILTERS },
      onToggleExpand: noop, onOpenDetail: noop,
    });
    expect(node.outerHTML).toMatchSnapshot();
  });

  it('renderEpicRoadmap (one epic expanded)', () => {
    const node = renderEpicRoadmap({
      epics, sprints: DEMO_SPRINTS, today: DEMO_TODAY,
      expandedIds: new Set([realEpic.id]), filters: { ...DEFAULT_EPIC_FILTERS },
      onToggleExpand: noop, onOpenDetail: noop,
    });
    expect(node.outerHTML).toMatchSnapshot();
  });

  it('renderProgressOverlay (api flow, mid-fetch)', () => {
    const node = renderProgressOverlay({
      progress: { step: 'fetch', label: 'Pulling sprint data…', percent: 55, flow: 'api' },
    });
    expect(node.outerHTML).toMatchSnapshot();
  });

  it('renderProgressOverlay returns null without progress', () => {
    expect(renderProgressOverlay({ progress: null })).toBeNull();
  });
});
