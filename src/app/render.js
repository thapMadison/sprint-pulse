import { el } from '../ui/dom.js';
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

function chartCard(title, body) {
  return el('div', { class: 'card' }, [
    el('h3', { class: 'card-title' }, [
      el('span', {}, [title]),
      el('span', { class: 'accent' }),
    ]),
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
    chartCard('Burndown · remaining effort vs ideal', renderBurndown(series)),
    chartCard('Cumulative Flow Diagram', renderCFD(series)),
  ]));
  children.push(el('div', { class: 'row cols-2' }, [
    chartCard('Burnup · scope vs completed', renderBurnup(series)),
    chartCard('Control Chart · cycle time', renderControl(series)),
  ]));
  children.push(el('div', { class: 'row' }, [renderWorkloadTable({ sprint })]));
  children.push(el('footer', { class: 'footer' }, [
    el('span', {}, ['Sprint Pulse · Jira Analytics']),
    el('span', { style: { textTransform: 'none' } }, ['Idea by Phuong Phan']),
  ]));

  root.appendChild(el('div', { class: 'app' }, children));
}
