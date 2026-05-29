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

function stepsFor(progress) {
  return progress.flow === 'file' ? FILE_STEPS : API_STEPS;
}

function stepClass(steps, activeIdx, i, progress) {
  let cls = 'progress-step';
  if (i < activeIdx || progress.step === 'done') cls += ' done';
  else if (i === activeIdx) cls += ' active';
  return cls;
}

export function renderProgressOverlay({ progress }) {
  if (!progress) return null;

  const steps = stepsFor(progress);
  const activeIdx = steps.findIndex((s) => s.key === progress.step);

  const stepNodes = steps.map((s, i) =>
    el('div', { class: stepClass(steps, activeIdx, i, progress) }, [
      el('span', { class: 'progress-dot' }, []),
      el('span', { class: 'progress-step-label' }, [s.label]),
    ])
  );

  // The flow is stamped on the element so an in-place update can tell whether
  // the step layout still matches (api ↔ file) before mutating it.
  return el('div', { class: 'progress-strip', id: 'progress-strip', 'data-flow': progress.flow || 'api' }, [
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

// Update the progress strip WITHOUT re-rendering the rest of the page.
//  - If the strip already exists and its layout still matches, only the fill
//    width, percent/label text and step dot states are mutated, so the CSS
//    width transition animates smoothly and the spinner keeps spinning.
//  - If the strip is not mounted yet (first step) or the step layout changed
//    (api ↔ file), a fresh strip is built into the data-source bar's trailing
//    slot in place — so even the first stage doesn't flash the whole site.
// Returns false only when there is nothing to update (clearing) or no data-
// source bar to attach to, so the caller can fall back to a full render.
export function updateProgressOverlay(progress) {
  if (!progress) return false;

  const strip = document.getElementById('progress-strip');
  const steps = stepsFor(progress);
  const flowMatches = strip && (strip.getAttribute('data-flow') || 'api') === (progress.flow || 'api');
  const stepEls = strip ? strip.querySelectorAll('.progress-step') : [];

  if (strip && flowMatches && stepEls.length === steps.length) {
    const label = strip.querySelector('.progress-label');
    const percent = strip.querySelector('.progress-percent');
    const fill = strip.querySelector('.progress-bar-fill');
    if (label) label.textContent = progress.label;
    if (percent) percent.textContent = `${progress.percent}%`;
    if (fill) fill.style.width = `${progress.percent}%`;

    const activeIdx = steps.findIndex((s) => s.key === progress.step);
    stepEls.forEach((node, i) => {
      node.className = stepClass(steps, activeIdx, i, progress);
    });
    return true;
  }

  // No strip yet (or layout changed): swap the data-source bar's trailing slot
  // for a fresh strip in place. The trailing element is always the bar's last
  // child (status / board input / strip), so replacing it keeps the rest of
  // the bar — and the whole page — untouched.
  const bar = document.querySelector('.data-source-bar');
  if (bar && bar.lastElementChild) {
    bar.lastElementChild.replaceWith(renderProgressOverlay({ progress }));
    return true;
  }
  return false;
}
