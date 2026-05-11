'use strict';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const statusDot    = document.getElementById('status-dot');
const statusLabel  = document.getElementById('status-label');
const micBtn       = document.getElementById('mic-btn');
const waveformCvs  = document.getElementById('waveform');
const circuitDisplay = document.getElementById('circuit-display');
const placeholder  = document.getElementById('placeholder');
const spinner      = document.getElementById('spinner');
const circuitTitle = document.getElementById('circuit-title');
const transcriptEl = document.getElementById('transcript');
const exportSvgBtn = document.getElementById('export-svg');
const errorToast   = document.getElementById('error-toast');

// ── State ─────────────────────────────────────────────────────────────────────
let ws = null;
let audioCtx = null;
let mediaStream = null;
let processor = null;
let analyser = null;
let recording = false;
let currentSvg = null;
let currentTitle = null;

// For queuing GPT-4o audio playback without gaps
let playbackCtx = null;
let nextPlayTime = 0;

// ── WebSocket ─────────────────────────────────────────────────────────────────
function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.onopen = () => {
    setStatus('connected', 'Connected — click mic to start');
    micBtn.disabled = false;
  };

  ws.onclose = () => {
    setStatus('disconnected', 'Disconnected — reload to reconnect');
    micBtn.disabled = true;
    stopRecording();
    setTimeout(connectWs, 3000);
  };

  ws.onerror = () => setStatus('disconnected', 'Connection error');

  ws.onmessage = e => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    handleServerMessage(msg);
  };
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'status':
      setStatus(msg.status, msg.status === 'connected' ? 'Connected' : msg.status);
      break;

    case 'speech_started':
      setStatus('speaking', 'Listening…');
      break;

    case 'speech_stopped':
      setStatus('connected', 'Processing…');
      break;

    case 'transcript':
      transcriptEl.textContent = `"${msg.text}"`;
      break;

    case 'rendering':
      showSpinner(true);
      break;

    case 'circuit_update':
      showSpinner(false);
      renderSvg(msg.svg);
      currentSvg = msg.svg;
      currentTitle = msg.drawing?.title || 'Circuit';
      circuitTitle.textContent = currentTitle;
      exportSvgBtn.disabled = false;
      setStatus('connected', 'Ready');
      break;

    case 'audio_output':
      playAudioChunk(msg.delta);
      break;

    case 'error':
      showSpinner(false);
      showError(msg.message);
      break;
  }
}

// ── Audio capture ─────────────────────────────────────────────────────────────
async function startRecording() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    showError('Microphone access denied: ' + err.message);
    return;
  }

  audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(mediaStream);

  // Waveform analyser
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  // ScriptProcessor: capture PCM, resample to 24 kHz, send to server
  const bufferSize = 4096;
  processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
  source.connect(processor);
  processor.connect(audioCtx.destination);

  processor.onaudioprocess = e => {
    if (!recording || ws?.readyState !== WebSocket.OPEN) return;
    const input = e.inputBuffer.getChannelData(0); // Float32, native rate
    const resampled = resampleTo24k(input, audioCtx.sampleRate);
    const pcm16 = float32ToPcm16(resampled);
    const b64 = arrayBufferToBase64(pcm16.buffer);
    ws.send(JSON.stringify({ type: 'audio', data: b64 }));
  };

  recording = true;
  drawWaveform();
}

function stopRecording() {
  recording = false;
  processor?.disconnect();
  processor = null;
  mediaStream?.getTracks().forEach(t => t.stop());
  mediaStream = null;
  audioCtx?.close();
  audioCtx = null;
  analyser = null;
}

// ── Mic button ────────────────────────────────────────────────────────────────
micBtn.addEventListener('click', async () => {
  if (!recording) {
    micBtn.querySelector('.mic-label').textContent = 'STOP';
    micBtn.classList.add('recording');
    await startRecording();
  } else {
    micBtn.querySelector('.mic-label').textContent = 'REC';
    micBtn.classList.remove('recording');
    stopRecording();
    setStatus('connected', 'Ready');
  }
});

// ── Audio utilities ───────────────────────────────────────────────────────────
function resampleTo24k(float32, fromRate) {
  if (fromRate === 24000) return float32;
  const ratio = fromRate / 24000;
  const outLen = Math.round(float32.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    out[i] = float32[idx] * (1 - frac) + (float32[idx + 1] ?? 0) * frac;
  }
  return out;
}

function float32ToPcm16(float32) {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// ── GPT-4o audio playback ─────────────────────────────────────────────────────
function playAudioChunk(base64) {
  if (!playbackCtx) {
    playbackCtx = new AudioContext({ sampleRate: 24000 });
    nextPlayTime = 0;
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;

  const audioBuffer = playbackCtx.createBuffer(1, float32.length, 24000);
  audioBuffer.getChannelData(0).set(float32);

  const src = playbackCtx.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(playbackCtx.destination);

  const now = playbackCtx.currentTime;
  const startAt = Math.max(now, nextPlayTime);
  src.start(startAt);
  nextPlayTime = startAt + audioBuffer.duration;
}

// ── Waveform visualizer ───────────────────────────────────────────────────────
function drawWaveform() {
  requestAnimationFrame(drawWaveform);
  const ctx2d = waveformCvs.getContext('2d');
  const { width, height } = waveformCvs;

  // Phosphor persistence: fade previous frame instead of clearing
  ctx2d.fillStyle = 'rgba(5, 14, 7, 0.3)';
  ctx2d.fillRect(0, 0, width, height);

  if (!analyser) {
    // Idle flatline — dim phosphor green center line
    ctx2d.beginPath();
    ctx2d.moveTo(0, height / 2);
    ctx2d.lineTo(width, height / 2);
    ctx2d.lineWidth = 1;
    ctx2d.strokeStyle = 'rgba(26, 122, 68, 0.5)';
    ctx2d.stroke();
    return;
  }

  const data = new Uint8Array(analyser.fftSize / 2);
  analyser.getByteTimeDomainData(data);

  const sliceWidth = width / data.length;
  ctx2d.beginPath();
  for (let i = 0; i < data.length; i++) {
    const v = data[i] / 128.0;
    const y = (v - 1.0) * (height / 2) + height / 2;
    const x = i * sliceWidth;
    if (i === 0) ctx2d.moveTo(x, y);
    else ctx2d.lineTo(x, y);
  }
  ctx2d.lineTo(width, height / 2);

  // Outer halo
  ctx2d.lineWidth = 4;
  ctx2d.strokeStyle = 'rgba(57, 255, 133, 0.08)';
  ctx2d.stroke();

  // Mid glow
  ctx2d.lineWidth = 2;
  ctx2d.strokeStyle = 'rgba(57, 255, 133, 0.32)';
  ctx2d.stroke();

  // Bright core
  ctx2d.lineWidth = 1;
  ctx2d.strokeStyle = 'rgba(57, 255, 133, 0.92)';
  ctx2d.stroke();
}

// ── SVG display ───────────────────────────────────────────────────────────────
function renderSvg(svgString) {
  // Clear placeholder and spinner
  placeholder.style.display = 'none';

  // Remove previous SVG if any
  const prev = circuitDisplay.querySelector('svg');
  if (prev) prev.remove();

  const container = document.createElement('div');
  container.innerHTML = svgString;
  const svgEl = container.querySelector('svg');
  if (svgEl) {
    svgEl.removeAttribute('width');
    svgEl.removeAttribute('height');
    svgEl.style.maxWidth = '100%';
    svgEl.style.height = 'auto';
    circuitDisplay.appendChild(svgEl);
  }
}

// ── Export ────────────────────────────────────────────────────────────────────
exportSvgBtn.addEventListener('click', () => {
  if (!currentSvg) return;
  const blob = new Blob([currentSvg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(currentTitle || 'circuit').replace(/\s+/g, '_').toLowerCase()}.svg`;
  a.click();
  URL.revokeObjectURL(url);
});

// ── UI helpers ────────────────────────────────────────────────────────────────
function setStatus(state, label) {
  statusDot.className = state;
  statusLabel.textContent = label;
}

function showSpinner(on) {
  spinner.style.display = on ? 'block' : 'none';
  if (on) placeholder.style.display = 'none';
}

function showError(msg) {
  errorToast.textContent = msg;
  errorToast.style.display = 'block';
  setTimeout(() => { errorToast.style.display = 'none'; }, 5000);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
connectWs();
drawWaveform();
