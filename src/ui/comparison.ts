import type { MeasuredProfile } from '../route/compare';
import { formatDistance, formatElevation, formatGrade } from './format';
import type { ProfileSummary } from '../route/profile';

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
};
const elevation = (value: number | null) => value === null ? '—' : formatElevation(value);
const range = (summary: ProfileSummary, length: 50 | 100) => {
  const grades = summary.windows[length].map((w) => w.gradePercent);
  return grades.length ? `${formatGrade(Math.min(...grades))} ～ ${formatGrade(Math.max(...grades))}` : '—';
};

function table(headers: string[], rows: string[][]): HTMLElement {
  const scroll = node('div');
  scroll.className = 'table-scroll';
  scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-label', headers.join('・'));
  const element = node('table');
  const head = node('thead');
  const tr = node('tr');
  for (const label of headers) { const th = node('th', label); th.scope = 'col'; tr.append(th); }
  head.append(tr); element.append(head);
  const body = node('tbody');
  for (const values of rows) {
    const row = node('tr');
    values.forEach((value, i) => {
      const cell = i === 0 ? node('th', value) : node('td', value);
      if (cell instanceof HTMLTableCellElement && i === 0) cell.scope = 'row';
      row.append(cell);
    });
    body.append(row);
  }
  element.append(body); scroll.append(element); return scroll;
}

function summaryRows(summary: ProfileSummary): [string, string][] {
  return [
    ['距離 / 有効連続距離', `${formatDistance(summary.totalDistance)} / ${formatDistance(summary.validDistance)}`],
    ['獲得標高（1m閾値）', summary.validDistance > 0 ? formatElevation(summary.ascent) : '—'],
    ['下降量（1m閾値）', summary.validDistance > 0 ? formatElevation(summary.descent) : '—'],
    ['最低 / 最高', `${elevation(summary.minElevation)} / ${elevation(summary.maxElevation)}`],
    ['全体平均勾配（欠測ありは—）', formatGrade(summary.netGradePercent, '—')],
    ['50m区間勾配 最小～最大', range(summary, 50)], ['100m区間勾配 最小～最大', range(summary, 100)],
    ['欠測数 / 率', `${summary.missingCount} / ${(summary.missingRate * 100).toFixed(1)}%`],
  ];
}

export function renderComparison(container: HTMLElement, profiles: readonly MeasuredProfile[]): void {
  container.replaceChildren();
  const first = profiles[0];
  if (!first) return;
  const columns = profiles.flatMap((p) => [{ name: `${p.providerName} 生データ`, summary: p.summary },
    ...(p.smoothed ? [{ name: `${p.providerName} 30m移動平均`, summary: p.smoothed.summary }] : [])]);
  container.append(node('p', profiles.map((p, i) => `${i === 0 ? '茶' : '青'}: ${p.providerName}`).join(' / ')
    + (profiles.some((p) => p.smoothed) ? '（実線: 生データ、破線: 30m移動平均）' : '（生データ）')));
  container.append(table(['指標', ...columns.map((c) => c.name)], summaryRows(first.summary).map(([label], i) =>
    [label, ...columns.map((c) => summaryRows(c.summary)[i]![1])])));
  container.append(table(['取得条件・性能', ...profiles.map((p) => p.providerName)], [
    ['要求間隔 / 実間隔', ...profiles.map((p) => `${p.requestedSpacing}m / ${p.actualSpacing.toFixed(2)}m`)],
    ['サンプル数 / 通信等エラー点', ...profiles.map((p) => `${p.points.length} / ${p.errorCount}`)],
    ['処理時間', ...profiles.map((p) => `${p.elapsedMs.toFixed(1)}ms`)],
    ['新規取得 / キャッシュ参照 / Promise共有', ...profiles.map((p) => `${p.metrics.requests} / ${p.metrics.cacheHits} / ${p.metrics.sharedRequests}`)],
    ['取得本文サイズ（転送量とは異なる）', ...profiles.map((p) => `${(p.metrics.bodyBytes / 1024).toFixed(1)} KiB`)],
    ['実ネットワーク転送量', ...profiles.map(() => '不明（CORS越しの転送量は未計測）')],
    ['使用レベル', ...profiles.map((p) => p.levelLabels.join(' / ') || '—')],
  ]));
  const detail = node('details');
  detail.append(node('summary', '各サンプルの標高・差・50m/100m区間勾配'));
  const second = profiles[1];
  const headings = ['距離(m)', '緯度, 経度', ...profiles.flatMap((p) => [p.providerName, `${p.providerId} 状態`,
    `${p.providerId} 50m`, `${p.providerId} 100m`, ...(p.smoothed ? [`${p.providerId} 30m平均`] : [])]),
    ...(second ? ['標高差 Mapterhorn−GSI'] : [])];
  detail.append(table(headings, first.points.map((point, i) => {
    const row = [point.distance.toFixed(1), `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`];
    for (const p of profiles) {
      row.push(elevation(p.points[i]!.elevation), p.points[i]!.status ?? '—');
      for (const length of [50, 100] as const) row.push(formatGrade(p.summary.windows[length].find((w) => w.from === point.distance)?.gradePercent ?? null, '—'));
      if (p.smoothed) row.push(elevation(p.smoothed.points[i]!.elevation));
    }
    if (second) row.push(point.elevation === null || second.points[i]!.elevation === null ? '—'
      : `${(second.points[i]!.elevation! - point.elevation).toFixed(2)} m`);
    return row;
  })));
  container.append(detail);
  container.append(node('p', '両DEMの原資料が共通の場合があります。値の一致は精度保証ではありません。欠測数は配信タイルから検出できた欠測のみで、Mapterhornの事前補完・0m置換は検出できません。'));
}
