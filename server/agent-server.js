/**
 * StudyAgent Playwright Backend Server
 * 
 * Deploy this on any Node.js server for full browser automation.
 * 
 * Setup:
 *   npm install express cors playwright
 *   npx playwright install chromium
 *   node agent-server.js
 */

const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

let browser = null;
let page = null;

async function ensureBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  if (!page || page.isClosed()) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    page = await context.newPage();
  }
  return page;
}

async function getScreenshotBase64() {
  const p = await ensureBrowser();
  const buffer = await p.screenshot({ type: 'png', fullPage: false });
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

// Navigate to URL
app.post('/navigate', async (req, res) => {
  try {
    const { url } = req.body;
    const p = await ensureBrowser();
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await p.waitForTimeout(2000);
    
    const title = await p.title();
    const content = await p.evaluate(() => document.body?.innerText?.slice(0, 8000) || '');
    const screenshot = await getScreenshotBase64();
    
    res.json({ title, content, screenshot, url: p.url() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Click element
app.post('/click', async (req, res) => {
  try {
    const { selector } = req.body;
    const p = await ensureBrowser();
    await p.click(selector, { timeout: 10000 });
    await p.waitForTimeout(2000);
    
    const screenshot = await getScreenshotBase64();
    res.json({ success: true, url: p.url(), screenshot });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Type text
app.post('/type', async (req, res) => {
  try {
    const { selector, text } = req.body;
    const p = await ensureBrowser();
    await p.fill(selector, text, { timeout: 10000 });
    await p.waitForTimeout(500);
    
    const screenshot = await getScreenshotBase64();
    res.json({ success: true, screenshot });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Extract content
app.post('/extract', async (req, res) => {
  try {
    const { selector } = req.body;
    const p = await ensureBrowser();
    const content = await p.evaluate((sel) => {
      const el = document.querySelector(sel) || document.body;
      return el?.innerText?.slice(0, 8000) || '';
    }, selector || 'body');
    
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Screenshot
app.post('/screenshot', async (req, res) => {
  try {
    const p = await ensureBrowser();
    if (req.body.url) {
      await p.goto(req.body.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await p.waitForTimeout(2000);
    }
    const buffer = await p.screenshot({ type: 'png', fullPage: false });
    res.set('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', browser: !!browser });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`StudyAgent Playwright Server running on port ${PORT}`);
  console.log(`Connect from frontend with URL: http://localhost:${PORT}`);
});

// Cleanup on exit
process.on('SIGINT', async () => {
  if (browser) await browser.close();
  process.exit();
});
