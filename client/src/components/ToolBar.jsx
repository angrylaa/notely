// src/components/ToolBar.js
import { useCamera } from "../context/CameraContext";

export default function ToolBar({
  selectedId,
  onDeleteSelected,
  onClearBoard,
}) {
  const { camera, setCamera } = useCamera();

  const resetView = () => setCamera({ x: 0, y: 0, zoom: 1 });
  const zoomIn = () =>
    setCamera((prev) => ({ ...prev, zoom: prev.zoom * 1.2 }));
  const zoomOut = () =>
    setCamera((prev) => ({ ...prev, zoom: prev.zoom / 1.2 }));

  const buttonBase = {
    padding: "4px 8px",
    borderRadius: 4,
    border: "2px solid #4b5563",
    background: "#020617",
    color: "white",
    cursor: "pointer",
    fontSize: 16,
    fontFamily: "angela",
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        padding: "8px 12px",
        borderRadius: 8,
        background: "rgba(15,23,42,0.9)",
        display: "flex",
        gap: 8,
        alignItems: "center",
        zIndex: 20,
        fontSize: 14,
        fontFamily: "angela",
      }}
    >
      <button style={buttonBase} onClick={zoomOut}>
        -
      </button>
      <button style={buttonBase} onClick={zoomIn}>
        +
      </button>
      <button style={buttonBase} onClick={resetView}>
        Reset
      </button>

      <span style={{ marginLeft: 8, opacity: 0.8 }}>
        Zoom: {camera.zoom.toFixed(3)}
      </span>

      <span style={{ marginLeft: 16 }}>
        {selectedId ? `Selected: ${selectedId}` : "No selection"}
      </span>

      <button
        style={{ ...buttonBase, marginLeft: 8 }}
        onClick={onDeleteSelected}
        disabled={!selectedId}
      >
        Delete
      </button>
      <button onClick={onClearBoard} style={{ ...buttonBase, marginLeft: 8 }}>
        Clear board
      </button>
    </div>
  );
}
