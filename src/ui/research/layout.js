// @ts-check
/**
 * Layout of the technology web: tiers as columns (left to right = deeper),
 * areas as horizontal bands. Inside a band, each tier's technologies stack,
 * theories first. Pure function: no DOM, so it is testable.
 *
 * @typedef {{ x: number, y: number, w: number, h: number }} Box
 * @typedef {{ nodes: Map<string, Box>, bands: { area: string, y: number, h: number }[], width: number, height: number, columns: { tier: number, x: number }[] }} WebLayout
 */

export const LAYOUT = { nodeW: 176, nodeH: 30, colGap: 64, rowGap: 8, bandPad: 12, left: 170, top: 34 };

/**
 * @param {import('../../research/catalog.js').Tech[]} techs
 * @param {{ id: string }[]} areas in display order
 * @param {typeof LAYOUT} [o]
 * @returns {WebLayout}
 */
export function layoutWeb(techs, areas, o = LAYOUT) {
  const maxTier = Math.max(...techs.map((t) => t.tier));
  const colX = (/** @type {number} */ tier) => o.left + (tier - 1) * (o.nodeW + o.colGap);
  /** @type {Map<string, Box>} */
  const nodes = new Map();
  const bands = [];
  let y = o.top;
  for (const a of areas) {
    const inArea = techs.filter((t) => t.area === a.id);
    let rows = 1;
    for (let tier = 1; tier <= maxTier; tier++) {
      const col = inArea
        .filter((t) => t.tier === tier)
        .sort((p, q) => (p.kind === q.kind ? p.id.localeCompare(q.id) : p.kind === 'theory' ? -1 : 1));
      col.forEach((t, i) => nodes.set(t.id, { x: colX(tier), y: y + o.bandPad + i * (o.nodeH + o.rowGap), w: o.nodeW, h: o.nodeH }));
      rows = Math.max(rows, col.length);
    }
    const h = o.bandPad * 2 + rows * (o.nodeH + o.rowGap) - o.rowGap;
    bands.push({ area: a.id, y, h });
    y += h;
  }
  return {
    nodes,
    bands,
    width: colX(maxTier) + o.nodeW + o.colGap / 2,
    height: y + o.top / 2,
    columns: Array.from({ length: maxTier }, (_, i) => ({ tier: i + 1, x: colX(i + 1) })),
  };
}

/**
 * SVG path from a prerequisite to a technology: a smooth curve left to right,
 * or a loop on the left side when both sit in the same column.
 * @param {Box} a prerequisite @param {Box} b dependant
 */
export function edgePath(a, b) {
  if (a.x === b.x) {
    const x = a.x;
    const y1 = a.y + a.h / 2;
    const y2 = b.y + b.h / 2;
    return `M${x},${y1} C${x - 28},${y1} ${x - 28},${y2} ${x},${y2}`;
  }
  const x1 = a.x + a.w;
  const y1 = a.y + a.h / 2;
  const x2 = b.x;
  const y2 = b.y + b.h / 2;
  const dx = Math.max(24, (x2 - x1) / 2);
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}
