/**
 * Radial mindmap layout.
 * Cards are spaced from their real width and height so neighboring
 * nodes do not cover each other.
 */

const GAP = 20;

/** Distance from a card's center to its edge along a unit direction. */
function halfExtent(w, h, ux, uy) {
  const ax = Math.abs(ux);
  const ay = Math.abs(uy);
  const alongX = ax < 1e-6 ? Infinity : w / 2 / ax;
  const alongY = ay < 1e-6 ? Infinity : h / 2 / ay;
  return Math.min(alongX, alongY);
}

function lineCount(text, maxChars = 16) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  let lines = 1;
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > maxChars && cur) {
      lines += 1;
      cur = word;
    } else {
      cur = next;
    }
  }
  return Math.min(3, lines);
}

/** Box size used both for layout and for the SVG card. */
export function nodeBox(node) {
  const isRoot = node?.type === "root";
  const lines = lineCount(node?.label, 16);
  let extra = 0;
  if (!isRoot) {
    if (node?.timeLabel || node?.context) extra += 1;
    if (node?.identity && (node?.type === "goal" || node?.type === "theme" || node?.type === "someday")) extra += 1;
    if (node?.stackAfterId) extra += 1;
  }
  return {
    w: isRoot ? 168 : 156,
    h: 34 + lines * 14 + extra * 12 + (isRoot ? 4 : 16),
  };
}

export function layoutMindmap(map) {
  const root = map?.root;
  if (!root) return { nodes: [], edges: [], width: 800, height: 600 };

  const byParent = new Map();
  for (const node of map.nodes || []) {
    if (!byParent.has(node.parentId)) byParent.set(node.parentId, []);
    byParent.get(node.parentId).push(node);
  }

  const placed = [];

  function put(node, x, y, depth, parentId) {
    const box = nodeBox(node);
    const pos = {
      id: node.id,
      label: node.label,
      full: node.full || node.label,
      type: node.type,
      done: !!node.done,
      x,
      y,
      w: box.w,
      h: box.h,
      depth,
      parentId: parentId ?? null,
      isNext: map.nextStepId === node.id,
    };
    placed.push(pos);
    const kids = byParent.get(node.id) || [];
    if (depth === 0) placeRing(pos, kids);
    else placeFan(pos, kids);
    return pos;
  }

  function placeRing(parent, kids) {
    if (!kids.length) return;
    const sizes = kids.map(nodeBox);
    const n = kids.length;
    const step = (Math.PI * 2) / n;
    let radius = 0;
    for (let i = 0; i < n; i += 1) {
      const angle = -Math.PI / 2 + step * i;
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      const size = sizes[i];
      radius = Math.max(
        radius,
        halfExtent(parent.w, parent.h, ux, uy) + halfExtent(size.w, size.h, ux, uy) + GAP
      );
      // Only neighbors on a tight arc need extra radius. Opposite cards
      // already clear each other once they clear the parent.
      if (n > 2) {
        const next = sizes[(i + 1) % n];
        const chord = (Math.max(size.w, size.h) + Math.max(next.w, next.h)) / 2 + GAP;
        radius = Math.max(radius, chord / (2 * Math.sin(step / 2)));
      }
    }
    kids.forEach((kid, index) => {
      const angle = -Math.PI / 2 + step * index;
      put(kid, Math.cos(angle) * radius, Math.sin(angle) * radius, parent.depth + 1, parent.id);
    });
  }

  function placeFan(parent, kids) {
    if (!kids.length) return;
    const sizes = kids.map(nodeBox);
    const len = Math.hypot(parent.x, parent.y) || 1;
    const ux = parent.x / len;
    const uy = parent.y / len;
    const vx = -uy;
    const vy = ux;
    // Pack branches into a short block beside the parent instead of one
    // long row, so the parent stays close to every task that splits off it.
    const cols = Math.max(1, Math.ceil(Math.sqrt(kids.length)));
    let index = 0;
    let edge = halfExtent(parent.w, parent.h, ux, uy) + GAP;
    while (index < kids.length) {
      const row = kids.slice(index, index + cols);
      const rowSizes = sizes.slice(index, index + cols);
      const spans = rowSizes.map((size) => halfExtent(size.w, size.h, vx, vy) * 2);
      const rowH = Math.max(...rowSizes.map((size) => halfExtent(size.w, size.h, ux, uy) * 2));
      const total = spans.reduce((sum, span) => sum + span, 0) + GAP * Math.max(0, row.length - 1);
      let cursor = -total / 2;
      const along = edge + rowH / 2;
      row.forEach((kid, rowIndex) => {
        const side = cursor + spans[rowIndex] / 2;
        cursor += spans[rowIndex] + GAP;
        put(
          kid,
          parent.x + ux * along + vx * side,
          parent.y + uy * along + vy * side,
          parent.depth + 1,
          parent.id
        );
      });
      edge += rowH + GAP;
      index += row.length;
    }
  }

  const rootBox = nodeBox({ ...root, type: "root" });
  put({ ...root, type: "root", label: root.label }, 0, 0, 0, null);
  placed[0].w = rootBox.w;
  placed[0].h = rootBox.h;

  separate(placed);
  const edges = edgesFrom(placed);

  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  for (const node of placed) {
    minX = Math.min(minX, node.x - node.w / 2);
    maxX = Math.max(maxX, node.x + node.w / 2);
    minY = Math.min(minY, node.y - node.h / 2);
    maxY = Math.max(maxY, node.y + node.h / 2);
  }

  const pad = 72;
  return {
    nodes: placed,
    edges,
    bounds: { minX, maxX, minY, maxY },
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  };
}

function separate(nodes) {
  for (let pass = 0; pass < 80; pass += 1) {
    let moved = false;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        if (pushApart(nodes[i], nodes[j])) moved = true;
      }
    }
    if (!moved) break;
  }
}

function pushApart(a, b) {
  const overlapX = (a.w + b.w) / 2 + GAP - Math.abs(a.x - b.x);
  const overlapY = (a.h + b.h) / 2 + GAP - Math.abs(a.y - b.y);
  if (overlapX <= 0 || overlapY <= 0) return false;

  const aFixed = a.type === "root";
  const bFixed = b.type === "root";
  if (overlapX < overlapY) {
    const dir = a.x <= b.x ? -1 : 1;
    shift(a, b, aFixed, bFixed, dir * (overlapX + 1), 0);
  } else {
    const dir = a.y <= b.y ? -1 : 1;
    shift(a, b, aFixed, bFixed, 0, dir * (overlapY + 1));
  }
  return true;
}

function shift(a, b, aFixed, bFixed, dx, dy) {
  if (!aFixed && !bFixed) {
    a.x += dx / 2;
    a.y += dy / 2;
    b.x -= dx / 2;
    b.y -= dy / 2;
    return;
  }
  if (!aFixed) {
    a.x += dx;
    a.y += dy;
  } else if (!bFixed) {
    b.x -= dx;
    b.y -= dy;
  }
}

function edgesFrom(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = [];
  for (const node of nodes) {
    if (!node.parentId) continue;
    const parent = byId.get(node.parentId);
    if (!parent) continue;
    edges.push({
      from: parent.id,
      to: node.id,
      x1: parent.x,
      y1: parent.y,
      x2: node.x,
      y2: node.y,
      toType: node.type,
      isNext: node.isNext,
    });
  }
  return edges;
}
