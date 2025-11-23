// src/components/GlobalCanvas.jsx
import { useEffect, useRef, useState } from "react";
import { CameraProvider, useCamera } from "../context/CameraContext";
import { loadBoardState, saveBoardState } from "../utils/persistence";
import AiPanel from "./AiPanel"; // 🧠 AI companion
import ScreenCanvas from "./ScreenCanvas";
import SideBar from "./SideBar";
import ToolBar from "./ToolBar";

// small wrapper so we can access camera inside the provider
function CanvasWithState() {
  // elements on the canvas
  const [elements, setElements] = useState([]); // starts empty
  const [selectedId, setSelectedId] = useState(null);

  // freehand strokes
  const [strokes, setStrokes] = useState([]);

  // tools
  const [mode, setMode] = useState("pan"); // "pan" | "draw" | "erase"

  // bookmarks
  const [bookmarks, setBookmarks] = useState([]);

  // stroke settings
  const [strokeColor, setStrokeColor] = useState("#e5e7eb");
  const [strokeWidth, setStrokeWidth] = useState(2);

  // currently selected component template from the library
  const [pendingTemplate, setPendingTemplate] = useState(null);

  const { camera, setCamera } = useCamera();

  // hidden file input for importing board JSON
  const fileInputRef = useRef(null);

  // ---- load from localStorage on first mount ----
  useEffect(() => {
    const saved = loadBoardState();
    if (!saved) return;

    if (Array.isArray(saved.elements)) {
      setElements(saved.elements);
    }
    if (Array.isArray(saved.strokes)) {
      setStrokes(saved.strokes);
    }
    if (Array.isArray(saved.bookmarks)) {
      setBookmarks(saved.bookmarks);
    }
    if (saved.camera) {
      setCamera(saved.camera);
    }
  }, [setCamera]);

  // ---- persist to localStorage whenever board or camera changes ----
  useEffect(() => {
    saveBoardState({
      elements,
      strokes,
      bookmarks,
      camera,
    });
  }, [elements, strokes, bookmarks, camera]);

  const handleDeleteSelected = () => {
    if (!selectedId) return;
    setElements((prev) => prev.filter((el) => el.id !== selectedId));
    setSelectedId(null);
  };

  const handleClearAll = () => {
    setElements([]);
    setStrokes([]);
    setSelectedId(null);
    setBookmarks([]);

    // also clear persisted state
    saveBoardState({
      elements: [],
      strokes: [],
      bookmarks: [],
      camera, // keep current camera or reset if you want
    });
  };

  // ---------- EXPORT / IMPORT ----------

  const handleExport = () => {
    try {
      const snapshot = {
        elements,
        strokes,
        bookmarks,
        camera,
      };

      const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
        type: "application/json",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `canvas-board-${dateStr}.json`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export board:", err);
      alert("Failed to export board.");
    }
  };

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleImportFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result;
        const parsed = JSON.parse(text || "{}");

        const nextElements = Array.isArray(parsed.elements)
          ? parsed.elements
          : [];
        const nextStrokes = Array.isArray(parsed.strokes) ? parsed.strokes : [];
        const nextBookmarks = Array.isArray(parsed.bookmarks)
          ? parsed.bookmarks
          : [];
        const nextCamera = parsed.camera || null;

        setElements(nextElements);
        setStrokes(nextStrokes);
        setBookmarks(nextBookmarks);
        if (nextCamera) {
          setCamera(nextCamera);
        }

        // keep localStorage in sync too
        saveBoardState({
          elements: nextElements,
          strokes: nextStrokes,
          bookmarks: nextBookmarks,
          camera: nextCamera || camera,
        });
      } catch (err) {
        console.error("Failed to import board:", err);
        alert("Failed to import board: invalid file.");
      } finally {
        // reset input so you can re-import the same file later if needed
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  return (
    <>
      {/* Hidden file input for importing a JSON board snapshot */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        style={{ display: "none" }}
        onChange={handleImportFile}
      />

      <ToolBar
        selectedId={selectedId}
        onDeleteSelected={handleDeleteSelected}
        onClearBoard={handleClearAll}
        onExport={handleExport}
        onImport={handleImportClick}
      />

      <SideBar
        mode={mode}
        setMode={setMode}
        bookmarks={bookmarks}
        setBookmarks={setBookmarks}
        strokeColor={strokeColor}
        setStrokeColor={setStrokeColor}
        strokeWidth={strokeWidth}
        setStrokeWidth={setStrokeWidth}
        elements={elements}
        setElements={setElements}
        pendingTemplate={pendingTemplate}
        setPendingTemplate={setPendingTemplate}
      />

      <ScreenCanvas
        mode={mode}
        elements={elements}
        setElements={setElements}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        strokes={strokes}
        setStrokes={setStrokes}
        strokeColor={strokeColor}
        strokeWidth={strokeWidth}
        pendingTemplate={pendingTemplate}
        setPendingTemplate={setPendingTemplate}
      />

      {/* 🧠 Gemini AI drawing companion – uses selected AI Region */}
      <AiPanel
        elements={elements}
        setElements={setElements}
        strokes={strokes}
        setStrokes={setStrokes}
        selectedId={selectedId}
      />
    </>
  );
}

export default function GlobalCanvas() {
  return (
    <CameraProvider>
      <div
        style={{
          width: "100vw",
          height: "100vh",
          position: "relative",
          overscrollBehavior: "none", // <- add this
          overflow: "hidden",
          background: "#020617",
          color: "white",
          fontFamily: "angela, system-ui, sans-serif",
        }}
      >
        <CanvasWithState />
      </div>
    </CameraProvider>
  );
}
