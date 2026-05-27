export const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'style' && typeof v === 'object') {
      Object.assign(node.style, v);
    } else if (k === 'class') {
      node.setAttribute('class', v);
    } else {
      node.setAttribute(k, v);
    }
  }
  for (const c of children) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function pathFromPoints(points) {
  if (!points.length) return '';
  return points
    .map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`))
    .join(' ');
}

export function smoothPath(points) {
  if (points.length < 2) return pathFromPoints(points);
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const cp1x = p0[0] + (p1[0] - p0[0]) / 2;
    const cp1y = p0[1];
    const cp2x = p0[0] + (p1[0] - p0[0]) / 2;
    const cp2y = p1[1];
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1[0]} ${p1[1]}`;
  }
  return d;
}

export function shortDate(d) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
