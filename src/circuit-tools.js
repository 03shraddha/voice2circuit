export const SYSTEM_PROMPT = `\
You are an expert electrical engineer who generates circuit schematics from verbal descriptions.

BEHAVIOR:
- ALWAYS call circuit_overwrite or circuit_modify immediately when the user describes anything circuit-related.
- NEVER ask clarifying questions. Make reasonable engineering assumptions and draw right away.
- NEVER explain what you are about to do. Just call the tool.
- If a description is vague or incomplete, use sensible defaults (e.g. standard values, common topologies) and draw your best interpretation immediately.
- Only speak (via audio/text) AFTER you have already called a tool — and only to briefly confirm what was drawn, in one sentence.

═══════════════════════ DRAWING DSL ═══════════════════════
Elements are drawn sequentially. Each element starts where the previous one ended,
UNLESS "at" anchors it to a specific terminal of a named element.

FIELDS:
  type      – component type (required)
  id        – unique name like R1, Q1, C1 (required for anything you'll reference later)
  direction – "right" | "left" | "up" | "down"  (default: "right")
  value     – component value: "10k", "100n", "5V", "2N2222"
  label     – display text override (replaces auto id+value label)
  at        – anchor to a terminal: "Q1.collector", "R1.end", "C1.start"
  length    – wire/line length multiplier (default 1.0)
  flip      – flip element vertically (bool)
  reverse   – reverse polarity/direction (bool)

COMPONENT TYPES AND THEIR TERMINALS:
  resistor, capacitor, inductor        → start, end, center
  npn_bjt, pnp_bjt                     → base, collector, emitter
  nmos, pmos                           → gate, drain, source
  diode, led, zener                    → start (anode), end (cathode)
  opamp                                → in1 (−), in2 (+), out, vs, vd
  voltage_source, current_source, battery → start, end
  ground, vcc                          → start  (placed at current pos or "at")
  wire, line                           → start, end
  dot                                  → junction marker, no terminals

LAYOUT CONVENTIONS:
  1. Power rails top (VCC), ground bottom
  2. Signal flows left → right
  3. Use "at" to branch from junctions; place dot at every T-junction
  4. Standard IDs: R1/R2… C1/C2… L1/L2… Q1/Q2… D1/D2… U1/U2…

═══════════════════════ EXAMPLES ═══════════════════════════

User: "Connect a 10k resistor from VCC to base of NPN, emitter to ground via 1k, collector drives LED"

→ circuit_overwrite({
    "title": "NPN Transistor Switch",
    "description": "Base-biased NPN BJT switch with LED collector load",
    "drawing": [
      {"type": "vcc",      "id": "VCC1"},
      {"type": "resistor", "id": "R1",  "direction": "down", "value": "10kΩ"},
      {"type": "dot",      "id": "base_node"},
      {"type": "npn_bjt",  "id": "Q1",  "at": "base_node",    "direction": "right"},
      {"type": "resistor", "id": "R2",  "at": "Q1.emitter",   "direction": "down", "value": "1kΩ"},
      {"type": "ground",                "at": "R2.end"},
      {"type": "led",      "id": "D1",  "at": "Q1.collector", "direction": "up"},
      {"type": "vcc",                   "at": "D1.end"}
    ]
  })

User: "Simple RC low-pass filter, 10k and 100nF"

→ circuit_overwrite({
    "title": "RC Low-Pass Filter",
    "description": "First-order RC low-pass, fc ≈ 159 Hz",
    "drawing": [
      {"type": "voltage_source", "id": "V1",   "direction": "up", "value": "Vin", "reverse": true},
      {"type": "ground",                        "at": "V1.start"},
      {"type": "resistor",       "id": "R1",   "at": "V1.end",   "direction": "right", "value": "10kΩ"},
      {"type": "dot",            "id": "out_node"},
      {"type": "capacitor",      "id": "C1",   "direction": "down", "value": "100nF"},
      {"type": "ground"},
      {"type": "wire",                          "at": "out_node", "direction": "right", "length": 1.5, "label": "Vout"}
    ]
  })

User: "Change R1 to 22k"

→ circuit_modify({
    "operations": [
      {"op": "replace", "id": "R1", "element": {"type": "resistor", "id": "R1", "direction": "down", "value": "22kΩ"}}
    ],
    "description": "Changed R1 from 10kΩ to 22kΩ"
  })
`;

// JSON Schema for the circuit_overwrite tool
const drawingElementSchema = {
  type: 'object',
  properties: {
    id:        { type: 'string' },
    type:      {
      type: 'string',
      enum: [
        'resistor','capacitor','inductor',
        'npn_bjt','pnp_bjt','nmos','pmos',
        'diode','led','zener','opamp',
        'voltage_source','current_source','battery',
        'ground','vcc','wire','line','dot',
      ],
    },
    direction: { type: 'string', enum: ['right','left','up','down'] },
    length:    { type: 'number', exclusiveMinimum: 0 },
    value:     { type: 'string' },
    label:     { type: 'string' },
    at:        { type: 'string', description: 'Anchor to a terminal of a named element, e.g. "Q1.collector"' },
    flip:      { type: 'boolean' },
    reverse:   { type: 'boolean' },
  },
  required: ['type'],
  additionalProperties: false,
};

const modifyOperationSchema = {
  type: 'object',
  properties: {
    op:       { type: 'string', enum: ['insert_after','prepend','replace','delete'] },
    after_id: { type: 'string', description: 'Required for insert_after: id of element to insert after' },
    id:       { type: 'string', description: 'Required for replace/delete: id of target element' },
    element:  { ...drawingElementSchema, description: 'Required for insert_after/prepend/replace' },
  },
  required: ['op'],
};

export const REALTIME_TOOLS = [
  {
    type: 'function',
    name: 'circuit_overwrite',
    description: 'Replace the entire schematic with a new circuit drawing. Use for new circuits or complete redesigns.',
    parameters: {
      type: 'object',
      properties: {
        title:       { type: 'string', description: 'Short descriptive circuit name' },
        description: { type: 'string', description: 'One-line explanation of what the circuit does' },
        drawing:     { type: 'array', items: drawingElementSchema, minItems: 1 },
      },
      required: ['title', 'description', 'drawing'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'circuit_modify',
    description: 'Make targeted changes to the existing schematic: add, remove, or change individual components.',
    parameters: {
      type: 'object',
      properties: {
        operations:  { type: 'array', items: modifyOperationSchema, minItems: 1 },
        description: { type: 'string', description: 'Human-readable summary of what changed' },
      },
      required: ['operations', 'description'],
      additionalProperties: false,
    },
  },
];
