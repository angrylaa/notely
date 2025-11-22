// src/components/SideBar.jsx
import { useCamera } from "../context/CameraContext";

export default function SideBar({
  mode,
  setMode,
  bookmarks,
  setBookmarks,
  strokeColor,
  setStrokeColor,
  strokeWidth,
  setStrokeWidth,
  elements,
  setElements, // still here if you need it later
  pendingTemplate, // 👈 new
  setPendingTemplate, // 👈 new
}) {
  const { camera, setCamera } = useCamera();

  const btnBase = {
    width: "100%",
    padding: "6px 8px",
    borderRadius: 6,
    border: "1px solid #4b5563",
    background: "#020617",
    color: "white",
    cursor: "pointer",
    fontSize: 12,
    textAlign: "left",
    letterSpacing: 1,
  };

  // === bookmarks ===
  const addBookmark = () => {
    const defaultLabel = `View ${bookmarks.length + 1}`;
    const label = window.prompt("Name this bookmark", defaultLabel);
    if (!label) return;

    const id =
      (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
      Date.now().toString();

    setBookmarks((prev) => [
      ...prev,
      { id, label: label.trim() || defaultLabel, camera: { ...camera } },
    ]);
  };

  const goToBookmark = (bm) => setCamera({ ...bm.camera });

  const deleteBookmark = (id) =>
    setBookmarks((prev) => prev.filter((b) => b.id !== id));

  // === stroke settings ===
  const strokeColors = [
    "#e5e7eb",
    "#f97316",
    "#22c55e",
    "#3b82f6",
    "#a855f7",
    "#ef4444",
  ];
  const strokeWidths = [1, 2, 4, 8];

  // === component library ===
  const componentTemplates = [
    { key: "latex", label: "LaTeX", w: 200, h: 80 },
    { key: "arrow", label: "Arrow", w: 200, h: 0 },
    { key: "box", label: "Box", w: 180, h: 100 },
    { key: "text", label: "Heading", w: 320, h: 80 },
    { key: "paragraph", label: "Paragraph", w: 360, h: 120 },
  ];

  const selectTemplate = (tpl) => {
    setPendingTemplate(tpl);
    // stay in whatever mode; usually you'll be in "pan" to click-place
  };

  const clearTemplate = () => setPendingTemplate(null);

  return (
    <div
      style={{
        position: "absolute",
        top: 80,
        left: 12,
        width: 230,
        padding: 10,
        borderRadius: 10,
        background: "rgba(15,23,42,0.95)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 15,
        maxHeight: "80vh",
        overflowY: "auto",
        fontFamily: "angela",
        letterSpacing: 1.5,
      }}
    >
      {/* Tools */}
      <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 4 }}>Tools</div>

      <button
        style={{
          ...btnBase,
          background: mode === "pan" ? "#1e293b" : "#020617",
        }}
        onClick={() => setMode("pan")}
      >
        🖐 Pan
      </button>

      <button
        style={{
          ...btnBase,
          background: mode === "draw" ? "#1e293b" : "#020617",
        }}
        onClick={() => setMode("draw")}
      >
        ✏️ Draw
      </button>

      <button
        style={{
          ...btnBase,
          background: mode === "erase" ? "#1e293b" : "#020617",
        }}
        onClick={() => setMode("erase")}
      >
        🩹 Eraser
      </button>

      {/* Stroke settings */}
      <div
        style={{
          fontSize: 14,
          opacity: 0.8,
          marginTop: 10,
          marginBottom: 4,
        }}
      >
        Stroke color
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {strokeColors.map((c) => (
          <button
            key={c}
            onClick={() => setStrokeColor(c)}
            style={{
              width: 20,
              height: 20,
              borderRadius: "999px",
              border:
                strokeColor === c ? "2px solid white" : "1px solid #4b5563",
              backgroundColor: c,
              cursor: "pointer",
            }}
          />
        ))}
      </div>

      <div
        style={{
          fontSize: 14,
          opacity: 0.8,
          marginTop: 10,
          marginBottom: 4,
        }}
      >
        Stroke width
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {strokeWidths.map((w) => (
          <button
            key={w}
            onClick={() => setStrokeWidth(w)}
            style={{
              ...btnBase,
              padding: "4px 6px",
              width: "auto",
              flex: "0 0 auto",
              background: strokeWidth === w ? "#1e293b" : "#020617",
            }}
          >
            {w}px
          </button>
        ))}
      </div>

      {/* Bookmarks */}
      <div
        style={{
          fontSize: 14,
          opacity: 0.8,
          marginTop: 10,
          marginBottom: 4,
        }}
      >
        Bookmarks
      </div>

      <button style={btnBase} onClick={addBookmark}>
        ⭐ Add bookmark here
      </button>

      {bookmarks.length === 0 && (
        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
          No bookmarks yet.
        </div>
      )}

      {bookmarks.map((bm) => (
        <div
          key={bm.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            marginTop: 4,
          }}
        >
          <button
            style={{
              ...btnBase,
              padding: "4px 6px",
              fontSize: 12,
              flex: 1,
            }}
            onClick={() => goToBookmark(bm)}
          >
            📍 {bm.label}
          </button>
          <button
            style={{
              ...btnBase,
              padding: "4px 6px",
              width: 28,
              textAlign: "center",
            }}
            onClick={() => deleteBookmark(bm.id)}
            title="Delete bookmark"
          >
            ✕
          </button>
        </div>
      ))}

      {/* Component Library */}
      <div
        style={{
          fontSize: 12,
          opacity: 0.8,
          marginTop: 10,
          marginBottom: 4,
        }}
      >
        Component Library
      </div>

      {componentTemplates.map((tpl) => {
        const isActive = pendingTemplate?.key === tpl.key;
        return (
          <button
            key={tpl.key}
            style={{
              ...btnBase,
              padding: "4px 6px",
              fontSize: 12,
              marginTop: 4,
              background: isActive ? "#1e293b" : "#020617",
            }}
            onClick={() => selectTemplate(tpl)}
          >
            ⬛ {tpl.label}
          </button>
        );
      })}

      {pendingTemplate && (
        <button
          style={{
            ...btnBase,
            padding: "4px 6px",
            fontSize: 11,
            marginTop: 6,
            opacity: 0.8,
          }}
          onClick={clearTemplate}
        >
          ❌ Clear selected component
        </button>
      )}

      <div
        style={{
          fontSize: 11,
          opacity: 0.6,
          marginTop: 6,
        }}
      >
        {elements.length} component
        {elements.length === 1 ? "" : "s"} on canvas
      </div>
    </div>
  );
}
