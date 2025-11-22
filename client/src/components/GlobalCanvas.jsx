// src/components/GlobalCanvas.jsx
import { useEffect, useState } from "react";
import { CameraProvider } from "../context/CameraContext";
import { loadBoardState, saveBoardState } from "../utils/canvasGeometry";
import ScreenCanvas from "./ScreenCanvas";
import SideBar from "./SideBar";
import ToolBar from "./ToolBar";

export default function GlobalCanvas() {
  const [elements, setElements] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [strokes, setStrokes] = useState([]);
  const [mode, setMode] = useState("pan");
  const [bookmarks, setBookmarks] = useState([]);
  const [strokeColor, setStrokeColor] = useState("#e5e7eb");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [pendingTemplate, setPendingTemplate] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = loadBoardState();
    if (saved) {
      setElements(saved.elements || []);
      setStrokes(saved.strokes || []);
      setBookmarks(saved.bookmarks || []);
      if (saved.strokeColor) setStrokeColor(saved.strokeColor);
      if (saved.strokeWidth) setStrokeWidth(saved.strokeWidth);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;

    saveBoardState({
      elements,
      strokes,
      bookmarks,
      strokeColor,
      strokeWidth,
    });
  }, [elements, strokes, bookmarks, strokeColor, strokeWidth, hydrated]);

  const handleDeleteSelected = () => {
    if (!selectedId) return;
    setElements((prev) => prev.filter((el) => el.id !== selectedId));
    setSelectedId(null);
  };

  const handleClearBoard = () => {
    // optional: confirmation
    if (!window.confirm("Clear the entire board? This cannot be undone.")) {
      return;
    }
    setElements([]);
    setStrokes([]);
    setBookmarks([]);
    setSelectedId(null);
    setPendingTemplate(null);
    // stroke settings left as-is; remove next 2 lines if you want to reset them too
    // setStrokeColor("#e5e7eb");
    // setStrokeWidth(2);
  };

  return (
    <CameraProvider>
      <div
        style={{
          width: "100vw",
          height: "100vh",
          position: "relative",
          overflow: "hidden",
          background: "#020617",
          color: "white",
          fontFamily: "angela, system-ui, sans-serif",
        }}
      >
        <ToolBar
          selectedId={selectedId}
          onDeleteSelected={handleDeleteSelected}
          onClearBoard={handleClearBoard} // 👈 new
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
      </div>
    </CameraProvider>
  );
}
