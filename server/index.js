/**
 * ═══════════════════════════════════════════════
 *  STUDYAGENT — PLAYWRIGHT BACKEND SERVER
 * ═══════════════════════════════════════════════
 */

const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { chromium } = require('playwright');
const http = require('http');

const PORT = process.env.PORT || 3001;
const app = express();
app.use(cors({
  origin: [
    'https://newzyra.netlify.app',
    'http://localhost:5173',
    'http://localhost:3000',
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/live' });

let browser = null;
let page = null;
let streamInterval = null;

async function initBrowser() {
  if (browser) return;
  console.log('[Browser] Launching Chromium...');
  browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process'
    ]
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await ctx.newPage();
  await page.goto('about:blank');
  console.log('[Browser] Ready');
}

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
    } catch {}
  }, 400);
}

function stopStreaming() {
  if (streamInterval) { clearInterval(streamInterval); streamInterval = null; }
}

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  startStreaming();
  ws.on('close', () => {
    if (wss.clients.size === 0) stopStreaming();
  });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, browser: !!browser, page: !!page });
});

app.get('/page-info', async (req, res) => {
  try {
    if (!page) {
      return res.json({ ok: false, error: 'No active page' });
    }
    const title = await page.title();
    const url = page.url();
    res.json({ ok: true, title, url });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.post('/navigate', async (req, res) => {
  try {
    await initBrowser();
    const { url } = req.body;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const title = await page.title();
    broadcastLog('Navigated to: ' + title);
    res.json({ ok: true, title, url: page.url() });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.post('/click', async (req, res) => {
  try {
    await initBrowser();
    const { selector } = req.body;
    let clicked = false;
    const strategies = [
      () => page.click(selector, { timeout: 3000 }),
      () => page.click('text=' + selector, { timeout: 3000 }),
    ];
    for (const strategy of strategies) {
      try { await strategy(); clicked = true; break; } catch {}
    }
    if (clicked) {
      broadcastLog('Clicked: ' + selector);
      res.json({ ok: true });
    } else {
      res.json({ ok: false, error: 'Could not find element: ' + selector });
    }
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.post('/type', async (req, res) => {
  try {
    await initBrowser();
    const { selector, text } = req.body;
    await page.fill(selector, text, { timeout: 3000 });
    broadcastLog('Typed into: ' + selector);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.post('/press', async (req, res) => {
  try {
    await initBrowser();
    const { key } = req.body;
    await page.keyboard.press(key);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

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
    res.json({ ok: true, content: content.slice(0, 5000) });
  } catch (e) {
    res.json({ ok: false, content: '', error: e.message });
  }
});

app.get('/screenshot', async (req, res) => {
  try {
    await initBrowser();
    const buf = await page.screenshot({ type: 'jpeg', quality: 80 });
    const b64 = buf.toString('base64');
    res.json({ ok: true, screenshot: 'data:image/jpeg;base64,' + b64 });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.post('/run', async (req, res) => {
  const { task, userId } = req.body;
  const taskId = 'task_' + Date.now();
  console.log('[Task]', taskId, task);
  res.json({ ok: true, taskId });
});

app.post('/scroll', async (req, res) => {
  try {
    await initBrowser();
    const { direction = 'down', amount = 300 } = req.body;
    await page.mouse.wheel(0, direction === 'down' ? amount : -amount);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

function broadcastLog(message) {
  const msg = JSON.stringify({ type: 'log', message });
  wss.clients.forEach((ws) => {
    if (ws.readyState === 1) ws.send(msg);
  });
}

server.listen(PORT, () => {
  console.log('StudyAgent Server running on port ' + PORT);
  initBrowser().catch(console.error);
});

process.on('SIGINT', async () => {
  stopStreaming();
  if (browser) await browser.close();
  process.exit(0);
});
