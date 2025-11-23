# server/main.py
import os
import json
import re
from typing import Any, List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

import google.generativeai as genai

# ---------- config ----------

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
  raise RuntimeError("GEMINI_API_KEY not found in environment/.env")

genai.configure(api_key=api_key)

# use a current model name; change to pro if you want
model = genai.GenerativeModel("gemini-2.5-flash-lite")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AiDrawRequest(BaseModel):
  prompt: str


class AiDrawResponse(BaseModel):
  operations: List[Any]


# ---------- limits ----------

MAX_BLOCKS = 16
MAX_ARROWS = 24
MAX_STROKES = 16
MAX_SHAPES = 16
MAX_STROKE_PATHS = 6
MAX_LABEL_CHARS = 80


# ---------- helpers ----------

def _extract_json_block(text: str) -> str:
  """
  Try to pull the JSON from Gemini's response, stripping ``` fences.
  """
  m = re.search(r"```json(.*?)```", text, re.DOTALL | re.IGNORECASE)
  if not m:
    m = re.search(r"```(.*?)```", text, re.DOTALL)
  if m:
    text = m.group(1)
  return text.strip()


def _clean_label(raw: Any) -> str:
  if not isinstance(raw, str):
    return ""
  label = raw.strip()
  if not label:
    return ""
  # collapse whitespace
  label = re.sub(r"\s+", " ", label)
  # strip quotes
  if (label.startswith('"') and label.endswith('"')) or (
      label.startswith("'") and label.endswith("'")
  ):
    label = label[1:-1].strip()
  # remove trailing punctuation (except ?!)
  if not re.search(r"[!?]$", label):
    label = re.sub(r"[.,;:]+$", "", label)
  # word + char limits
  words = label.split(" ")
  if len(words) > 8:
    label = " ".join(words[:8])
  if len(label) > MAX_LABEL_CHARS:
    label = label[: MAX_LABEL_CHARS - 1] + "…"
  return label


def _parse_operations(text: str) -> List[dict]:
  """
  Parse Gemini text into a list of operation dicts and do light validation.
  Enforces caps on blocks/arrows/etc and label length.
  """
  text = _extract_json_block(text)

  data = None
  try:
    data = json.loads(text)
  except json.JSONDecodeError:
    # maybe it's already {"operations":[...]} as text
    try:
      start = text.find("{")
      end = text.rfind("}")
      if start != -1 and end != -1 and end > start:
        data = json.loads(text[start : end + 1])
    except Exception:
      data = None

  if data is None:
    return []

  if isinstance(data, dict):
    ops = data.get("operations", data.get("ops"))
  else:
    ops = data

  if not isinstance(ops, list):
    return []

  cleaned: List[dict] = []

  counts = {
    "add_block": 0,
    "add_arrow": 0,
    "add_stroke": 0,
    "add_shape": 0,
    "add_stroke_path": 0,
  }

  for op in ops:
    if not isinstance(op, dict):
      continue

    kind = op.get("op")
    if kind not in {
      "add_block",
      "add_arrow",
      "add_stroke",
      "add_shape",
      "add_stroke_path",
    }:
      continue

    # enforce per-kind caps
    if kind == "add_block" and counts["add_block"] >= MAX_BLOCKS:
      continue
    if kind == "add_arrow" and counts["add_arrow"] >= MAX_ARROWS:
      continue
    if kind == "add_stroke" and counts["add_stroke"] >= MAX_STROKES:
      continue
    if kind == "add_shape" and counts["add_shape"] >= MAX_SHAPES:
      continue
    if kind == "add_stroke_path" and counts["add_stroke_path"] >= MAX_STROKE_PATHS:
      continue

    # basic constraints
    if kind == "add_stroke_path":
      pts = op.get("points")
      if not isinstance(pts, list) or len(pts) < 4:
        continue
      # clamp u,v server-side too
      new_pts = []
      for p in pts:
        if not isinstance(p, dict):
          continue
        try:
          u = float(p.get("u", 0.0))
          v = float(p.get("v", 0.0))
        except (TypeError, ValueError):
          continue
        new_pts.append({
          "u": max(0.0, min(1.0, u)),
          "v": max(0.0, min(1.0, v)),
        })
      if len(new_pts) < 4:
        continue
      op["points"] = new_pts

    if kind in {"add_block", "add_shape"}:
      # clamp normalized coords if present
      for key in ("x", "y", "w", "h", "cx", "cy", "rx", "ry",
                  "x1", "y1", "x2", "y2"):
        if key in op:
          try:
            val = float(op[key])
          except (TypeError, ValueError):
            continue
          op[key] = max(0.0, min(1.0, val))

    # normalize block fields
    if kind == "add_block":
      block_type = op.get("blockType")
      if block_type not in ("text", "paragraph"):
        # default to paragraph if it's something else
        op["blockType"] = "paragraph"

      op["label"] = _clean_label(op.get("label"))

    # sanitize add_arrow indices
    if kind == "add_arrow":
      for field in ("from", "to"):
        idx_val = op.get(field)
        if not isinstance(idx_val, int):
          # try coercion
          try:
            idx_val = int(idx_val)
          except (TypeError, ValueError):
            idx_val = None
        if idx_val is None or idx_val < 0:
          # invalid arrow
          break
        op[field] = idx_val

    cleaned.append(op)
    counts[kind] += 1

    if len(cleaned) >= 80:  # hard cap per call
      break

  return cleaned


def _build_system_instructions(user_prompt: str) -> str:
  """
  Describe the JSON drawing DSL to Gemini, with a precise, minimal schema.
  Now supports multiple timelines (lanes) and start/end roles.
  """
  return f"""
You are an AI diagram and doodle assistant for a zoomable canvas.

The user has selected a rectangular "AI Region" and given this prompt:

\"\"\"{user_prompt}\"\"\"


You must RETURN ONLY JSON in this exact top-level shape:

{{
  "operations": [ Operation, ... ]
}}

No prose, no comments, no explanations. Just that JSON object.

Each Operation is one of the following forms.

1) Add a text/paragraph block (node)
-------------------------------------

{{
  "op": "add_block",
  "blockType": "text" | "paragraph",

  // label for the node (keep SHORT)
  "label": "short label (1-6 words, <= 60 chars, no newlines)",

  // OPTIONAL: which timeline / swimlane this node belongs to.
  // Use small non-negative integers (0, 1, 2, ...).
  // All nodes with the same lane are laid out along the same row or column.
  "lane": 0,

  // OPTIONAL: the semantic role of this node in its lane
  // (used by the client to highlight or interpret timelines).
  "role": "start" | "end" | "normal",

  // OPTIONAL coarse size hints – the client uses them only as rough hints.
  // Values in [0,1] relative to the AI Region.
  "w": 0.2,
  "h": 0.15
}}

Rules:
- LABELS MUST BE SHORT: 1–6 words, no line breaks, no paragraphs.
- 0 <= w,h <= 1 if you provide them; they are just hints.
- "text" is a heading; "paragraph" is smaller explanatory text.
- Use "lane" to create multiple timelines:
  - lane 0 = first timeline,
  - lane 1 = second timeline, etc.
- Within each lane, you can indicate the first and last node using
  "role": "start" and "role": "end" (otherwise omit or use "normal").
- Emit AT MOST {MAX_BLOCKS} add_block operations. Prefer 3–12.

2) Add an arrow between two nodes
----------------------------------

Indexes refer to the ORDER of add_block operations (0-based):

{{
  "op": "add_arrow",
  "from": 0,
  "to": 1
}}

Rules:
- Only use indices that correspond to existing add_block operations.
- Arrows show flow or dependencies (e.g. timeline, cause/effect).
- It is valid to connect nodes across lanes (e.g. handoff between timelines).
- Hard limit: AT MOST {MAX_ARROWS} arrows.
- Prefer a minimal, readable graph, not a dense tangle.

3) Add a decorative stroke around a node
----------------------------------------

{{
  "op": "add_stroke",
  "target": 0,
  "shape": "underline" | "circle" | "highlight",
  "color": "#f97316",
  "width": 3
}}

Use sparingly (<= {MAX_STROKES}) to emphasize especially important nodes.

4) Add a symbolic shape (circle / ellipse / rect / line)
--------------------------------------------------------

Coordinates are normalized to the inner AI Region ([0,1]):

{{
  "op": "add_shape",
  "shapeType": "circle" | "ellipse" | "rect" | "line",

  // for circle / ellipse / rect:
  "cx": 0.5,
  "cy": 0.3,
  "rx": 0.15,
  "ry": 0.10,

  // for line:
  "x1": 0.2,
  "y1": 0.5,
  "x2": 0.8,
  "y2": 0.5,

  "strokeColor": "#e5e7eb",
  "strokeWidth": 2
}}

5) Add a freehand stroke path
------------------------------

{{
  "op": "add_stroke_path",
  "color": "#e5e7eb",
  "width": 2,
  "points": [
    {{ "u": 0.10, "v": 0.20 }},
    {{ "u": 0.12, "v": 0.25 }},
    ...
  ]
}}

Rules:
- u, v in [0,1] inside the region.
- Use BETWEEN 30 AND 200 points for a visible stroke.
- Keep strokes inside 0.05 <= u,v <= 0.95.
- Use at most {MAX_STROKE_PATHS} stroke paths.

General style rules
-------------------
- Think like a graph drawer: define nodes and edges in a few parallel timelines.
- Prefer:
  - Several concise nodes across one or more lanes (timelines).
  - A limited number of arrows showing the main flow.
- Never output anything except a valid JSON object with an "operations" array.
"""


@app.post("/ai-draw", response_model=AiDrawResponse)
async def ai_draw(req: AiDrawRequest):
  system_text = _build_system_instructions(req.prompt)

  response = model.generate_content(
    [
      {"role": "user", "parts": [{"text": system_text}]}
    ],
  )

  text = response.text or ""
  ops = _parse_operations(text)

  return {"operations": ops}
