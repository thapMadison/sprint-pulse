import { el } from '../dom.js';
import { svg } from '../../charts/svg.js';
import { workingDaysBetween, workingDaysRemaining } from '../../domain/working-days.js';
import { fmtDate, fmtDow, metaItem, dayUnit } from '../hero-helpers.js';

function renderGoalPopover(goalText) {
  const popover = el('div', { class: 'goal-popover' }, [
    el('div', { class: 'goal-popover-label' }, ['Sprint Goal']),
    el('div', { class: 'goal-popover-text' }, [goalText || '—']),
  ]);
  const iconSvg = svg('svg', {
    width: 14, height: 14, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', 'stroke-width': 2,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, [
    svg('circle', { cx: 12, cy: 12, r: 10 }),
    svg('line', { x1: 12, y1: 16, x2: 12, y2: 12 }),
    svg('line', { x1: 12, y1: 8, x2: 12.01, y2: 8 }),
  ]);
  const btn = el('button', { class: 'goal-info-btn', type: 'button' }, ['Goal']);
  btn.insertBefore(iconSvg, btn.firstChild);
  popover.addEventListener('click', (e) => e.stopPropagation());
  btn.onclick = (e) => {
    e.stopPropagation();
    if (popover.classList.contains('open')) {
      popover.classList.remove('open');
      return;
    }
    popover.classList.add('open');
    const close = () => {
      popover.classList.remove('open');
      document.removeEventListener('click', close);
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  };
  return el('div', { class: 'goal-info-wrap' }, [btn, popover]);
}

function statTile({ label, hours, totalEst, accentBg, extra }) {
  const bar = el('div', { class: 'stat-bar' }, [
    el('span', {
      style: {
        background: accentBg,
        ...(totalEst != null
          ? { transform: `scaleX(${Math.min(1, hours / Math.max(totalEst, 1))})` }
          : {}),
      },
    }),
  ]);
  return el('div', { class: 'card stat-tile' }, [
    el('div', { class: 'stat-label' }, [label]),
    el('div', {}, [
      extra
        ? el('div', { class: 'stat-value-row' }, [
            el('div', { class: 'stat-value' }, [hours.toFixed(0), el('span', { class: 'unit' }, ['h'])]),
            extra,
          ])
        : el('div', { class: 'stat-value' }, [hours.toFixed(0), el('span', { class: 'unit' }, ['h'])]),
      bar,
    ]),
  ]);
}

export function renderSprintHero({ sprint, today }) {
  const totalEst = sprint.issues.reduce((s, i) => s + i.originalEstimate, 0);
  const totalSpent = sprint.issues.reduce((s, i) => s + i.timeSpent, 0);
  const totalRemain = sprint.issues.reduce((s, i) => s + i.remainingEstimate, 0);
  const duration = workingDaysBetween(sprint.startDate, sprint.endDate);
  const remaining =
    sprint.state === 'closed' ? 0 :
    sprint.state === 'future' ? duration :
    workingDaysRemaining(sprint.endDate, today);

  const spentPct = Math.min(100, (totalSpent / Math.max(totalEst, 1)) * 100);
  const remainingColor = remaining < 3 && sprint.state === 'active' ? 'var(--coral)' : 'inherit';

  return el('div', { class: 'sprint-hero' }, [
    el('div', { class: 'card sprint-card' }, [
      el('div', { class: 'sprint-card-header' }, [
        el('div', { class: 'name' }, [sprint.name]),
        renderGoalPopover(sprint.goal),
      ]),
      el('div', { class: 'sprint-meta' }, [
        metaItem('Start', [fmtDate(sprint.startDate)], fmtDow(sprint.startDate)),
        metaItem('End', [fmtDate(sprint.endDate)], fmtDow(sprint.endDate)),
        metaItem('Duration', [String(duration), dayUnit()], 'working days'),
        metaItem('Remaining', [String(remaining), dayUnit()], 'working days', { color: remainingColor }),
      ]),
    ]),
    el('div', { class: 'stat-grid' }, [
      statTile({
        label: 'Original Estimate', hours: totalEst, totalEst: null,
        accentBg: 'linear-gradient(90deg, var(--violet), var(--cyan))',
      }),
      el('div', { class: 'card stat-tile' }, [
        el('div', { class: 'stat-label' }, ['Time Spent']),
        el('div', {}, [
          el('div', { class: 'stat-value-row' }, [
            el('div', { class: 'stat-value' }, [
              totalSpent.toFixed(0), el('span', { class: 'unit' }, ['h']),
            ]),
            el('span', { class: 'stat-pct' }, [`${spentPct.toFixed(0)}% of estimate`]),
          ]),
          el('div', { class: 'stat-bar' }, [
            el('span', {
              style: {
                background: 'linear-gradient(90deg, var(--lime), var(--cyan))',
                animation: 'growBar 1.2s cubic-bezier(0.2,0.8,0.2,1) both',
                transform: `scaleX(${spentPct / 100})`,
              },
            }),
          ]),
        ]),
      ]),
      statTile({
        label: 'Remaining Effort', hours: totalRemain, totalEst,
        accentBg: 'linear-gradient(90deg, var(--coral), var(--amber))',
      }),
    ]),
  ]);
}
