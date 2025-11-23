// src/components/AiPanel.jsx
import { useCallback, useState } from "react";
import { getBoxSnapPoints } from "../utils/canvasGeometry";

const AI_STROKE_COLOR = "#ffffff"; // ✅ all AI strokes are white

function makeId() {
  return (
    (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
    Math.random().toString(36).slice(2, 9)
  );
}

/**
 * Measure a label's width in "world" pixels using a hidden canvas.
 * We use a bigger font for headings ("text") and smaller for paragraphs/box.
 */
function measureLabelWidth(label, blockType) {
  if (!label) label = "";
  const canvas =
    measureLabelWidth._canvas ||
    (measureLabelWidth._canvas = document.createElement("canvas"));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // fallback: rough estimate
    return label.length * (blockType === "text" ? 18 : 9);
  }

  const fontSize = blockType === "text" ? 32 : 16;
  ctx.font = `${fontSize}px "angela", system-ui, sans-serif`;
  const metrics = ctx.measureText(label);
  return metrics.width || label.length * (blockType === "text" ? 18 : 9);
}

/**
 * Lay out blocks in rows inside aiRegion so they NEVER overlap.
 * Width is based on text size + padding, not on Gemini's w.
 */
function layoutBlocksInRegion(blockOps, region) {
  const paddingOuter = 24; // padding from region border
  const gapX = 24;
  const gapY = 24;

  const regionInnerLeft = region.x + paddingOuter;
  const regionInnerTop = region.y + paddingOuter;
  const regionInnerRight = region.x + region.w - paddingOuter;

  const minWidth = 80; // tiny safety so boxes aren't microscopic
  const minHeight = 40;

  let cursorX = regionInnerLeft;
  let cursorY = regionInnerTop;
  let rowHeight = 0;

  const placed = [];

  blockOps.forEach((op, index) => {
    // determine block type
    let type;
    if (op.blockType === "text") type = "text";
    else if (op.blockType === "paragraph") type = "paragraph";
    else type = "box";

    // determine label (same defaults we use when creating elements)
    let label = typeof op.label === "string" ? op.label.trim() : "";
    if (!label) {
      if (type === "latex") label = "$$x^2 + y^2$$";
      else if (type === "text") label = "Heading";
      else if (type === "paragraph") label = "Type your paragraph…";
      else label = "Text";
    }

    // choose font + padding
    const isHeading = type === "text";
    const fontSize = isHeading ? 32 : 16;
    const lineHeight = fontSize + 4;
    const paddingInner = isHeading ? 16 : 10;

    // measure text width and build box width/height
    const textWidth = measureLabelWidth(label, type);
    let w = textWidth + paddingInner * 2;
    let h = lineHeight + paddingInner * 2;

    // clamp width/height to region
    const maxW = region.w * 0.9;
    if (w > maxW) w = maxW;
    if (w < minWidth) w = minWidth;
    if (h < minHeight) h = minHeight;

    // wrap to next row if necessary
    if (cursorX + w > regionInnerRight) {
      cursorX = regionInnerLeft;
      cursorY += rowHeight + gapY;
      rowHeight = 0;
    }

    placed.push({
      index, // index in blockOps
      op,
      x: cursorX,
      y: cursorY,
      w,
      h,
      type,
      label,
    });

    cursorX += w + gapX;
    rowHeight = Math.max(rowHeight, h);
  });

  // This row layout guarantees NO OVERLAP because each block gets its own slot.
  return placed;
}

/**
 * Compute arrow endpoints based on block geometry using getBoxSnapPoints.
 * We pick the closest pair of snap points between the two blocks.
 */
function computeArrowEndpoints(fromEl, toEl) {
  const fromPoints = getBoxSnapPoints(fromEl);
  const toPoints = getBoxSnapPoints(toEl);

  let bestFrom = fromPoints[0];
  let bestTo = toPoints[0];
  let bestDist2 = Infinity;

  fromPoints.forEach((fp) => {
    toPoints.forEach((tp) => {
      const dx = fp.x - tp.x;
      const dy = fp.y - tp.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist2) {
        bestDist2 = d2;
        bestFrom = fp;
        bestTo = tp;
      }
    });
  });

  const x1 = bestFrom.x;
  const y1 = bestFrom.y;
  const x2 = bestTo.x;
  const y2 = bestTo.y;

  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  return {
    x1,
    y1,
    x2,
    y2,
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  };
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
      // (You can also handle add_shape / add_stroke here if you want)

      // 3) layout blocks inside aiRegion with NO OVERLAP, width from text
      const laidOut = layoutBlocksInRegion(blockOps, aiRegion);

      const newBlockElements = laidOut.map(
        ({ index, op, x, y, w, h, type, label }) => {
          const id = makeId();
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

      // 4) build arrows from block indices (using snap points)
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

          const ends = computeArrowEndpoints(fromEl, toEl);

          return {
            id: makeId(),
            type: "arrow",
            x: ends.x,
            y: ends.y,
            w: ends.w,
            h: ends.h,
            x1: ends.x1,
            y1: ends.y1,
            x2: ends.x2,
            y2: ends.y2,
          };
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

  // 🔽 This is your original styling + tip block
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
