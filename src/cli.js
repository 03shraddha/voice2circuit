import { config } from 'dotenv';
import { createServer } from './server.js';
import { getApiKey } from './settings-store.js';
import open from 'open';

// Load .env if present
try { config(); } catch { /* no dotenv file, that's fine */ }

const PORT = parseInt(process.env.PORT || '3000', 10);

const httpServer = createServer();

httpServer.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  voice2circuit  →  ${url}\n`);

  if (!getApiKey()) {
    console.warn('  ⚠  OPENAI_API_KEY not found.');
    console.warn('     Add it to a .env file or export it in your shell.\n');
  }

  open(url).catch(() => {
    console.log(`  Open ${url} in your browser to start.`);
  });
});

httpServer.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Set PORT=<other> in .env`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
