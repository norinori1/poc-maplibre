import type { ProfilePoint } from '../route/profile';
import { formatDistance, formatElevation } from './format';

const NS = 'http://www.w3.org/2000/svg';
const W = 300;
const H = 130;
const PAD = { left: 38, right: 8, top: 10, bottom: 22 };

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string>, text?: string): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 横軸=累積距離、縦軸=標高の簡易グラフ。欠測点では線を途切れさせる。 */
export function renderProfileChart(svg: SVGSVGElement, points: readonly ProfilePoint[]): void {
  svg.replaceChildren();
  const valid = points.filter((p) => p.elevation !== null);
  if (valid.length < 2) return;
  const total = points[points.length - 1]!.distance;
  const elevations = valid.map((p) => p.elevation as number);
  let min = Math.min(...elevations);
  let max = Math.max(...elevations);
  // 平地でも勾配を誇張しないよう、縦軸は最低でも10mの幅を確保する。
  if (max - min < 10) {
    const mid = (max + min) / 2;
    min = mid - 5;
    max = mid + 5;
  }
  const x = (d: number) => PAD.left + (d / total) * (W - PAD.left - PAD.right);
  const y = (e: number) => PAD.top + (1 - (e - min) / (max - min)) * (H - PAD.top - PAD.bottom);

  svg.append(
    el('line', { x1: String(PAD.left), y1: String(H - PAD.bottom), x2: String(W - PAD.right), y2: String(H - PAD.bottom), class: 'chart-axis' }),
    el('line', { x1: String(PAD.left), y1: String(PAD.top), x2: String(PAD.left), y2: String(H - PAD.bottom), class: 'chart-axis' }),
    el('text', { x: String(PAD.left - 4), y: String(PAD.top + 4), 'text-anchor': 'end', class: 'chart-label' }, formatElevation(max).replace(' m', 'm')),
    el('text', { x: String(PAD.left - 4), y: String(H - PAD.bottom), 'text-anchor': 'end', class: 'chart-label' }, formatElevation(min).replace(' m', 'm')),
    el('text', { x: String(PAD.left), y: String(H - 6), class: 'chart-label' }, '0'),
    el('text', { x: String(W - PAD.right), y: String(H - 6), 'text-anchor': 'end', class: 'chart-label' }, formatDistance(total)),
  );

  let path = '';
  let pen = false;
  for (const p of points) {
    if (p.elevation === null) { pen = false; continue; }
    path += `${pen ? 'L' : 'M'}${x(p.distance).toFixed(1)} ${y(p.elevation).toFixed(1)}`;
    pen = true;
  }
  svg.append(el('path', { d: path, class: 'chart-line', fill: 'none' }));
}
