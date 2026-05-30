import { el } from '../ui/dom.js';
import { svg } from '../charts/svg.js';
import { generateDailySeries } from '../domain/series.js';

import { renderBackground } from '../ui/components/background.js';
import { renderTopbar } from '../ui/components/topbar.js';
import { renderDataSource } from '../ui/components/data-source-bar.js';
import { renderSprintFilter, updateSprintFilterActive } from '../ui/components/sprint-filter.js';
import { renderSprintHero } from '../ui/components/sprint-hero.js';
import { renderWorkloadTable } from '../ui/components/workload-table.js';
import { renderViewTabs } from '../ui/components/view-tabs.js';
import { renderEpicFilterBar } from '../ui/components/epic-filter-bar.js';
import { renderEpicDetailPanel } from '../ui/components/epic-detail-panel.js';
import { updateProgressOverlay } from '../ui/components/progress-overlay.js';
import { renderRefreshFAB, updateRefreshFAB } from '../ui/components/refresh-fab.js';
import { renderViewTabsFAB, updateViewTabsFAB } from '../ui/components/view-tabs-fab.js';

import { renderBurndown } from '../charts/burndown.js';
import { renderBurnup } from '../charts/burnup.js';
import { renderCFD } from '../charts/cfd.js';
import { renderControl } from '../charts/control.js';
import { renderDonut } from '../charts/donut.js';
import { renderEpicRoadmap } from '../charts/epic-roadmap.js';

import { getState, activeSprint, DEFAULT_EPIC_FILTERS } from './state.js';
import {
  login, logout, setActiveSprint, setView,
  toggleEpicExpanded, openEpicDetail, closeEpicDetail,
  setEpicFilter, setEpicSearchSilent,
} from './actions.js';

const CHART_TOOLTIPS = {
  burndown: {
    title: 'Burndown Chart',
    subtitle: 'Track remaining work against the ideal pace',
    accent: 'coral',
    sections: [
      {
        label: 'What it shows',
        body: 'The remaining effort (in hours) of all sprint issues, plotted day by day. The dashed line is the ideal pace — a straight drop from total scope to zero by sprint end.',
      },
      {
        label: 'How to read it',
        body: 'When the solid line stays above the dashed line, the team is behind. When it dips below, the team is ahead. A flat segment means no work was completed that day.',
      },
    ],
    tip: 'If your actual line ends well above zero, scope may have been too large or blockers slowed delivery. Use it to discuss capacity in retrospective.',
  },
  cfd: {
    title: 'Cumulative Flow Diagram',
    subtitle: 'See how work moves through stages',
    accent: 'amber',
    sections: [
      {
        label: 'What it shows',
        body: 'Stacked bands representing the number of issues in each status (To Do, In Progress, Done) over time. Total height equals total scope.',
      },
      {
        label: 'How to read it',
        body: 'Read the vertical thickness of each band as the count of issues in that status. The "Done" band growing means work is being completed. A flat "Done" band means delivery is stalled.',
      },
    ],
    tip: 'A widening "In Progress" band signals a bottleneck — too many things started, not enough finished. Encourage the team to focus on closing items before pulling new ones.',
  },
  burnup: {
    title: 'Burnup Chart',
    subtitle: 'Compare what is done against total scope',
    accent: 'lime',
    sections: [
      {
        label: 'What it shows',
        body: 'Two lines: total scope (hours added to the sprint) and completed work. The gap between them is how much is left to do.',
      },
      {
        label: 'How to read it',
        body: 'The scope line should be relatively flat. If it rises mid-sprint, that is scope creep — new work was added after the sprint started. The completed line should rise toward the scope line by sprint end.',
      },
    ],
    tip: 'Unlike Burndown, Burnup separates scope changes from progress. If both lines rise together, the team is delivering but also taking on more work.',
  },
  control: {
    title: 'Control Chart',
    subtitle: 'Measure how long each issue takes',
    accent: 'violet',
    sections: [
      {
        label: 'What it shows',
        body: 'Each dot is one completed issue, plotted by its cycle time (days from "In Progress" to "Done"). The horizontal line is the team average (μ), and the shaded band shows ±2 standard deviations.',
      },
      {
        label: 'How to read it',
        body: 'Most dots should fall inside the band — that is normal variation. Dots outside the band are outliers worth investigating. A lower mean over time means the team is delivering faster.',
      },
    ],
    tip: 'Outliers are not bad — they are conversations. Ask: was this issue too large, was someone stuck, or did we underestimate? Use insights to improve sizing.',
  },
};

function renderChartTooltip(key) {
  const info = CHART_TOOLTIPS[key];
  if (!info) return null;

  const sections = info.sections.map((s) =>
    el('div', { class: 'chart-tooltip-section' }, [
      el('div', { class: 'chart-tooltip-section-label' }, [s.label]),
      el('p', { class: 'chart-tooltip-section-body' }, [s.body]),
    ])
  );

  const popover = el('div', { class: `chart-tooltip-popover accent-${info.accent}` }, [
    el('div', { class: 'chart-tooltip-arrow' }),
    el('div', { class: 'chart-tooltip-header' }, [
      el('div', { class: 'chart-tooltip-title' }, [info.title]),
      el('div', { class: 'chart-tooltip-subtitle' }, [info.subtitle]),
    ]),
    el('div', { class: 'chart-tooltip-body' }, sections),
    el('div', { class: 'chart-tooltip-tip' }, [
      el('span', { class: 'tip-icon' }, [
        svg('svg', {
          width: 14, height: 14, viewBox: '0 0 24 24',
          fill: 'none', stroke: 'currentColor', 'stroke-width': 2,
          'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        }, [
          svg('path', { d: 'M9 18h6' }),
          svg('path', { d: 'M10 22h4' }),
          svg('path', { d: 'M12 2a7 7 0 0 0-4 12.7c.8.7 1.3 1.6 1.3 2.6V18h5.4v-.7c0-1 .5-1.9 1.3-2.6A7 7 0 0 0 12 2z' }),
        ]),
      ]),
      el('div', { class: 'tip-text' }, [
        el('span', { class: 'tip-label' }, ['Pro tip']),
        el('span', {}, [info.tip]),
      ]),
    ]),
  ]);

  const iconSvg = svg('svg', {
    class: 'chart-info-icon',
    width: 20, height: 20, viewBox: '0 0 24 24',
    fill: 'none',
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, [
    svg('path', {
      class: 'sparkle-main',
      d: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
      fill: 'currentColor',
    }),
    svg('path', {
      class: 'sparkle-small',
      d: 'M18 14l.7 1.8 1.8.7-1.8.7L18 19l-.7-1.8-1.8-.7 1.8-.7z',
      fill: 'currentColor',
      opacity: 0.6,
    }),
  ]);

  const btn = el('button', {
    class: `chart-info-btn accent-${info.accent}`,
    type: 'button',
    'aria-label': `About ${info.title}`,
  }, []);
  btn.appendChild(iconSvg);

  popover.addEventListener('click', (e) => e.stopPropagation());

  function positionPopover() {
    const rect = btn.getBoundingClientRect();
    const popW = popover.offsetWidth || 360;
    let left = rect.right - popW;
    if (left < 12) left = 12;
    if (left + popW > window.innerWidth - 12) left = window.innerWidth - popW - 12;
    popover.style.top = `${rect.bottom + 14}px`;
    popover.style.left = `${left}px`;
    // Position arrow relative to button center
    const arrowOffset = Math.max(12, Math.min(popW - 24, rect.left + rect.width / 2 - left - 7));
    popover.style.setProperty('--arrow-offset', `${arrowOffset}px`);
  }

  function closePopover() {
    popover.classList.remove('open');
    document.removeEventListener('click', closePopover);
    window.removeEventListener('resize', positionPopover);
    window.removeEventListener('scroll', positionPopover, true);
    setTimeout(() => {
      if (!popover.classList.contains('open') && popover.parentNode === document.body) {
        document.body.removeChild(popover);
      }
    }, 250);
  }

  btn.onclick = (e) => {
    e.stopPropagation();
    if (popover.classList.contains('open')) {
      closePopover();
      return;
    }
    document.body.appendChild(popover);
    positionPopover();
    requestAnimationFrame(() => popover.classList.add('open'));
    window.addEventListener('resize', positionPopover);
    window.addEventListener('scroll', positionPopover, true);
    setTimeout(() => document.addEventListener('click', closePopover), 0);
  };

  return el('div', { class: 'chart-info-wrap' }, [btn]);
}

function renderStatusCard(sprint) {
  const counts = { todo: 0, inprogress: 0, done: 0 };
  const hours = { todo: 0, inprogress: 0, done: 0 };
  for (const i of sprint.issues) {
    counts[i.status]++;
    hours[i.status] += i.originalEstimate;
  }
  return el('div', { class: 'card' }, [
    el('h3', { class: 'card-title' }, [
      el('span', {}, ['Status by Category']),
      el('span', { class: 'accent' }),
    ]),
    renderDonut({
      counts, hoursByStatus: hours, totalIssues: sprint.issues.length,
    }),
  ]);
}

function renderSprintSkeleton(sprint) {
  const ghostCard = () => el('div', { class: 'card skeleton-card' }, []);
  return [
    el('div', { class: 'banner info sprint-load-banner' }, [
      el('span', { class: 'spinner-mini' }),
      el('span', {}, [`Loading ${sprint?.name || 'sprint'} data…`]),
    ]),
    el('div', { class: 'row cols-2' }, [ghostCard(), ghostCard()]),
    el('div', { class: 'row cols-2' }, [ghostCard(), ghostCard()]),
    el('div', { class: 'row' }, [ghostCard()]),
  ];
}

function renderEpicLoadingBanner(progress) {
  const pct = Math.max(0, Math.min(100, progress.percent || 0));
  const hasStep = progress.step != null && progress.total != null;
  return el('div', { class: 'banner info epic-load-banner' }, [
    el('div', { class: 'epic-load-row' }, [
      el('span', { class: 'spinner-mini' }),
      el('span', { class: 'epic-load-label' }, [progress.label || 'Loading epic data…']),
      hasStep
        ? el('span', { class: 'epic-load-step' }, [`${progress.step}/${progress.total}`])
        : null,
    ]),
    el('div', { class: 'epic-load-track' }, [
      el('span', { style: { width: `${pct}%` } }),
    ]),
  ]);
}

// Build the repaintable Sprint content (skeleton or hero/charts/table) — i.e.
// everything EXCEPT the filter tabs. Returns an array of nodes mounted inside
// #sprint-content-mount, so it can be repainted in isolation as a sprint's
// issues stream in or the active sprint switches.
function buildSprintContent(s) {
  const out = [];
  const sprint = activeSprint();

  // Issues for this sprint are fetched on demand — show a skeleton until they
  // arrive so the charts don't flash empty zeroes.
  if (sprint && sprint.issuesLoaded === false) {
    out.push(...renderSprintSkeleton(sprint));
  } else {
    const series = generateDailySeries(sprint, s.today);

    const hero = renderSprintHero({ sprint, today: s.today });
    hero.appendChild(renderStatusCard(sprint));
    out.push(hero);

    out.push(el('div', { class: 'row cols-2' }, [
      chartCard('Burndown', renderBurndown(series), 'burndown'),
      chartCard('Cumulative Flow', renderCFD(series), 'cfd'),
    ]));
    out.push(el('div', { class: 'row cols-2' }, [
      chartCard('Burnup', renderBurnup(series), 'burnup'),
      chartCard('Control Chart', renderControl(series), 'control'),
    ]));
    out.push(el('div', { class: 'row' }, [renderWorkloadTable({ sprint })]));
  }
  return out;
}

// Build the full Sprint view: the filter tabs (rendered ONCE, kept outside the
// repaint area) plus the content mount. Switching sprints / loading issues never
// rebuilds the filter — that preserves the state-filter pill selection and the
// horizontal scroll position; only the active highlight is moved in place.
function buildSprintView(s) {
  return [
    renderSprintFilter({
      sprints: s.sprints,
      activeId: s.activeSprintId,
      onChange: setActiveSprint,
    }),
    el('div', { id: 'sprint-content-mount' }, buildSprintContent(s)),
  ];
}

// Repaint ONLY the Sprint content area from current state, and move the filter's
// active highlight in place. Called when a sprint's issues finish loading
// (skeleton → charts) and when switching the active sprint, so the rest of the
// page (topbar, background, tabs, filter tabs) is untouched.
export function rerenderSprintView() {
  const mount = document.getElementById('sprint-content-mount');
  if (!mount) return; // not on the sprint view — nothing to do
  const s = getState();
  updateSprintFilterActive(s.activeSprintId);
  mount.replaceChildren(...buildSprintContent(s));
}

// Repaint ONLY the Jira load progress strip from current state. Tries to mutate
// the existing strip in place (so the width transition animates and the spinner
// keeps spinning); when the strip is not mounted yet, or it is being shown/
// hidden, falls back to a full render so the bar is created/removed.
export function rerenderProgress() {
  if (!updateProgressOverlay(getState().loadProgress)) render();
}

// Repaint ONLY the data-source bar from current state. Called when the inline
// Board ID panel is opened/closed so the topbar, background particles, tabs and
// the whole content area are left untouched (no flash, no chart redraw).
export function rerenderDataSource() {
  const mount = document.getElementById('data-source-mount');
  if (!mount) return;
  mount.replaceChildren(dataSourceBar());
}

function buildRoadmap(s) {
  return renderEpicRoadmap({
    epics: s.epics,
    sprints: s.sprints,
    today: s.today,
    expandedIds: s.expandedEpicIds,
    filters: s.epicFilters,
    onToggleExpand: toggleEpicExpanded,
    onOpenDetail: openEpicDetail,
  });
}

// Repaint ONLY the Portfolio Roadmap node from current state. Called as new
// epic detail data streams in during progressive loading, so the rest of the
// page (topbar, background, charts, filter bar) stays untouched.
export function rerenderEpicRoadmap() {
  const mount = document.getElementById('epic-roadmap-mount');
  if (!mount) return; // not on the epic view (or not mounted yet) — nothing to do
  mount.replaceChildren(buildRoadmap(getState()));
}

// Repaint ONLY the Epic view content (filter bar + roadmap + detail panel) from
// current state. Called for Epic tab interactions and load completions so the
// topbar, background particles, tabs and footer are left untouched (no flash).
export function rerenderEpicView() {
  const mount = document.getElementById('epic-view-mount');
  if (!mount) return; // not on the epic view — nothing to do
  mount.replaceChildren(...renderEpicView());
}

function renderEpicView() {
  const s = getState();
  const children = [];

  if (s.epicLoadProgress) {
    children.push(renderEpicLoadingBanner(s.epicLoadProgress));
  }
  if (s.epicError) {
    children.push(el('div', { class: 'banner error' }, [`Epic data: ${s.epicError}`]));
  }

  const visibleEpics = s.epics.filter((e) => {
    if (s.epicFilters.status !== 'all' && e.status !== s.epicFilters.status) return false;
    if (s.epicFilters.sprintId !== 'all' && !e.sprintIds.includes(s.epicFilters.sprintId)) return false;
    const q = (s.epicFilters.search || '').toLowerCase().trim();
    if (q && !`${e.key} ${e.name}`.toLowerCase().includes(q)) return false;
    return true;
  }).length;

  children.push(renderEpicFilterBar({
    filters: s.epicFilters,
    sprints: s.sprints,
    totalEpics: s.epics.length,
    visibleEpics,
    onStatusChange: (v) => setEpicFilter({ status: v }),
    onSprintChange: (v) => setEpicFilter({ sprintId: v }),
    onSearchInput: (v) => setEpicSearchSilent(v),
    onClearAll: () => setEpicFilter({ ...DEFAULT_EPIC_FILTERS }),
  }));

  children.push(el('div', { id: 'epic-roadmap-mount' }, [buildRoadmap(s)]));

  const detailEpic = s.epicDetailId
    ? s.epics.find((e) => e.id === s.epicDetailId)
    : null;
  if (detailEpic) {
    children.push(renderEpicDetailPanel({
      epic: detailEpic, today: s.today, onClose: closeEpicDetail,
    }));
  }

  if (!s.epics.length && !s.epicLoadProgress) {
    children.push(el('div', { class: 'banner info' }, [
      'No epics yet. Once data loads they will appear in the roadmap above.',
    ]));
  }

  return children;
}

function chartCard(title, body, tooltipKey) {
  const titleChildren = [el('span', {}, [title])];
  const tooltip = renderChartTooltip(tooltipKey);
  titleChildren.push(tooltip || el('span', { class: 'accent' }));

  return el('div', { class: 'card' }, [
    el('h3', { class: 'card-title' }, titleChildren),
    body,
  ]);
}

function topbar() {
  const s = getState();
  return renderTopbar({
    today: s.today, sourceLabel: s.sourceLabel, user: s.user,
    onLogin: login, onLogout: logout,
  });
}

function dataSourceBar() {
  const s = getState();
  return renderDataSource({
    activeSource: s.sourceKey,
    isRefreshing: s.isRefreshing,
    lastUpdated: s.lastUpdated,
    apiPanelOpen: s.apiPanelOpen,
    pendingBoardId: s.pendingBoardId,
    loadProgress: s.loadProgress,
  });
}

// ─── Floating Refresh FAB ────────────────────────────────────────────────────
// Mounted once into <body> (outside #root) so it survives full re-renders and
// the scroll listener is never leaked. rerenderFAB() updates it in-place.

function fabProps() {
  const s = getState();
  return { sourceKey: s.sourceKey, isRefreshing: s.isRefreshing, lastUpdated: s.lastUpdated };
}

function ensureFAB() {
  const props = fabProps();
  const existing = document.getElementById('refresh-fab-mount');

  // Source is not API — remove FAB if it exists (cleanup scroll listener too)
  if (props.sourceKey !== 'api') {
    if (existing) {
      if (existing._cleanup) existing._cleanup();
      existing.remove();
    }
    return;
  }

  // Source is API — create if missing, update if present
  if (!existing) {
    const node = renderRefreshFAB(props);
    if (!node) return;
    node.id = 'refresh-fab-mount';
    document.body.appendChild(node);
  } else {
    updateRefreshFAB(existing, props);
  }
}

export function rerenderFAB() {
  ensureFAB();
}

// ─── Floating Sprint/Epic tab switcher ───────────────────────────────────────
// Same lifecycle as the refresh FAB: mounted once into <body>, survives full
// re-renders, scroll listener cleaned up on teardown. Always present (unlike the
// refresh FAB, which is API-only) since switching views is relevant for every
// data source.

function ensureViewTabsFAB() {
  const s = getState();
  const existing = document.getElementById('view-tabs-fab-mount');
  if (!existing) {
    const node = renderViewTabsFAB({ active: s.view, onChange: setView });
    node.id = 'view-tabs-fab-mount';
    document.body.appendChild(node);
  } else {
    updateViewTabsFAB(existing, { active: s.view });
  }
}

export function rerenderViewTabsFAB() {
  ensureViewTabsFAB();
}

export function render() {
  const root = document.getElementById('root');
  if (!root) return;
  const s = getState();

  root.innerHTML = '';
  root.appendChild(renderBackground({ showParticles: true }));

  if (!s.sprints.length) {
    root.appendChild(el('div', { class: 'app' }, [
      topbar(),
      dataSourceBar(),
      el('div', { class: 'banner info' }, [
        'No sprints found in the loaded data. Try a different source or sprint filter.',
      ]),
    ]));
    return;
  }

  const children = [topbar(), el('div', { id: 'data-source-mount' }, [dataSourceBar()])];
  children.push(renderViewTabs({ active: s.view, onChange: setView }));
  if (s.error) children.push(el('div', { class: 'banner error' }, [s.error]));

  if (s.view === 'epic') {
    children.push(el('div', { id: 'epic-view-mount' }, renderEpicView()));
  } else {
    children.push(el('div', { id: 'sprint-view-mount' }, buildSprintView(s)));
  }

  children.push(el('footer', { class: 'footer' }, [
    el('span', {}, ['Sprint Pulse · Jira Analytics']),
    el('span', { style: { textTransform: 'none' } }, ['Idea by Phuong Phan']),
  ]));

  root.appendChild(el('div', { class: 'app' }, children));

  // Ensure FAB is mounted (or updated if already exists)
  ensureFAB();
  ensureViewTabsFAB();
}
