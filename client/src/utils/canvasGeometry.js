// src/utils/canvasGeometry.js

// ---------- coordinate transforms ----------

// screen -> world
export function screenToWorld(sx, sy, camera, viewportWidth, viewportHeight) {
  const wx = (sx - viewportWidth / 2) / camera.zoom + camera.x;
  const wy = (sy - viewportHeight / 2) / camera.zoom + camera.y;
  return { wx, wy };
}

// world -> screen
export function worldToScreen(wx, wy, camera, viewportWidth, viewportHeight) {
  const sx = (wx - camera.x) * camera.zoom + viewportWidth / 2;
  const sy = (wy - camera.y) * camera.zoom + viewportHeight / 2;
  return { sx, sy };
}

// simple eraser
export function eraseAt(strokes, wx, wy, radius) {
  const r2 = radius * radius;
  return strokes.filter((stroke) => {
    if (!stroke.points || stroke.points.length === 0) return true;
    const hit = stroke.points.some((p) => {
      const dx = p.x - wx;
      const dy = p.y - wy;
      return dx * dx + dy * dy <= r2;
    });
    return !hit;
  });
}

// strip $$ ... $$ for display
export function stripLatexDelimiters(label = "") {
  if (label.startsWith("$$") && label.endsWith("$$") && label.length >= 4) {
    return label.slice(2, -2).trim();
  }
  return label;
}

// rounded rectangle helper
export function roundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  const right = x + w;
  const bottom = y + h;

  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(right - radius, y);
  ctx.quadraticCurveTo(right, y, right, y + radius);
  ctx.lineTo(right, bottom - radius);
  ctx.quadraticCurveTo(right, bottom, right - radius, bottom);
  ctx.lineTo(x + radius, bottom);
  ctx.quadraticCurveTo(x, bottom, x, bottom - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// resize handle hit test
export function isOnResizeHandle(el, wx, wy, radius = 12) {
  const hx = el.x + el.w;
  const hy = el.y + el.h;
  const dx = wx - hx;
  const dy = wy - hy;
  return dx * dx + dy * dy <= radius * radius;
}

// distance from point to segment squared (for arrow hit testing)
export function pointToSegmentDist2(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return (px - x1) ** 2 + (py - y1) ** 2;
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  const ddx = px - projX;
  const ddy = py - projY;
  return ddx * ddx + ddy * ddy;
}

// generic element hit test
export function hitTestElement(el, wx, wy) {
  if (el.type === "arrow") {
    const margin = 8;
    const x1 = el.x1 ?? el.x;
    const y1 = el.y1 ?? el.y;
    const x2 = el.x2 ?? el.x + el.w;
    const y2 = el.y2 ?? el.y + el.h;

    // quick bounding box check
    const minX = Math.min(x1, x2) - margin;
    const maxX = Math.max(x1, x2) + margin;
    const minY = Math.min(y1, y2) - margin;
    const maxY = Math.max(y1, y2) + margin;
    if (wx < minX || wx > maxX || wy < minY || wy > maxY) return false;

    const dist2 = pointToSegmentDist2(wx, wy, x1, y1, x2, y2);
    return dist2 <= margin * margin;
  }

  // box / latex
  return wx >= el.x && wx <= el.x + el.w && wy >= el.y && wy <= el.y + el.h;
}

// arrow endpoint hit test
export function getArrowEndpointHit(el, wx, wy, radius = 12) {
  const x1 = el.x1 ?? el.x;
  const y1 = el.y1 ?? el.y;
  const x2 = el.x2 ?? el.x + el.w;
  const y2 = el.y2 ?? el.y + el.h;

  const r2 = radius * radius;

  const dx1 = wx - x1;
  const dy1 = wy - y1;
  if (dx1 * dx1 + dy1 * dy1 <= r2) return "start";

  const dx2 = wx - x2;
  const dy2 = wy - y2;
  if (dx2 * dx2 + dy2 * dy2 <= r2) return "end";

  return null;
}

// keep arrow's bounding box in sync with endpoints
export function withArrowBounds(el) {
  if (el.type !== "arrow") return el;
  const x1 = el.x1 ?? el.x;
  const y1 = el.y1 ?? el.y;
  const x2 = el.x2 ?? el.x + el.w;
  const y2 = el.y2 ?? el.y + el.h;

  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  return {
    ...el,
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
    x1,
    y1,
    x2,
    y2,
  };
}

// ---------- SNAP HELPERS ----------

// all snap points for a box/latex
export function getBoxSnapPoints(el) {
  const x = el.x;
  const y = el.y;
  const w = el.w;
  const h = el.h;
  const cx = x + w / 2;
  const cy = y + h / 2;

  return [
    { x: cx, y: cy }, // center
    { x, y }, // tl
    { x: x + w, y }, // tr
    { x, y: y + h }, // bl
    { x: x + w, y: y + h }, // br
    { x: cx, y }, // top mid
    { x: cx, y: y + h }, // bottom mid
    { x, y: cy }, // left mid
    { x: x + w, y: cy }, // right mid
  ];
}

// find nearest snap point for (wx, wy) given all boxes
export function snapPointToBoxes(wx, wy, elements, selfId, threshold = 20) {
  let best = null;
  let bestDist2 = threshold * threshold;

  elements.forEach((el) => {
    if (el.id === selfId) return;
    if (el.type === "arrow") return;

    const points = getBoxSnapPoints(el);
    points.forEach((p) => {
      const dx = wx - p.x;
      const dy = wy - p.y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 <= bestDist2) {
        bestDist2 = dist2;
        best = { x: p.x, y: p.y };
      }
    });
  });

  if (best) return best;
  return { x: wx, y: wy };
}
