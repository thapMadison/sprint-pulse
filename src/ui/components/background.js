import { el } from '../dom.js';

export function renderBackground({ showParticles = true } = {}) {
  const particles = [];
  if (showParticles) {
    for (let i = 0; i < 24; i++) {
      particles.push(el('div', {
        class: 'particle',
        style: {
          left: `${Math.random() * 100}%`,
          animationDelay: `${-Math.random() * 18}s`,
          animationDuration: `${14 + Math.random() * 12}s`,
          width: `${2 + Math.random() * 3}px`,
          height: `${2 + Math.random() * 3}px`,
          opacity: String(0.3 + Math.random() * 0.5),
        },
      }));
    }
  }

  return el('div', { class: 'bg-stage' }, [
    el('div', { class: 'blob b1' }),
    el('div', { class: 'blob b2' }),
    el('div', { class: 'blob b3' }),
    el('div', { class: 'blob b4' }),
    el('div', { class: 'grid-noise' }),
    el('div', { class: 'particles' }, particles),
  ]);
}
