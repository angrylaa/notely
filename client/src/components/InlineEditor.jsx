// src/components/InlineEditor.jsx
import { worldToScreen } from "../utils/canvasGeometry";

export default function InlineEditor({
  editing,
  elements,
  camera,
  viewport,
  editorRef,
  onChangeText,
  onCommit,
}) {
  if (!editing) return null;

  const el = elements.find((e) => e.id === editing.id);
  if (!el) return null;

  const { sx, sy } = worldToScreen(
    el.x,
    el.y,
    camera,
    viewport.width,
    viewport.height
  );

  const sw = el.w * camera.zoom;
  const sh = el.h * camera.zoom;

  const editorStyle = {
    overflow: "hidden",
    position: "absolute",
    left: sx,
    top: sy,
    width: sw,
    height: sh,
    fontSize: 14,
    padding: "6px 8px",
    borderRadius: 8,
    border: "1px solid #facc15",
    background: "rgba(15,23,42,0.97)",
    color: "#e5e7eb",
    resize: "none",
    outline: "none",
    boxSizing: "border-box",
    zIndex: 10,
    textAlign: "center",
    fontFamily: "angela",
  };

  const handleKeyDown = (e) => {
    // Enter commits; Shift+Enter for newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onCommit();
    }
  };

  return (
    <textarea
      ref={editorRef}
      style={editorStyle}
      value={editing.text}
      onChange={(e) => onChangeText(e.target.value)}
      onBlur={onCommit}
      onKeyDown={handleKeyDown}
    />
  );
}
