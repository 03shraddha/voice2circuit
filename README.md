# voice2circuit

Speak a circuit description → instant schematic diagram.

Uses the **GPT-4o Realtime API** for voice understanding and tool calling, and **Schemdraw** (Python) to render IEEE-style schematics as SVG.

```
"Connect a 10k resistor from VCC to the base of an NPN transistor,
 emitter goes to ground through a 1k resistor, collector drives an LED"
```

→ renders a clean schematic in seconds, live in the browser.

---

## How it works

```
Browser mic → PCM16 → WebSocket
  → Express server (proxy)
  → GPT-4o Realtime API (server VAD + tool calls)
  ← circuit_overwrite / circuit_modify tool call
  → Python Schemdraw sidecar → SVG
  → WebSocket → browser renders diagram
```

GPT-4o Realtime handles both transcription and circuit understanding in one WebSocket session — no separate transcription step. Server VAD detects end of speech automatically.

Two tools keep the LLM output surface minimal:
- **`circuit_overwrite`** — full new schematic (new circuit or redesign)
- **`circuit_modify`** — targeted changes (add component, change value, remove branch)

---

## Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.8
- **OpenAI API key** with Realtime API access (`gpt-4o-realtime-preview`)

---

## Setup

```bash
# 1. Install Python dependencies
pip3 install schemdraw matplotlib

# 2. Install Node dependencies
npm install

# 3. Set your OpenAI API key
cp .env.example .env
# Edit .env and add: OPENAI_API_KEY=sk-...

# 4. Run
npm start
```

The browser opens automatically at `http://localhost:3000`.

---

## Usage

1. Click **Start listening**
2. Describe your circuit naturally:
   - *"Voltage divider with 10k and 22k from 5V"*
   - *"Add a 100nF bypass cap from VCC to ground"*
   - *"Change R1 to 47k"*
3. GPT-4o interprets the speech, generates a drawing spec, Schemdraw renders it
4. Click **Export SVG** to save the schematic

---

## Supported components

| Type | Description |
|---|---|
| `resistor` | Resistor |
| `capacitor` | Capacitor |
| `inductor` | Inductor |
| `npn_bjt` / `pnp_bjt` | Bipolar junction transistors |
| `nmos` / `pmos` | MOSFETs |
| `diode` / `led` / `zener` | Diodes |
| `opamp` | Operational amplifier |
| `voltage_source` / `current_source` / `battery` | Sources |
| `ground` / `vcc` | Power rails |
| `wire` / `line` / `dot` | Wiring and junctions |

---

## Project structure

```
voice2circuit/
├── src/
│   ├── cli.js                # Entry point — starts server, opens browser
│   ├── server.js             # Express + WebSocket orchestrator
│   ├── realtime-session.js   # GPT-4o Realtime API client
│   ├── circuit-tools.js      # Tool definitions + system prompt
│   ├── circuit-schema.js     # Zod validation schemas
│   ├── circuit-state.js      # Apply circuit_modify operations
│   ├── schemdraw-sidecar.js  # Python subprocess manager
│   └── settings-store.js     # API key / config persistence
├── python/
│   └── renderer.py           # Schemdraw renderer (stdin JSON → stdout SVG)
├── public/
│   ├── index.html            # App shell
│   └── app.js                # Audio capture, WebSocket, SVG display
└── .env.example
```

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | — | Required. OpenAI API key. |
| `PORT` | `3000` | HTTP port for the local server. |

Settings can also be stored in `~/.config/voice2circuit/settings.json`.

---

## Extending

**Add a new component type:** Add it to `ELEMENT_MAP` in `python/renderer.py` and `ComponentTypeEnum` in `src/circuit-schema.js`. Update the system prompt in `src/circuit-tools.js`.

**KiCad netlist export:** The Python renderer can be extended to also output a KiCad `.net` file from the drawing spec — the component IDs and connections are already structured for this.

**Different LLM:** Swap `realtime-session.js` to use another Realtime-capable provider. The tool schemas and server orchestration remain unchanged.
