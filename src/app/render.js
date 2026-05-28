import { el } from '../ui/dom.js';
import { svg } from '../charts/svg.js';
import { generateDailySeries } from '../domain/series.js';

import { renderBackground } from '../ui/components/background.js';
import { renderTopbar } from '../ui/components/topbar.js';
import { renderDataSource } from '../ui/components/data-source-bar.js';
import { renderSprintFilter } from '../ui/components/sprint-filter.js';
import { renderSprintHero } from '../ui/components/sprint-hero.js';
import { renderWorkloadTable } from '../ui/components/workload-table.js';

import { renderBurndown } from '../charts/burndown.js';
import { renderBurnup } from '../charts/burnup.js';
import { renderCFD } from '../charts/cfd.js';
import { renderControl } from '../charts/control.js';
import { renderDonut } from '../charts/donut.js';

import { getState, activeSprint } from './state.js';
import { login, logout, setActiveSprint } from './actions.js';

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

  const sprint = activeSprint();
  const series = generateDailySeries(sprint, s.today);

  const children = [topbar(), dataSourceBar()];
  if (s.error) children.push(el('div', { class: 'banner error' }, [s.error]));

  children.push(renderSprintFilter({
    sprints: s.sprints,
    activeId: s.activeSprintId,
    onChange: setActiveSprint,
  }));

  const hero = renderSprintHero({ sprint, today: s.today });
  hero.appendChild(renderStatusCard(sprint));
  children.push(hero);

  children.push(el('div', { class: 'row cols-2' }, [
    chartCard('Burndown', renderBurndown(series), 'burndown'),
    chartCard('Cumulative Flow', renderCFD(series), 'cfd'),
  ]));
  children.push(el('div', { class: 'row cols-2' }, [
    chartCard('Burnup', renderBurnup(series), 'burnup'),
    chartCard('Control Chart', renderControl(series), 'control'),
  ]));
  children.push(el('div', { class: 'row' }, [renderWorkloadTable({ sprint })]));
  children.push(el('footer', { class: 'footer' }, [
    el('span', {}, ['Sprint Pulse · Jira Analytics']),
    el('span', { style: { textTransform: 'none' } }, ['Idea by Phuong Phan']),
  ]));

  root.appendChild(el('div', { class: 'app' }, children));
}
