// src/components/AiPanel.jsx
import { useCallback, useState } from "react";

const AI_STROKE_COLOR = "#ffffff"; // ✅ all AI strokes are white
const MIN_ARROW_GAP = 100;
const SIDE_PADDING = 32;

function makeId() {
  return (
    (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
    Math.random().toString(36).slice(2, 9)
  );
}

/**
 * Estimate how wide/tall a block should be based on its label & type.
 * Used so blocks are only as wide as their text, but not tiny.
 */
function estimateBlockSize(label, blockType, region) {
  const text =
    (typeof label === "string" ? label.trim() : "") ||
    (blockType === "text" ? "Heading" : "Text");

  const approxCharWidth = 10;
  const basePadding = 32;
  const minWidth = 140;
  const maxWidth = Math.max(minWidth, region.w * 0.8);

  const rawWidth = text.length * approxCharWidth + basePadding;
  const w = Math.max(minWidth, Math.min(maxWidth, rawWidth));

  const charsPerLine = Math.max(12, Math.floor(w / approxCharWidth));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  const lineHeight = blockType === "text" ? 28 : 22;
  const baseHeight = blockType === "text" ? 40 : 32;
  const h = baseHeight + (lines - 1) * lineHeight;

  return { w, h };
}

/**
 * Lay out blocks in one or more "lanes" (timelines) inside aiRegion.
 *
 * Each add_block can optionally have:
 *   lane: 0,1,2,...  (timeline index)
 *
 * Returns { placed, orientation }
 *   placed: [{ index, op, blockType, lane, x, y, w, h }]
 *   orientation: "horizontal" | "vertical"
 */
function layoutBlocksInRegion(blockOps, region) {
  if (!blockOps || blockOps.length === 0) {
    return { placed: [], orientation: "horizontal" };
  }

  const innerWidth = region.w - SIDE_PADDING * 2;
  const innerHeight = region.h - SIDE_PADDING * 2;

  // Group blocks by lane
  const lanes = new Map(); // laneIndex -> array of prepared blocks

  blockOps.forEach((op, index) => {
    const blockType = op.blockType === "text" ? "text" : "paragraph";
    const { w, h } = estimateBlockSize(op.label, blockType, region);

    let lane = 0;
    if (Number.isInteger(op.lane) && op.lane >= 0 && op.lane <= 16) {
      lane = op.lane;
    }

    if (!lanes.has(lane)) lanes.set(lane, []);
    lanes.get(lane).push({ index, op, blockType, lane, w, h });
  });

  const laneIndices = [...lanes.keys()].sort((a, b) => a - b);

  // Decide orientation based on region aspect ratio
  const aspect = innerWidth / Math.max(1, innerHeight);
  const orientation = aspect >= 1 ? "horizontal" : "vertical";

  const placed = [];

  if (orientation === "horizontal") {
    // lanes = rows
    const startX = region.x + SIDE_PADDING;
    const top = region.y + SIDE_PADDING;
    const availableHeight = Math.max(1, innerHeight);
    const laneCount = laneIndices.length;
    const laneGapY = laneCount > 1 ? availableHeight / (laneCount - 1) : 0;

    laneIndices.forEach((laneKey, laneIdx) => {
      const laneBlocks = lanes.get(laneKey) || [];
      const centerY = top + laneGapY * laneIdx;

      let x = startX;
      laneBlocks.forEach((b) => {
        const y = centerY - b.h / 2;
        placed.push({
          index: b.index,
          op: b.op,
          blockType: b.blockType,
          lane: b.lane,
          x,
          y,
          w: b.w,
          h: b.h,
        });
        x += b.w + MIN_ARROW_GAP; // 👈 ensures ≥100px between same-lane blocks
      });
    });
  } else {
    // lanes = columns
    const startY = region.y + SIDE_PADDING;
    const left = region.x + SIDE_PADDING;
    const availableWidth = Math.max(1, innerWidth);
    const laneCount = laneIndices.length;
    const laneGapX = laneCount > 1 ? availableWidth / (laneCount - 1) : 0;

    laneIndices.forEach((laneKey, laneIdx) => {
      const laneBlocks = lanes.get(laneKey) || [];
      const centerX = left + laneGapX * laneIdx;

      let y = startY;
      laneBlocks.forEach((b) => {
        const x = centerX - b.w / 2;
        placed.push({
          index: b.index,
          op: b.op,
          blockType: b.blockType,
          lane: b.lane,
          x,
          y,
          w: b.w,
          h: b.h,
        });
        y += b.h + MIN_ARROW_GAP;
      });
    });
  }

  return { placed, orientation };
}

/**
 * Helper: corners of a block (tl, tr, bl, br)
 */
function getCorners(el) {
  return [
    { x: el.x, y: el.y }, // top-left
    { x: el.x + el.w, y: el.y }, // top-right
    { x: el.x, y: el.y + el.h }, // bottom-left
    { x: el.x + el.w, y: el.y + el.h }, // bottom-right
  ];
}

/**
 * Build an arrow element between two blocks.
 *
 * - If blocks are in the same lane:
 *    - horizontal orientation: left→right, centered on Y
 *    - vertical orientation:   top→bottom, centered on X
 * - If blocks are in different lanes:
 *    - connect the pair of corners (one from each block) with MIN distance
 */
function buildArrowElement(fromEl, toEl, orientation) {
  const fromMidX = fromEl.x + fromEl.w / 2;
  const fromMidY = fromEl.y + fromEl.h / 2;
  const toMidX = toEl.x + toEl.w / 2;
  const toMidY = toEl.y + toEl.h / 2;

  const sameLane =
    typeof fromEl.lane === "number" &&
    typeof toEl.lane === "number" &&
    fromEl.lane === toEl.lane;

  let x1, y1, x2, y2;

  if (sameLane) {
    if (orientation === "horizontal") {
      // arrow along the row – center Y
      const fromRight = fromEl.x + fromEl.w;
      const toLeft = toEl.x;
      const midY = (fromMidY + toMidY) / 2;
      x1 = fromRight + 16;
      x2 = toLeft - 16;
      y1 = midY;
      y2 = midY;
    } else {
      // arrow along the column – center X
      const fromBottom = fromEl.y + fromEl.h;
      const toTop = toEl.y;
      const midX = (fromMidX + toMidX) / 2;
      y1 = fromBottom + 16;
      y2 = toTop - 16;
      x1 = midX;
      x2 = midX;
    }
  } else {
    // 🔁 Cross-lane arrow: connect the closest pair of corners
    const fromCorners = getCorners(fromEl);
    const toCorners = getCorners(toEl);

    let bestFrom = fromCorners[0];
    let bestTo = toCorners[0];
    let bestDist2 = Infinity;

    fromCorners.forEach((fc) => {
      toCorners.forEach((tc) => {
        const dx = fc.x - tc.x;
        const dy = fc.y - tc.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist2) {
          bestDist2 = d2;
          bestFrom = fc;
          bestTo = tc;
        }
      });
    });

    x1 = bestFrom.x;
    y1 = bestFrom.y;
    x2 = bestTo.x;
    y2 = bestTo.y;
  }

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

      // split by type
      const blockOps = operations.filter((op) => op && op.op === "add_block");
      const arrowOps = operations.filter((op) => op && op.op === "add_arrow");
      const strokePathOps = operations.filter(
        (op) => op && op.op === "add_stroke_path"
      );

      // 2) layout blocks inside aiRegion with NO OVERLAP
      const { placed, orientation } = layoutBlocksInRegion(blockOps, aiRegion);

      const newBlockElements = placed.map(
        ({ index, op, x, y, w, h, blockType, lane }) => {
          const id = makeId();

          let type;
          if (blockType === "text") type = "text";
          else if (blockType === "paragraph") type = "paragraph";
          else type = "box"; // fallback

          let label = typeof op.label === "string" ? op.label.trim() : "";
          if (!label) {
            if (type === "latex") label = "$$x^2 + y^2$$";
            else if (type === "text") label = "Heading";
            else if (type === "paragraph") label = "Type your paragraph…";
            else label = "Text";
          }

          const role =
            typeof op.role === "string" ? op.role.toLowerCase() : "normal";

          return {
            id,
            blockIndex: index, // index in blockOps array
            type,
            x,
            y,
            w,
            h,
            label,
            lane,
            role, // optional semantic info (start/end/normal)
          };
        }
      );

      const findBlockByIndex = (idx) =>
        newBlockElements.find((el) => el.blockIndex === idx);

      // 3) build arrows (including cross-lane with corner-corner)
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

      // 4) convert stroke paths to canvas strokes (forced to white)
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

      // 5) update board
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
