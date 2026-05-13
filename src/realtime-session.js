import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { SYSTEM_PROMPT, REALTIME_TOOLS } from './circuit-tools.js';
import { summariseDrawing } from './circuit-state.js';

const REALTIME_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17';

export class RealtimeSession extends EventEmitter {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
    this.ws = null;
    this.pendingCalls = new Map(); // callId -> { name, args }
    this.currentDrawing = null;
  }

  connect() {
    this.ws = new WebSocket(REALTIME_URL, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    this.ws.on('open', () => {
      this._sendSessionUpdate();
      this.emit('connected');
    });

    this.ws.on('message', data => {
      let event;
      try { event = JSON.parse(data.toString()); } catch { return; }
      this._handleEvent(event);
    });

    this.ws.on('error', err => this.emit('error', err));
    this.ws.on('close', () => this.emit('disconnected'));
  }

  appendAudio(base64Pcm16) {
    this._send({ type: 'input_audio_buffer.append', audio: base64Pcm16 });
  }

  submitToolResult(callId, result) {
    this._send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(result),
      },
    });
    this._send({ type: 'response.create' });
  }

  updateDrawingContext(drawing) {
    this.currentDrawing = drawing;
    // Refresh instructions so GPT-4o knows the current circuit state
    this._sendSessionUpdate();
  }

  close() {
    this.ws?.close();
  }

  _sendSessionUpdate() {
    const circuitContext = this.currentDrawing
      ? `\n\nCURRENT CIRCUIT STATE:\n${summariseDrawing(this.currentDrawing)}`
      : '\n\nNo circuit has been drawn yet.';

    this._send({
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: SYSTEM_PROMPT + circuitContext,
        voice: 'alloy',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 800,
        },
        tools: REALTIME_TOOLS,
        tool_choice: 'auto',
      },
    });
  }

  _handleEvent(event) {
    switch (event.type) {
      case 'session.created':
        console.log('[realtime] session created');
        break;

      case 'input_audio_buffer.speech_started':
        this.emit('speech_started');
        break;

      case 'input_audio_buffer.speech_stopped':
        this.emit('speech_stopped');
        break;

      case 'conversation.item.input_audio_transcription.completed':
        if (event.transcript) this.emit('transcript', event.transcript);
        break;

      // Capture function name when output item is added
      case 'response.output_item.added':
        if (event.item?.type === 'function_call') {
          this.pendingCalls.set(event.item.call_id, {
            name: event.item.name,
            args: '',
          });
        }
        break;

      // Accumulate streaming args (not strictly needed since .done gives the full string)
      case 'response.function_call_arguments.delta': {
        const pending = this.pendingCalls.get(event.call_id);
        if (pending) pending.args += event.delta;
        break;
      }

      // Fire tool call when args are complete
      case 'response.function_call_arguments.done': {
        const pending = this.pendingCalls.get(event.call_id);
        if (!pending) break;
        this.pendingCalls.delete(event.call_id);
        let args;
        try {
          args = JSON.parse(event.arguments || pending.args || '{}');
        } catch (e) {
          this.emit('error', new Error(`Malformed tool args: ${e.message}`));
          break;
        }
        this.emit('tool_call', { callId: event.call_id, name: pending.name, args });
        break;
      }

      // Forward GPT-4o voice response chunks to listeners (browser plays them)
      case 'response.audio.delta':
        this.emit('audio_output', event.delta);
        break;

      case 'error':
        this.emit('error', new Error(event.error?.message || 'Realtime API error'));
        break;
    }
  }

  _send(obj) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }
}
