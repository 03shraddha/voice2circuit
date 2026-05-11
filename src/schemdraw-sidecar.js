import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RENDERER_PATH = join(__dirname, '..', 'python', 'renderer.py');

export async function renderCircuit(drawing) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [RENDERER_PATH], { timeout: 15000 });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', chunk => { stdout += chunk; });
    proc.stderr.on('data', chunk => { stderr += chunk; });

    proc.on('close', code => {
      if (code !== 0) {
        return reject(new Error(
          stderr.trim() || `Renderer exited with code ${code}`
        ));
      }
      try {
        const result = JSON.parse(stdout);
        if (result.error) return reject(new Error(result.error));
        resolve(result);
      } catch {
        reject(new Error(`Invalid renderer output: ${stdout.slice(0, 300)}`));
      }
    });

    proc.on('error', err => {
      if (err.code === 'ENOENT') {
        reject(new Error('python3 not found. Install Python 3 and run: pip3 install schemdraw matplotlib'));
      } else {
        reject(err);
      }
    });

    proc.stdin.write(JSON.stringify(drawing));
    proc.stdin.end();
  });
}
