// src/components/ScreenCanvas.jsx
import { useEffect, useRef, useState } from "react";
import starterImgSrc from "../assets/starter.png";
import { useCamera } from "../context/CameraContext";
import InlineEditor from "./InlineEditor";

import {
  eraseAt,
  getArrowEndpointHit,
  hitTestElement,
  isOnResizeHandle,
  roundedRectPath,
  screenToWorld,
  snapPointToBoxes,
  stripLatexDelimiters,
  withArrowBounds,
} from "../utils/canvasGeometry";

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

    // components
    ctx.font = `${16 / camera.zoom}px "angela"`;

    elements.forEach((rawEl) => {
      const el = rawEl.type === "arrow" ? withArrowBounds(rawEl) : rawEl;
      const isSelected = el.id === selectedId;
      const type = el.type || "box";

      if (type === "arrow") {
        const x1 = el.x1 ?? el.x;
        const y1 = el.y1 ?? el.y;
        const x2 = el.x2 ?? el.x + el.w;
        const y2 = el.y2 ?? el.y + el.h;

        ctx.strokeStyle = isSelected ? "#facc15" : "#e5e7eb";
        ctx.lineWidth = 2 / camera.zoom;

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
          const r = 6 / camera.zoom;
          ctx.fillStyle = "#f97316";
          ctx.strokeStyle = "#0f172a";
          ctx.lineWidth = 1 / camera.zoom;

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

      // box / latex – rounded rect + centered, clipped text
      const isLatex = type === "latex";

      ctx.fillStyle = "#020617";
      ctx.strokeStyle = isSelected ? "#facc15" : "#4b5563";
      ctx.lineWidth = 2 / camera.zoom;

      // 1) draw rounded rect
      roundedRectPath(ctx, el.x, el.y, el.w, el.h, 12);

      // 2) fill + stroke
      ctx.fill();
      ctx.stroke();

      // 3) clip to this rounded rect so text can't escape
      ctx.save();
      roundedRectPath(ctx, el.x, el.y, el.w, el.h, 12);
      ctx.clip();

      // 4) centered text (with support for multiple lines)
      ctx.fillStyle = "#e5e7eb";
      let text = el.label || "";
      if (isLatex) text = stripLatexDelimiters(text) || "LaTeX";

      const cx = el.x + el.w / 2;
      const cy = el.y + el.h / 2;
      const lines = text.split("\n");
      const lineHeight = 18 / camera.zoom;

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      lines.forEach((line, i) => {
        const offset = (i - (lines.length - 1) / 2) * lineHeight;
        ctx.fillText(line, cx, cy + offset);
      });

      ctx.restore();

      // restore defaults for safety
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";

      // resize handle
      if (isSelected) {
        const handleSize = 7 / camera.zoom;
        const hx = el.x + el.w;
        const hy = el.y + el.h;

        ctx.fillStyle = "#facc15";
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 1 / camera.zoom;

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
    });

    // strokes
    if (strokes && strokes.length > 0) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      strokes.forEach((stroke) => {
        if (!stroke.points || stroke.points.length < 2) return;

        const color = stroke.color || "#e5e7eb";
        const widthWorld = stroke.width || 2;

        ctx.strokeStyle = color;
        ctx.lineWidth = widthWorld / camera.zoom;

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

      // if selected box/latex, check resize handle
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
      const sxp = snapped.x;
      const syp = snapped.y;

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
        const newX = wx - offsetX;
        const newY = wy - offsetY;

        setElements((prev) =>
          prev.map((el) => (el.id === id ? { ...el, x: newX, y: newY } : el))
        );
      } else if (state.kind === "arrow") {
        const { id, startWx, startWy, startX1, startY1, startX2, startY2 } =
          state;
        const dx = wx - startWx;
        const dy = wy - startWy;

        let x1 = startX1 + dx;
        let y1 = startY1 + dy;
        let x2 = startX2 + dx;
        let y2 = startY2 + dy;

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
        const x1 = wx - half;
        const y1 = wy;
        const x2 = wx + half;
        const y2 = wy;

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
      } else {
        newElement = {
          id,
          x: wx - w / 2,
          y: wy - h / 2,
          w,
          h,
          label: key === "latex" ? "$$x^2 + y^2$$" : label || "Box",
          type: key, // "latex" | "box"
        };
      }

      setElements((prev) => [...prev, newElement]);
      setSelectedId(id);

      // auto-deselect template after one placement
      setPendingTemplate(null);
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

    // double-click to edit box / latex text
    const hit = elements
      .slice()
      .reverse()
      .find((el) => hitTestElement(el, wx, wy) && el.type !== "arrow");

    if (hit) {
      const type = hit.type || "box";
      if (type === "box" || type === "latex") {
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

  const handleWheel = (e) => {
    e.preventDefault();

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

  // ---------- editing helpers ----------

  const commitEditing = () => {
    if (!editing) return;
    const { id, text } = editing;
    setElements((prev) =>
      prev.map((el) => (el.id === id ? { ...el, label: text } : el))
    );
    setEditing(null);
  };

  const handleEditorTextChange = (text) => {
    setEditing((prev) => (prev ? { ...prev, text } : prev));
  };

  // ---------- render ----------

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

      <InlineEditor
        editing={editing}
        elements={elements}
        camera={camera}
        viewport={viewport}
        editorRef={editorRef}
        onChangeText={handleEditorTextChange}
        onCommit={commitEditing}
      />
    </div>
  );
}
