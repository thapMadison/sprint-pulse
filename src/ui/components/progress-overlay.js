import { el } from '../dom.js';

const API_STEPS = [
  { key: 'connect', label: 'Connect' },
  { key: 'fetch',   label: 'Pull data' },
  { key: 'process', label: 'Convert' },
  { key: 'done',    label: 'Done' },
];

const FILE_STEPS = [
  { key: 'parse',   label: 'Read file' },
  { key: 'process', label: 'Convert' },
  { key: 'done',    label: 'Done' },
];

export function renderProgressOverlay({ progress }) {
  if (!progress) return null;

  const steps = progress.flow === 'file' ? FILE_STEPS : API_STEPS;
  const activeIdx = steps.findIndex((s) => s.key === progress.step);

  const stepNodes = steps.map((s, i) => {
    let cls = 'progress-step';
    if (i < activeIdx || progress.step === 'done') cls += ' done';
    else if (i === activeIdx) cls += ' active';
    return el('div', { class: cls }, [
      el('span', { class: 'progress-dot' }, []),
      el('span', { class: 'progress-step-label' }, [s.label]),
    ]);
  });

  return el('div', { class: 'progress-strip' }, [
    el('div', { class: 'progress-strip-head' }, [
      el('span', { class: 'progress-spinner' }, []),
      el('span', { class: 'progress-label' }, [progress.label]),
      el('span', { class: 'progress-percent' }, [`${progress.percent}%`]),
    ]),
    el('div', { class: 'progress-bar-track' }, [
      el('div', {
        class: 'progress-bar-fill',
        style: { width: `${progress.percent}%` },
      }, []),
    ]),
    el('div', { class: 'progress-steps' }, stepNodes),
  ]);
}
