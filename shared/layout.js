/**
 * Radial tree layout for mindmap nodes.
 * Returns positioned nodes: { id, label, type, done, x, y, depth, parentId, isNext }
 */

export function layoutMindmap(map, opts = {}) {
  const radiusStep = opts.radiusStep ?? 168;
  const root = map?.root;
  if (!root) return { nodes: [], edges: [], width: 800, height: 600 };

  const byParent = new Map();
  for (const n of map.nodes || []) {
    if (!byParent.has(n.parentId)) byParent.set(n.parentId, []);
    byParent.get(n.parentId).push(n);
  }

  const placed = [];
  const edges = [];

  function place(node, depth, angleStart, angleEnd, parentPos) {
    const mid = (angleStart + angleEnd) / 2;
    const r = depth === 0 ? 0 : radiusStep * depth * (depth === 1 ? 1 : 0.92 + depth * 0.04);
    const x = Math.cos(mid) * r;
    const y = Math.sin(mid) * r;

    const pos = {
      id: node.id,
      label: node.label,
      full: node.full || node.label,
      type: node.type,
      done: !!node.done,
      x,
      y,
      depth,
      parentId: node.parentId ?? null,
      isNext: map.nextStepId === node.id,
    };
    placed.push(pos);

    if (parentPos) {
      edges.push({
        from: parentPos.id,
        to: pos.id,
        x1: parentPos.x,
        y1: parentPos.y,
        x2: x,
        y2: y,
        toType: pos.type,
        isNext: pos.isNext,
      });
    }

    const kids = byParent.get(node.id) || [];
    if (!kids.length) return;

    const span = angleEnd - angleStart;
    // Leave a little padding between siblings
    const pad = kids.length > 1 ? span * 0.04 : 0;
    const usable = span - pad * 2;
    const slice = usable / kids.length;

    kids.forEach((kid, i) => {
      const a0 = angleStart + pad + i * slice;
      const a1 = a0 + slice;
      place(kid, depth + 1, a0, a1, pos);
    });
  }

  // Full circle for root children
  place({ ...root, parentId: null }, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2, null);

  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  for (const p of placed) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  const pad = 120;
  return {
    nodes: placed,
    edges,
    bounds: { minX, maxX, minY, maxY },
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  };
}
