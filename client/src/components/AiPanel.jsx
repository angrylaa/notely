// src/components/AiPanel.jsx
import { useCallback, useState } from "react";

const AI_STROKE_COLOR = "#ffffff"; // ✅ all AI strokes are white
const MIN_ARROW_GAP = 100; // ✅ min arrow length & block spacing
const SIDE_PADDING = 32;

function makeId() {
  return (
    (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
    Math.random().toString(36).slice(2, 9)
  );
}

/**
 * Roughly estimate the block size based on label length so
 * the width is only as wide as the text needs.
 */
function estimateBlockSize(label, blockType, region) {
  const text =
    (typeof label === "string" ? label.trim() : "") ||
    (blockType === "text" ? "Heading" : "Text");

  const approxCharWidth = 10; // heuristic
  const basePadding = 32; // left + right
  const minWidth = 140;
  const maxWidth = Math.max(minWidth, region.w * 0.8);

  const rawWidth = text.length * approxCharWidth + basePadding;
  let w = Math.max(minWidth, Math.min(maxWidth, rawWidth));

  // estimate lines / height
  const charsPerLine = Math.max(12, Math.floor(w / approxCharWidth));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  const lineHeight = blockType === "text" ? 28 : 22;
  const baseHeight = blockType === "text" ? 40 : 32;
  const h = baseHeight + (lines - 1) * lineHeight;

  return { w, h };
}

/**
 * Lay out blocks in a single row or column with at least MIN_ARROW_GAP
 * between them. We choose vertical layout if the region is too narrow.
 *
 * Returns { placed, orientation }
 *  - placed: [{ index, op, x, y, w, h, blockType }]
 *  - orientation: "horizontal" | "vertical"
 */
function layoutBlocksInRegion(blockOps, region) {
  const innerWidth = region.w - SIDE_PADDING * 2;
  const innerHeight = region.h - SIDE_PADDING * 2;

  const prepared = blockOps.map((op, index) => {
    const blockType = op.blockType === "text" ? "text" : "paragraph";
    const { w, h } = estimateBlockSize(op.label, blockType, region);
    return { index, op, blockType, w, h };
  });

  const n = prepared.length;
  if (n === 0) {
    return { placed: [], orientation: "horizontal" };
  }

  const totalWidthNeeded =
    prepared.reduce((sum, b) => sum + b.w, 0) + MIN_ARROW_GAP * (n - 1);
  const totalHeightNeeded =
    prepared.reduce((sum, b) => sum + b.h, 0) + MIN_ARROW_GAP * (n - 1);

  let orientation;
  if (totalWidthNeeded <= innerWidth) {
    // fits horizontally
    orientation = "horizontal";
  } else if (totalHeightNeeded <= innerHeight) {
    // doesn't fit horizontally, but fits vertically
    orientation = "vertical";
  } else {
    // neither fits perfectly; pick whichever dimension is larger
    orientation = innerWidth >= innerHeight ? "horizontal" : "vertical";
  }

  const placed = [];

  if (orientation === "horizontal") {
    const centerY = region.y + region.h / 2;
    let x = region.x + SIDE_PADDING;

    prepared.forEach((b) => {
      const y = centerY - b.h / 2;
      placed.push({
        index: b.index,
        op: b.op,
        blockType: b.blockType,
        x,
        y,
        w: b.w,
        h: b.h,
      });
      x += b.w + MIN_ARROW_GAP;
    });
  } else {
    const centerX = region.x + region.w / 2;
    let y = region.y + SIDE_PADDING;

    prepared.forEach((b) => {
      const x = centerX - b.w / 2;
      placed.push({
        index: b.index,
        op: b.op,
        blockType: b.blockType,
        x,
        y,
        w: b.w,
        h: b.h,
      });
      y += b.h + MIN_ARROW_GAP;
    });
  }

  return { placed, orientation };
}

/**
 * Build an arrow element between two blocks.
 * - Horizontal: centers on Y, at least MIN_ARROW_GAP long.
 * - Vertical:   centers on X, at least MIN_ARROW_GAP long.
 */
function buildArrowElement(fromEl, toEl, orientation) {
  if (!fromEl || !toEl) return null;

  const fromCx = fromEl.x + fromEl.w / 2;
  const fromCy = fromEl.y + fromEl.h / 2;
  const toCx = toEl.x + toEl.w / 2;
  const toCy = toEl.y + toEl.h / 2;

  if (orientation === "vertical") {
    // Center X, arrow running up/down
    const dir = toCy >= fromCy ? 1 : -1; // down or up
    const centerX = (fromCx + toCx) / 2;

    const rawStartY = dir > 0 ? fromEl.y + fromEl.h : fromEl.y;
    const rawEndY = dir > 0 ? toEl.y : toEl.y + toEl.h;

    let y1 = rawStartY + dir * 8; // a bit away from the box edge
    let y2 = rawEndY - dir * 8;

    let length = Math.abs(y2 - y1);
    if (length < MIN_ARROW_GAP) {
      const extra = (MIN_ARROW_GAP - length) / 2;
      y1 -= dir * extra;
      y2 += dir * extra;
      length = Math.abs(y2 - y1);
    }

    const x1 = centerX;
    const x2 = centerX;

    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    return {
      id: makeId(),
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
  } else {
    // Horizontal: center Y, arrow running left/right
    const dir = toCx >= fromCx ? 1 : -1; // right or left
    const centerY = (fromCy + toCy) / 2;

    const rawStartX = dir > 0 ? fromEl.x + fromEl.w : fromEl.x;
    const rawEndX = dir > 0 ? toEl.x : toEl.x + toEl.w;

    let x1 = rawStartX + dir * 8;
    let x2 = rawEndX - dir * 8;

    let length = Math.abs(x2 - x1);
    if (length < MIN_ARROW_GAP) {
      const extra = (MIN_ARROW_GAP - length) / 2;
      x1 -= dir * extra;
      x2 += dir * extra;
      length = Math.abs(x2 - x1);
    }

    const y1 = centerY;
    const y2 = centerY;

    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    return {
      id: makeId(),
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
  }
}

/**
 * Map normalized (u,v in [0,1]) stroke path points to world coords in aiRegion.
 */
function mapStrokePathToWorld(points, region) {
  if (!Array.isArray(points)) return [];

  return points
    .map((p) => {
      if (!p || typeof p.u !== "number" || typeof p.v !== "number") return null;
      const u = Math.max(0, Math.min(1, p.u));
      const v = Math.max(0, Math.min(1, p.v));
      return {
        x: region.x + u * region.w,
        y: region.y + v * region.h,
      };
    })
    .filter(Boolean);
}

export default function AiPanel({
  elements,
  setElements,
  strokes,
  setStrokes,
  selectedId,
}) {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleGenerate = useCallback(async () => {
    setErrorMsg("");

    // 1) pick the AI Region (prefer the selected one, otherwise first)
    const aiRegion =
      elements.find((el) => el.id === selectedId && el.type === "aiRegion") ||
      elements.find((el) => el.type === "aiRegion");

    if (!aiRegion) {
      setErrorMsg("Select an AI Region block (or create one) first.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("http://localhost:8000/ai-draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "AI request failed");
      }

      const data = await res.json();
      const operations = Array.isArray(data.operations) ? data.operations : [];

      // 2) split operations by type
      const blockOps = operations.filter((op) => op && op.op === "add_block");
      const arrowOps = operations.filter((op) => op && op.op === "add_arrow");
      const strokePathOps = operations.filter(
        (op) => op && op.op === "add_stroke_path"
      );

      // 3) layout blocks inside aiRegion with NO OVERLAP, respecting MIN_ARROW_GAP
      const { placed, orientation } = layoutBlocksInRegion(blockOps, aiRegion);

      const newBlockElements = placed.map(
        ({ index, op, x, y, w, h, blockType }) => {
          const id = makeId();

          let type;
          if (blockType === "text") type = "text";
          else if (blockType === "paragraph") type = "paragraph";
          else type = "box";

          let label = typeof op.label === "string" ? op.label.trim() : "";
          if (!label) {
            if (type === "latex") label = "$$x^2 + y^2$$";
            else if (type === "text") label = "Heading";
            else if (type === "paragraph") label = "Type your paragraph…";
            else label = "Text";
          }

          return {
            id,
            blockIndex: index, // index in blockOps array
            type,
            x,
            y,
            w,
            h,
            label,
          };
        }
      );

      // helper to find element by block index
      const findBlockByIndex = (idx) =>
        newBlockElements.find((el) => el.blockIndex === idx);

      // 4) build arrows from block indices, using layout orientation
      const newArrowElements = arrowOps
        .map((op) => {
          const fromIdx = op.from;
          const toIdx = op.to;
          if (typeof fromIdx !== "number" || typeof toIdx !== "number") {
            return null;
          }

          const fromEl = findBlockByIndex(fromIdx);
          const toEl = findBlockByIndex(toIdx);
          if (!fromEl || !toEl) return null;

          return buildArrowElement(fromEl, toEl, orientation);
        })
        .filter(Boolean);

      // 5) convert stroke paths to canvas strokes (forced to white)
      const newStrokesFromPaths = strokePathOps
        .map((op) => {
          const pts = mapStrokePathToWorld(op.points, aiRegion);
          if (!pts || pts.length < 2) return null;

          const width =
            typeof op.width === "number" && op.width > 0 ? op.width : 2;

          return {
            id: makeId(),
            color: AI_STROKE_COLOR, // ✅ always white
            width,
            points: pts,
          };
        })
        .filter(Boolean);

      // 6) update board
      setElements((prev) => [
        ...prev,
        ...newBlockElements,
        ...newArrowElements,
      ]);

      if (newStrokesFromPaths.length > 0) {
        setStrokes((prev) => [...prev, ...newStrokesFromPaths]);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(String(err.message || err));
    } finally {
      setIsLoading(false);
    }
  }, [elements, selectedId, prompt, setElements, setStrokes]);

  return (
    <div
      style={{
        position: "absolute",
        right: 16,
        bottom: 16,
        width: 320,
        padding: 12,
        borderRadius: 12,
        background: "rgba(15,23,42,0.95)",
        border: "1px solid #4b5563",
        color: "#e5e7eb",
        fontFamily: "angela, system-ui, sans-serif",
        zIndex: 30,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 14, opacity: 0.85 }}>Gemini diagram helper</div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        placeholder="Describe the diagram you want inside the selected AI Region…"
        style={{
          width: "100%",
          fontSize: 13,
          fontFamily: "angela, system-ui, sans-serif",
          padding: 8,
          borderRadius: 8,
          border: "1px solid #4b5563",
          background: "#020617",
          color: "#e5e7eb",
          resize: "vertical",
          boxSizing: "border-box",
        }}
      />

      <button
        onClick={handleGenerate}
        disabled={isLoading}
        style={{
          marginTop: 4,
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid #facc15",
          background: isLoading ? "#4b5563" : "#facc15",
          color: "#020617",
          cursor: isLoading ? "default" : "pointer",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {isLoading ? "Thinking…" : "Generate in AI Region"}
      </button>

      {errorMsg && (
        <div style={{ color: "#f97373", fontSize: 12 }}>{errorMsg}</div>
      )}

      {!selectedId && (
        <div style={{ fontSize: 11, opacity: 0.65 }}>
          Tip: select an <strong>AI Region</strong> block to target. If none is
          selected, I’ll use the first AI Region on the board.
        </div>
      )}
    </div>
  );
}
