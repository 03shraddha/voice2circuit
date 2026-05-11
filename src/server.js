import http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { RealtimeSession } from './realtime-session.js';
import { renderCircuit } from './schemdraw-sidecar.js';
import { applyModifications } from './circuit-state.js';
import { CircuitDrawing, CircuitModify } from './circuit-schema.js';
import { getApiKey } from './settings-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createServer() {
  const app = express();
  app.use(express.static(join(__dirname, '..', 'public')));

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  // Singleton session + state (single-user local tool)
  let session = null;
  let currentDrawing = null;
  let currentSvg = null;
  const browserClients = new Set();

  function broadcast(msg) {
    const str = JSON.stringify(msg);
    for (const client of browserClients) {
      if (client.readyState === WebSocket.OPEN) client.send(str);
    }
  }

  function startSession() {
    const apiKey = getApiKey();
    if (!apiKey) {
      console.error('[server] OPENAI_API_KEY not set. Set it in .env or ~/.config/voice2circuit/settings.json');
      return;
    }

    session = new RealtimeSession(apiKey);

    session.on('connected', () => {
      console.log('[realtime] connected');
      broadcast({ type: 'status', status: 'connected' });
    });

    session.on('disconnected', () => {
      console.log('[realtime] disconnected');
      broadcast({ type: 'status', status: 'disconnected' });
      session = null;
    });

    session.on('error', err => {
      console.error('[realtime] error:', err.message);
      broadcast({ type: 'error', message: err.message });
    });

    session.on('speech_started', () => broadcast({ type: 'speech_started' }));
    session.on('speech_stopped', () => broadcast({ type: 'speech_stopped' }));

    session.on('transcript', text => {
      broadcast({ type: 'transcript', text });
    });

    // Play GPT-4o voice replies in the browser
    session.on('audio_output', delta => {
      broadcast({ type: 'audio_output', delta });
    });

    session.on('tool_call', async ({ callId, name, args }) => {
      try {
        if (name === 'circuit_overwrite') {
          const parsed = CircuitDrawing.parse(args);
          currentDrawing = parsed;
        } else if (name === 'circuit_modify') {
          if (!currentDrawing) throw new Error('No circuit to modify');
          const { operations } = CircuitModify.parse(args);
          currentDrawing = applyModifications(currentDrawing, operations);
        } else {
          throw new Error(`Unknown tool: ${name}`);
        }

        broadcast({ type: 'rendering' });

        const result = await renderCircuit(currentDrawing);
        currentSvg = result.svg;

        broadcast({
          type: 'circuit_update',
          drawing: currentDrawing,
          svg: currentSvg,
        });

        session.updateDrawingContext(currentDrawing);

        session.submitToolResult(callId, {
          success: true,
          title: currentDrawing.title,
          element_count: currentDrawing.drawing.length,
          current_drawing: currentDrawing.drawing,
        });

      } catch (err) {
        console.error(`[tool:${name}]`, err.message);
        broadcast({ type: 'error', message: err.message });
        session.submitToolResult(callId, { success: false, error: err.message });
      }
    });

    session.connect();
  }

  wss.on('connection', browserWs => {
    browserClients.add(browserWs);
    console.log(`[ws] browser connected (${browserClients.size} total)`);

    // Bootstrap session on first browser connection
    if (!session) startSession();

    // Send current state to newly connected browser
    if (currentDrawing && currentSvg) {
      browserWs.send(JSON.stringify({ type: 'circuit_update', drawing: currentDrawing, svg: currentSvg }));
    }

    browserWs.on('message', data => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }

      if (msg.type === 'audio' && session) {
        session.appendAudio(msg.data);
      }
    });

    browserWs.on('close', () => {
      browserClients.delete(browserWs);
      console.log(`[ws] browser disconnected (${browserClients.size} remaining)`);
    });

    browserWs.on('error', err => console.error('[ws] browser error:', err.message));
  });

  return httpServer;
}
