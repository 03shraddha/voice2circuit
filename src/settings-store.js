import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_DIR = join(homedir(), '.config', 'voice2circuit');
const CONFIG_FILE = join(CONFIG_DIR, 'settings.json');

let cached = null;

export function loadSettings() {
  if (cached) return cached;
  try {
    cached = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    cached = {};
  }
  return cached;
}

export function getApiKey() {
  return process.env.OPENAI_API_KEY || loadSettings().openaiApiKey || null;
}

export function saveSettings(updates) {
  const current = loadSettings();
  const merged = { ...current, ...updates };
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), { mode: 0o600 });
  cached = merged;
  return merged;
}
