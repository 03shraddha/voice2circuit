"""
Schemdraw circuit renderer.
Reads a CircuitDrawing JSON object from stdin, renders it with Schemdraw,
and writes {"svg": "..."} JSON to stdout.
"""
import sys
import json
import os
import tempfile

# Use non-interactive backend before importing schemdraw/matplotlib
os.environ.setdefault("MPLBACKEND", "Agg")

try:
    import matplotlib
    matplotlib.use("Agg")
    import schemdraw
    import schemdraw.elements as elm
except ImportError as e:
    print(json.dumps({"error": f"Missing dependency: {e}. Run: pip3 install schemdraw matplotlib"}),
          file=sys.stderr)
    sys.exit(1)

# Map DSL type strings to Schemdraw element classes
ELEMENT_MAP = {
    "resistor":       elm.Resistor,
    "capacitor":      elm.Capacitor,
    "inductor":       elm.Inductor,
    "npn_bjt":        elm.BjtNpn,
    "pnp_bjt":        elm.BjtPnp,
    "nmos":           elm.NFet,
    "pmos":           elm.PFet,
    "diode":          elm.Diode,
    "led":            elm.LED,
    "zener":          elm.Zener,
    "opamp":          elm.Opamp,
    "voltage_source": elm.SourceV,
    "current_source": elm.SourceI,
    "battery":        elm.Battery,
    "ground":         elm.Ground,
    "vcc":            elm.Vdd,   # Schemdraw 0.15+ uses Vdd for VCC power rail
    "wire":           elm.Line,
    "line":           elm.Line,
    "dot":            elm.Dot,
}

# Multi-terminal elements: which attribute is the natural "input" anchor
ANCHOR_MAP = {
    "npn_bjt":  "base",
    "pnp_bjt":  "base",
    "nmos":     "gate",
    "pmos":     "gate",
    "opamp":    "in1",
}

# Elements that shouldn't get an auto label
NO_LABEL_TYPES = {"ground", "vcc", "dot", "wire", "line"}


def render(data):
    drawing_spec = data.get("drawing", [])
    title = data.get("title", "Circuit")

    placed = {}  # id -> schemdraw element reference

    d = schemdraw.Drawing()

    for spec in drawing_spec:
        elem_type = spec.get("type")
        cls = ELEMENT_MAP.get(elem_type)
        if cls is None:
            continue

        elem = cls()

        # Direction
        direction = spec.get("direction", "right")
        getattr(elem, direction, lambda: None)()

        # Modifiers
        if spec.get("flip"):
            elem.flip()
        if spec.get("reverse"):
            elem.reverse()
        if spec.get("length"):
            elem.length(spec["length"])

        # Label: "R1\n10kΩ" style, skipped for power/wire/dot
        if elem_type not in NO_LABEL_TYPES:
            label_parts = []
            if spec.get("label"):
                label_parts = [spec["label"]]
            else:
                if spec.get("id"):
                    label_parts.append(spec["id"])
                if spec.get("value"):
                    label_parts.append(spec["value"])
            if label_parts:
                elem.label("\n".join(label_parts))

        # Anchor position: resolve "Q1.collector" → placed["Q1"].collector
        at_ref = spec.get("at")
        if at_ref:
            parts = at_ref.split(".", 1)
            if len(parts) == 2:
                ref_id, terminal = parts
                ref_elem = placed.get(ref_id)
                if ref_elem is not None:
                    anchor_point = getattr(ref_elem, terminal, None)
                    if anchor_point is not None:
                        # For multi-terminal elements, set anchor so the element's
                        # "input" terminal is placed at anchor_point
                        natural_anchor = ANCHOR_MAP.get(elem_type)
                        if natural_anchor:
                            elem.anchor(natural_anchor)
                        elem.at(anchor_point)

        added = d.add(elem)

        elem_id = spec.get("id")
        if elem_id:
            placed[elem_id] = added

    # Export to SVG via temp file (works across all Schemdraw versions)
    tmp = tempfile.NamedTemporaryFile(suffix=".svg", delete=False)
    tmp.close()
    try:
        d.save(tmp.name)
        with open(tmp.name, "r", encoding="utf-8") as f:
            svg = f.read()
    finally:
        os.unlink(tmp.name)

    return {"svg": svg, "title": title}


if __name__ == "__main__":
    try:
        raw = sys.stdin.read()
        data = json.loads(raw)
        result = render(data)
        print(json.dumps(result))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        sys.exit(1)
