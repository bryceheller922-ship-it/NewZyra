/**
 * ═══════════════════════════════════════════════
 *  STUDYAGENT — PLAYWRIGHT BACKEND SERVER
 * ═══════════════════════════════════════════════
 *
 * This server runs Playwright to control a real browser.
 * The frontend connects via HTTP (REST) and WebSocket (live stream).
 *
 * SETUP:
 *   cd server
 *   npm init -y
 *   npm install express cors ws playwright
 *   npx playwright install chromium
 *   node index.js
 *
 * The server will start on port 3001.
 * In StudyAgent Settings, enter: http://localhost:3001
 */

const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { chromium } = require('playwright');
const http = require('http');

const PORT = 3001;
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/live' });

let browser = null;
let page = null;
let streamInterval = null;

// ─── Initialize browser ─────────────────────
async function initBrowser() {
  if (browser) return;
  console.log('[Browser] Launching Chromium...');
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await ctx.newPage();
  await page.goto('about:blank');
  console.log('[Browser] Ready');
}

// ─── Live stream to WebSocket clients ────────
function startStreaming() {
  if (streamInterval) return;
  streamInterval = setInterval(async () => {
    if (!page || wss.clients.size === 0) return;
    try {
      const buf = await page.screenshot({ type: 'jpeg', quality: 60 });
      const b64 = buf.toString('base64');
      const msg = JSON.stringify({ type: 'frame', data: b64 });
      wss.clients.forEach((ws) => {
        if (ws.readyState === 1) ws.send(msg);
      });
    } catch { /* page might be navigating */ }
  }, 400); // ~2.5 FPS
}

function stopStreaming() {
  if (streamInterval) { clearInterval(streamInterval); streamInterval = null; }
}

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  startStreaming();
  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    if (wss.clients.size === 0) stopStreaming();
  });
});

// ─── REST ENDPOINTS ──────────────────────────

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, browser: !!browser, page: !!page });
});

// Navigate to URL
app.post('/navigate', async (req, res) => {
  try {
    await initBrowser();
    const { url } = req.body;
    console.log(`[Navigate] ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const title = await page.title();
    broadcastLog(`Navigated to: ${title}`);
    res.json({ ok: true, title, url: page.url() });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Click element
app.post('/click', async (req, res) => {
  try {
    await initBrowser();
    const { selector } = req.body;
    console.log(`[Click] ${selector}`);

    // Try multiple strategies
    let clicked = false;
    const strategies = [
      () => page.click(selector, { timeout: 3000 }),
      () => page.click(`text=${selector}`, { timeout: 3000 }),
      () => page.click(`[aria-label="${selector}"]`, { timeout: 3000 }),
      () => page.click(`button:has-text("${selector}")`, { timeout: 3000 }),
      () => page.click(`a:has-text("${selector}")`, { timeout: 3000 }),
    ];

    for (const strategy of strategies) {
      try { await strategy(); clicked = true; break; } catch { /* try next */ }
    }

    if (clicked) {
      await page.waitForTimeout(500);
      broadcastLog(`Clicked: ${selector}`);
      res.json({ ok: true });
    } else {
      res.json({ ok: false, error: `Could not find element: ${selector}` });
    }
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Type text
app.post('/type', async (req, res) => {
  try {
    await initBrowser();
    const { selector, text } = req.body;
    console.log(`[Type] ${selector}: ${text}`);

    let typed = false;
    const strategies = [
      () => page.fill(selector, text, { timeout: 3000 }),
      () => page.fill(`[name="${selector}"]`, text, { timeout: 3000 }),
      () => page.fill(`[placeholder*="${selector}" i]`, text, { timeout: 3000 }),
      () => page.fill(`input[type="${selector}"]`, text, { timeout: 3000 }),
    ];

    for (const strategy of strategies) {
      try { await strategy(); typed = true; break; } catch { /* try next */ }
    }

    if (typed) {
      broadcastLog(`Typed into: ${selector}`);
      res.json({ ok: true });
    } else {
      res.json({ ok: false, error: `Could not find input: ${selector}` });
    }
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Press key
app.post('/press', async (req, res) => {
  try {
    await initBrowser();
    const { key } = req.body;
    await page.keyboard.press(key);
    broadcastLog(`Pressed key: ${key}`);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Extract content
app.post('/extract', async (req, res) => {
  try {
    await initBrowser();
    const { selector } = req.body;
    let content;
    if (selector) {
      content = await page.$eval(selector, (el) => el.textContent || el.innerText);
    } else {
      content = await page.$eval('body', (el) => el.innerText);
    }
    broadcastLog(`Extracted content (${content.length} chars)`);
    res.json({ ok: true, content: content.slice(0, 5000) });
  } catch (e) {
    res.json({ ok: false, content: '', error: e.message });
  }
});

// Screenshot
app.get('/screenshot', async (req, res) => {
  try {
    await initBrowser();
    const buf = await page.screenshot({ type: 'jpeg', quality: 80 });
    const b64 = buf.toString('base64');
    res.json({ ok: true, screenshot: `data:image/jpeg;base64,${b64}` });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Page info (for AI to understand the page)
app.get('/page-info', async (req, res) => {
  try {
    await initBrowser();
    const title = await page.title();
    const url = page.url();
    const links = await page.$$eval('a[href]', (els) =>
      els.slice(0, 20).map((a) => ({ text: a.textContent?.trim(), href: a.href }))
    );
    const inputs = await page.$$eval('input, textarea, select', (els) =>
      els.slice(0, 20).map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type'),
        name: el.getAttribute('name'),
        placeholder: el.getAttribute('placeholder'),
      }))
    );
    const buttons = await page.$$eval('button, [role="button"], input[type="submit"]', (els) =>
      els.slice(0, 20).map((el) => ({ text: el.textContent?.trim(), type: el.getAttribute('type') }))
    );
    res.json({ ok: true, title, url, links, inputs, buttons });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Run a full task (the frontend's main endpoint)
app.post('/run', async (req, res) => {
  const { task, userId } = req.body;
  const taskId = `task_${Date.now()}`;
  console.log(`[Task] ${taskId}: ${task} (user: ${userId})`);
  // Return immediately — the frontend manages the execution loop
  res.json({ ok: true, taskId });
});

// Scroll
app.post('/scroll', async (req, res) => {
  try {
    await initBrowser();
    const { direction = 'down', amount = 300 } = req.body;
    await page.mouse.wheel(0, direction === 'down' ? amount : -amount);
    await page.waitForTimeout(300);
    broadcastLog(`Scrolled ${direction}`);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ─── Helpers ─────────────────────────────────
function broadcastLog(message) {
  const msg = JSON.stringify({ type: 'log', message });
  wss.clients.forEach((ws) => {
    if (ws.readyState === 1) ws.send(msg);
  });
}

// ─── Start server ────────────────────────────
server.listen(PORT, () => {
  console.log(`\n═══════════════════════════════════════`);
  console.log(`  StudyAgent Server running on port ${PORT}`);
  console.log(`  REST: http://localhost:${PORT}`);
  console.log(`  WS:   ws://localhost:${PORT}/live`);
  console.log(`═══════════════════════════════════════\n`);
  initBrowser().catch(console.error);
});

// Cleanup on exit
process.on('SIGINT', async () => {
  stopStreaming();
  if (browser) await browser.close();
  process.exit(0);
});
