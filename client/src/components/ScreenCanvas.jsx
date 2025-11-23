// src/components/ScreenCanvas.jsx
import { useEffect, useRef, useState } from "react";
import starterImgSrc from "../assets/starter.png";
import { useCamera } from "../context/CameraContext";

const GRID_SIZE = 24;

// ---------- Helpers ----------

// grid snapping for world coords
const snapToGrid = (v, grid = GRID_SIZE) => Math.round(v / grid) * grid;

// screen -> world
function screenToWorld(sx, sy, camera, viewportWidth, viewportHeight) {
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
function eraseAt(strokes, wx, wy, radius) {
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
function stripLatexDelimiters(label = "") {
  if (label.startsWith("$$") && label.endsWith("$$") && label.length >= 4) {
    return label.slice(2, -2).trim();
  }
  return label;
}

// word-wrap a string into multiple lines that fit within maxWidth (in world units)
function wrapText(ctx, text, maxWidth) {
  if (!text) return [""];
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? currentLine + " " + word : word;
    const { width } = ctx.measureText(testLine);
    if (width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

// rounded rectangle helper
function roundedRectPath(ctx, x, y, w, h, r) {
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
function isOnResizeHandle(el, wx, wy, radius = 12) {
  const hx = el.x + el.w;
  const hy = el.y + el.h;
  const dx = wx - hx;
  const dy = wy - hy;
  return dx * dx + dy * dy <= radius * radius;
}

// distance from point to segment squared (for arrow hit testing)
function pointToSegmentDist2(px, py, x1, y1, x2, y2) {
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
function hitTestElement(el, wx, wy) {
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

    // distance to line segment
    const dist2 = pointToSegmentDist2(wx, wy, x1, y1, x2, y2);
    return dist2 <= margin * margin;
  }

  // box / latex / text / paragraph / aiRegion
  return wx >= el.x && wx <= el.x + el.w && wy >= el.y && wy <= el.y + el.h;
}

// arrow endpoint hit test
function getArrowEndpointHit(el, wx, wy, radius = 12) {
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
function withArrowBounds(el) {
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

// all snap points for a box/latex/etc.
function getBoxSnapPoints(el) {
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
function snapPointToBoxes(wx, wy, elements, selfId, threshold = 20) {
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

export default function ScreenCanvas({
  mode, // "pan" | "draw" | "erase"
  elements,
  setElements,
  selectedId,
  setSelectedId,
  strokes,
  setStrokes,
  strokeColor,
  strokeWidth,
  pendingTemplate, // { key, label, w, h } | null
  setPendingTemplate,
}) {
  const canvasRef = useRef(null);
  const { camera, setCamera } = useCamera();

  const [viewport, setViewport] = useState({ width: 800, height: 600 });

  // interaction refs
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const cameraStart = useRef({ x: 0, y: 0, zoom: 1 });

  const isDrawing = useRef(false);
  const currentStrokeId = useRef(null);
  const isErasing = useRef(false);

  const resizeState = useRef(null); // { id, startWx, startWy, startW, startH }
  const dragState = useRef(null); // { kind: 'box' | 'arrow', ... }
  const arrowEndpointState = useRef(null); // { id, endpoint: 'start'|'end' }

  const [starterImage, setStarterImage] = useState(null);

  // inline text editor
  const [editing, setEditing] = useState(null); // { id, text, type }
  const editorRef = useRef(null);

  // load background image
  useEffect(() => {
    const img = new Image();
    img.src = starterImgSrc;
    img.onload = () => setStarterImage(img);
  }, []);

  // viewport size
  useEffect(() => {
    function handleResize() {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // focus editor when it starts (but don't re-select on every keystroke)
  useEffect(() => {
    if (editing && editorRef.current) {
      editorRef.current.focus();
    }
  }, [editing?.id]);

  // ---------- render loop ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = viewport;
    const dpr = window.devicePixelRatio || 1;

    // hi-DPI
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // camera transform
    ctx.translate(width / 2, height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // background image in world space
    if (starterImage) {
      const imgW = 800;
      const imgH = 800;
      const imgX = -imgW / 2;
      const imgY = -imgH / 2;
      ctx.drawImage(starterImage, imgX, imgY, imgW, imgH);
    }

    // base font (world units, zoom will scale it visually)
    ctx.font = `16px "angela", system-ui, sans-serif`;

    elements.forEach((rawEl) => {
      const el = rawEl.type === "arrow" ? withArrowBounds(rawEl) : rawEl;
      const isSelected = el.id === selectedId;
      const type = el.type || "box";

      // ---------- ARROWS ----------
      if (type === "arrow") {
        const x1 = el.x1 ?? el.x;
        const y1 = el.y1 ?? el.y;
        const x2 = el.x2 ?? el.x + el.w;
        const y2 = el.y2 ?? el.y + el.h;

        ctx.strokeStyle = isSelected ? "#facc15" : "#e5e7eb";
        ctx.lineWidth = 2;

        // arrow line
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // arrowhead
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLen = 14;
        const hx1 = x2 - headLen * Math.cos(angle - Math.PI / 6);
        const hy1 = y2 - headLen * Math.sin(angle - Math.PI / 6);
        const hx2 = x2 - headLen * Math.cos(angle + Math.PI / 6);
        const hy2 = y2 - headLen * Math.sin(angle + Math.PI / 6);

        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(hx1, hy1);
        ctx.lineTo(hx2, hy2);
        ctx.closePath();
        ctx.fill();

        // endpoint handles if selected
        if (isSelected) {
          const r = 6;
          ctx.fillStyle = "#f97316";
          ctx.strokeStyle = "#0f172a";
          ctx.lineWidth = 1;

          ctx.beginPath();
          ctx.arc(x1, y1, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(x2, y2, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        return;
      }

      // ---------- NON-ARROWS ----------
      const isLatex = type === "latex";
      const isHeading = type === "text";
      const isParagraph = type === "paragraph";
      const isPlainBox = type === "box";
      const isAiRegion = type === "aiRegion";

      // 1) AI Region: dashed yellow frame + tiny label
      if (isAiRegion) {
        ctx.save();
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 2;
        ctx.strokeRect(el.x, el.y, el.w, el.h);
        ctx.restore();

        ctx.fillStyle = "#e5e7eb";
        ctx.font = `12px "angela", system-ui, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(el.label || "AI Region", el.x + 6, el.y + 4);

        return;
      }

      // 2) LaTeX block: rounded box + wrapped text
      if (isLatex) {
        ctx.fillStyle = "#020617";
        ctx.strokeStyle = isSelected ? "#facc15" : "#4b5563";
        ctx.lineWidth = 2;

        roundedRectPath(ctx, el.x, el.y, el.w, el.h, 12);
        ctx.fill();
        ctx.stroke();

        ctx.save();
        roundedRectPath(ctx, el.x, el.y, el.w, el.h, 12);
        ctx.clip();

        const baseFontSize = 18;
        ctx.font = `${baseFontSize}px "angela", system-ui, sans-serif`;
        ctx.fillStyle = "#e5e7eb";

        let text = stripLatexDelimiters(el.label || "") || "LaTeX";

        const paddingWorld = 16;
        const availableWidth = Math.max(0, el.w - paddingWorld * 2);
        const lineHeight = baseFontSize + 4;

        let lines = [text];
        if (availableWidth > 0 && text) {
          const paragraphs = text.split("\n");
          lines = paragraphs.flatMap((para) =>
            wrapText(ctx, para, availableWidth)
          );
        }

        const cx = el.x + el.w / 2;
        const cy = el.y + el.h / 2;

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const totalHeight = lines.length * lineHeight;
        const startY = cy - totalHeight / 2 + lineHeight / 2;

        lines.forEach((line, i) => {
          const y = startY + i * lineHeight;
          ctx.fillText(line, cx, y);
        });

        ctx.restore();

        if (isSelected) {
          const handleSize = 7;
          const hx = el.x + el.w;
          const hy = el.y + el.h;

          ctx.fillStyle = "#facc15";
          ctx.strokeStyle = "#0f172a";
          ctx.lineWidth = 1;

          ctx.beginPath();
          ctx.rect(
            hx - handleSize,
            hy - handleSize,
            handleSize * 2,
            handleSize * 2
          );
          ctx.fill();
          ctx.stroke();
        }

        return;
      }

      // 3) Text-based blocks: heading / paragraph / plain box
      let baseFontSize = 16;
      if (isHeading) baseFontSize = 32;
      if (isParagraph) baseFontSize = 16;
      if (isPlainBox) baseFontSize = 16;

      // 🔲 Draw box outline/background for plain "box" elements
      if (isPlainBox) {
        ctx.fillStyle = "#020617";
        ctx.strokeStyle = isSelected ? "#facc15" : "#4b5563";
        ctx.lineWidth = 2;
        roundedRectPath(ctx, el.x, el.y, el.w, el.h, 12);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#e5e7eb"; // text color
      }

      ctx.font = `${baseFontSize}px "angela", system-ui, sans-serif`;

      const paddingWorld = 8;
      const startX = el.x + paddingWorld;
      const startY = el.y + paddingWorld;

      let text = el.label || "";
      const lineHeight = baseFontSize + 4;

      const availableWidth = Math.max(0, el.w - paddingWorld * 2);

      let lines = [text];
      if (availableWidth > 0 && text) {
        const paragraphs = text.split("\n");
        lines = paragraphs.flatMap((para) =>
          wrapText(ctx, para, availableWidth)
        );
      }

      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      lines.forEach((line, i) => {
        const y = startY + i * lineHeight;
        ctx.fillText(line, startX, y);
      });

      // dashed selection rectangle ONLY when selected
      if (isSelected) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(el.x, el.y, el.w, el.h);
        ctx.restore();
      }
    });

    // strokes
    // strokes
    if (strokes && strokes.length > 0) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      strokes.forEach((stroke) => {
        if (!stroke.points || stroke.points.length < 2) return;

        const color = stroke.color || "#e5e7eb";
        const widthWorld = stroke.width || 2;

        ctx.strokeStyle = color;
        ctx.lineWidth = widthWorld;

        ctx.beginPath();
        const [first, ...rest] = stroke.points;
        ctx.moveTo(first.x, first.y);
        rest.forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.stroke();
      });
    }
  }, [camera, viewport, elements, selectedId, strokes, starterImage]);

  // ---------- pointer handlers ----------

  const handlePointerDown = (e) => {
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {}
    }

    const { pointerType } = e;

    const { wx, wy } = screenToWorld(
      sx,
      sy,
      camera,
      viewport.width,
      viewport.height
    );

    // drawing (mouse draw or Apple Pencil)
    if (mode === "draw" || pointerType === "pen") {
      setSelectedId(null); // auto-deselect component when drawing

      const id =
        (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
        Math.random().toString(36).slice(2, 9);

      const newStroke = {
        id,
        color: strokeColor,
        width: strokeWidth,
        points: [{ x: wx, y: wy }],
      };

      currentStrokeId.current = id;
      isDrawing.current = true;
      isErasing.current = false;
      isPanning.current = false;
      resizeState.current = null;
      dragState.current = null;
      arrowEndpointState.current = null;

      setStrokes((prev) => [...prev, newStroke]);
      return;
    }

    // erase
    if (mode === "erase") {
      setStrokes((prev) => eraseAt(prev, wx, wy, 20));
      isErasing.current = true;
      isDrawing.current = false;
      isPanning.current = false;
      resizeState.current = null;
      dragState.current = null;
      arrowEndpointState.current = null;
      return;
    }

    // pan mode
    if (mode === "pan") {
      const selected = elements.find((el) => el.id === selectedId);

      // if selected arrow, check endpoint handles first
      if (selected && selected.type === "arrow") {
        const el = withArrowBounds(selected);
        const endpoint = getArrowEndpointHit(el, wx, wy);
        if (endpoint) {
          arrowEndpointState.current = { id: el.id, endpoint };
          isPanning.current = false;
          dragState.current = null;
          resizeState.current = null;
          isDrawing.current = false;
          isErasing.current = false;
          return;
        }
      }

      // if selected non-arrow, check resize handle
      if (selected && selected.type !== "arrow") {
        if (isOnResizeHandle(selected, wx, wy)) {
          resizeState.current = {
            id: selected.id,
            startWx: wx,
            startWy: wy,
            startW: selected.w,
            startH: selected.h,
          };
          isPanning.current = false;
          isDrawing.current = false;
          isErasing.current = false;
          dragState.current = null;
          arrowEndpointState.current = null;
          return;
        }
      }

      // check for element hit (for dragging)
      const hit = elements
        .slice()
        .reverse()
        .find((el) => hitTestElement(el, wx, wy));

      if (hit) {
        if (hit.type === "arrow") {
          const el = withArrowBounds(hit);
          dragState.current = {
            kind: "arrow",
            id: el.id,
            startWx: wx,
            startWy: wy,
            startX1: el.x1 ?? el.x,
            startY1: el.y1 ?? el.y,
            startX2: el.x2 ?? el.x + el.w,
            startY2: el.y2 ?? el.y + el.h,
          };
        } else {
          dragState.current = {
            kind: "box",
            id: hit.id,
            offsetX: wx - hit.x,
            offsetY: wy - hit.y,
          };
        }

        isPanning.current = false;
        isDrawing.current = false;
        isErasing.current = false;
        resizeState.current = null;
        arrowEndpointState.current = null;
        setSelectedId(hit.id);
        return;
      }

      // otherwise pan canvas
      isPanning.current = true;
      isDrawing.current = false;
      isErasing.current = false;
      resizeState.current = null;
      dragState.current = null;
      arrowEndpointState.current = null;

      panStart.current = { x: e.clientX, y: e.clientY };
      cameraStart.current = { ...camera };
    }
  };

  const handlePointerMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const { wx, wy } = screenToWorld(
      sx,
      sy,
      camera,
      viewport.width,
      viewport.height
    );

    if (isDrawing.current) {
      const id = currentStrokeId.current;
      setStrokes((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, points: [...s.points, { x: wx, y: wy }] } : s
        )
      );
      return;
    }

    if (isErasing.current) {
      setStrokes((prev) => eraseAt(prev, wx, wy, 20));
      return;
    }

    // dragging arrow endpoint (with snapping)
    if (arrowEndpointState.current) {
      const { id, endpoint } = arrowEndpointState.current;

      // snap this endpoint to nearest box anchor if close enough
      const snapped = snapPointToBoxes(wx, wy, elements, id, 20);
      const sxp = snapToGrid(snapped.x);
      const syp = snapToGrid(snapped.y, GRID_SIZE * 2);

      setElements((prev) =>
        prev.map((el) => {
          if (el.id !== id || el.type !== "arrow") return el;
          let x1 = el.x1 ?? el.x;
          let y1 = el.y1 ?? el.y;
          let x2 = el.x2 ?? el.x + el.w;
          let y2 = el.y2 ?? el.y + el.h;

          if (endpoint === "start") {
            x1 = sxp;
            y1 = syp;
          } else {
            x2 = sxp;
            y2 = syp;
          }

          return withArrowBounds({ ...el, x1, y1, x2, y2 });
        })
      );
      return;
    }

    // dragging box / arrow body
    if (dragState.current) {
      const state = dragState.current;
      if (state.kind === "box") {
        const { id, offsetX, offsetY } = state;
        let newX = wx - offsetX;
        let newY = wy - offsetY;

        newX = snapToGrid(newX);
        newY = snapToGrid(newY);

        setElements((prev) =>
          prev.map((el) => (el.id === id ? { ...el, x: newX, y: newY } : el))
        );
      } else if (state.kind === "arrow") {
        const { id, startWx, startWy, startX1, startY1, startX2, startY2 } =
          state;
        const dx = wx - startWx;
        const dy = wy - startWy;

        let x1 = snapToGrid(startX1 + dx);
        let y1 = snapToGrid(startY1 + dy, GRID_SIZE * 2);
        let x2 = snapToGrid(startX2 + dx);
        let y2 = snapToGrid(startY2 + dy, GRID_SIZE * 2);

        setElements((prev) =>
          prev.map((el) =>
            el.id === id ? withArrowBounds({ ...el, x1, y1, x2, y2 }) : el
          )
        );
      }
      return;
    }

    if (resizeState.current) {
      const { id, startWx, startWy, startW, startH } = resizeState.current;
      const dx = wx - startWx;
      const dy = wy - startWy;

      const newW = Math.max(20, startW + dx);
      const newH = Math.max(20, startH + dy);

      setElements((prev) =>
        prev.map((el) => (el.id === id ? { ...el, w: newW, h: newH } : el))
      );
      return;
    }

    if (isPanning.current && mode === "pan") {
      const dxScreen = e.clientX - panStart.current.x;
      const dyScreen = e.clientY - panStart.current.y;

      const dxWorld = dxScreen / cameraStart.current.zoom;
      const dyWorld = dyScreen / cameraStart.current.zoom;

      setCamera({
        ...cameraStart.current,
        x: cameraStart.current.x - dxWorld,
        y: cameraStart.current.y - dyWorld,
        zoom: cameraStart.current.zoom,
      });
    }
  };

  const handlePointerUpOrLeave = (e) => {
    isPanning.current = false;
    isDrawing.current = false;
    isErasing.current = false;
    currentStrokeId.current = null;
    resizeState.current = null;
    dragState.current = null;
    arrowEndpointState.current = null;

    const canvas = canvasRef.current;
    if (canvas && canvas.releasePointerCapture) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // ---------- click / double click ----------

  const handleClick = (e) => {
    if (mode !== "pan") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const { wx, wy } = screenToWorld(
      sx,
      sy,
      camera,
      viewport.width,
      viewport.height
    );

    // place component if a template is selected
    if (pendingTemplate) {
      const { w, h, label, key } = pendingTemplate;

      const id =
        (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
        Math.random().toString(36).slice(2, 9);

      let newElement;

      if (key === "arrow") {
        const half = (w || 160) / 2;
        const laneY = snapToGrid(wy, GRID_SIZE * 2);
        const x1 = snapToGrid(wx - half);
        const y1 = laneY;
        const x2 = snapToGrid(wx + half);
        const y2 = laneY;

        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);

        newElement = {
          id,
          type: "arrow",
          x: minX,
          y: minY,
          w: maxX - minX,
          h: maxY - minY,
          x1,
          y1,
          x2,
          y2,
        };
      } else if (key === "aiRegion") {
        const x = snapToGrid(wx - w / 2);
        const y = snapToGrid(wy - h / 2);
        newElement = {
          id,
          x,
          y,
          w,
          h,
          label: label || "AI Region",
          type: "aiRegion",
        };
      } else {
        // choose default label per block type
        let defaultLabel;
        switch (key) {
          case "latex":
            defaultLabel = "$$x^2 + y^2$$";
            break;
          case "text":
            defaultLabel = label || "Heading";
            break;
          case "paragraph":
            defaultLabel = label || "Type your paragraph…";
            break;
          default:
            defaultLabel = label || "Text";
        }

        const x = snapToGrid(wx - w / 2);
        const y = snapToGrid(wy - h / 2);

        newElement = {
          id,
          x,
          y,
          w,
          h,
          label: defaultLabel,
          type: key, // "box" | "latex" | "text" | "paragraph"
        };
      }

      setElements((prev) => [...prev, newElement]);
      setSelectedId(id);
      setPendingTemplate(null); // auto-deselect template after placement
      return;
    }

    // normal selection
    const hit = elements
      .slice()
      .reverse()
      .find((el) => hitTestElement(el, wx, wy));

    setSelectedId(hit ? hit.id : null);
  };

  const handleDoubleClick = (e) => {
    if (mode !== "pan") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const { wx, wy } = screenToWorld(
      sx,
      sy,
      camera,
      viewport.width,
      viewport.height
    );

    // double-click to edit text-like elements
    const hit = elements
      .slice()
      .reverse()
      .find((el) => hitTestElement(el, wx, wy) && el.type !== "arrow");

    if (hit) {
      const type = hit.type || "box";
      const editableTypes = ["box", "latex", "text", "paragraph"];

      if (editableTypes.includes(type)) {
        setEditing({
          id: hit.id,
          text: hit.label || "",
          type,
        });
      }
      setSelectedId(hit.id);
    }
  };

  // ---------- wheel zoom ----------

  // ---------- wheel zoom ----------

  const handleWheel = (e) => {
    // Don't call preventDefault here; Chrome treats some wheel listeners as passive
    // and will log a warning if we try to prevent default behavior.

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setCamera((prev) => {
      const zoomFactor = 1.1;
      const direction = e.deltaY < 0 ? 1 : -1;

      let newZoom =
        direction > 0 ? prev.zoom * zoomFactor : prev.zoom / zoomFactor;

      const MIN = 1e-6;
      const MAX = 1e6;
      newZoom = Math.max(MIN, Math.min(newZoom, MAX));

      const before = screenToWorld(
        mouseX,
        mouseY,
        prev,
        viewport.width,
        viewport.height
      );
      const after = screenToWorld(
        mouseX,
        mouseY,
        { ...prev, zoom: newZoom },
        viewport.width,
        viewport.height
      );

      return {
        x: prev.x + (before.wx - after.wx),
        y: prev.y + (before.wy - after.wy),
        zoom: newZoom,
      };
    });
  };

  // ---------- input overlay positioning ----------

  let editorStyle = null;
  if (editing) {
    const el = elements.find((e) => e.id === editing.id);
    if (el) {
      const { sx, sy } = worldToScreen(
        el.x,
        el.y,
        camera,
        viewport.width,
        viewport.height
      );
      const sw = el.w * camera.zoom;
      const sh = el.h * camera.zoom;

      editorStyle = {
        overflow: "auto",
        position: "absolute",
        left: sx,
        top: sy,
        width: sw,
        height: sh,
        fontSize: 14,
        fontFamily: '"angela", system-ui, sans-serif',
        padding: "6px 8px",
        borderRadius: 8,
        border: "1px solid #facc15",
        background: "rgba(15,23,42,0.97)",
        color: "#e5e7eb",
        resize: "none",
        outline: "none",
        boxSizing: "border-box",
        zIndex: 10,
        textAlign: editing.type === "latex" ? "center" : "left",
      };
    }
  }

  const commitEditing = () => {
    if (!editing) return;
    const { id, text } = editing;
    setElements((prev) =>
      prev.map((el) => (el.id === id ? { ...el, label: text } : el))
    );
    setEditing(null);
  };

  const handleEditorKeyDown = (e) => {
    // Enter commits; Shift+Enter for newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commitEditing();
    }
  };

  // ---------- render container + canvas + editor ----------

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        width: viewport.width,
        height: viewport.height,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: viewport.width,
          height: viewport.height,
          display: "block",
          cursor:
            mode === "draw"
              ? "crosshair"
              : mode === "erase"
              ? "not-allowed"
              : resizeState.current
              ? "se-resize"
              : arrowEndpointState.current
              ? "crosshair"
              : dragState.current
              ? "grabbing"
              : isPanning.current
              ? "grabbing"
              : "grab",
          zIndex: 5,
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUpOrLeave}
        onPointerLeave={handlePointerUpOrLeave}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
      />

      {editing && editorStyle && (
        <textarea
          ref={editorRef}
          style={editorStyle}
          value={editing.text}
          onChange={(e) =>
            setEditing((prev) =>
              prev ? { ...prev, text: e.target.value } : prev
            )
          }
          onBlur={commitEditing}
          onKeyDown={handleEditorKeyDown}
        />
      )}
    </div>
  );
}
