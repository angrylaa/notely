// src/components/GlobalCanvas.jsx
import { useState } from "react";
import { CameraProvider } from "../context/CameraContext";
import ScreenCanvas from "./ScreenCanvas";
import SideBar from "./SideBar";
import ToolBar from "./ToolBar";

export default function GlobalCanvas() {
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

  // 🧩 currently selected component template from the library
  const [pendingTemplate, setPendingTemplate] = useState(null);

  const handleDeleteSelected = () => {
    if (!selectedId) return;
    setElements((prev) => prev.filter((el) => el.id !== selectedId));
    setSelectedId(null);
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
          fontFamily: "custom",
        }}
      >
        <ToolBar
          selectedId={selectedId}
          onDeleteSelected={handleDeleteSelected}
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
