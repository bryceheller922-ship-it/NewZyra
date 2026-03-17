# StudyAgent Playwright Backend Server

This server enables full browser automation with Playwright.
Deploy this on any Node.js server (VPS, Raspberry Pi, Cloud Run, etc.)

## Setup

```bash
cd server
npm install
npx playwright install chromium
npm start
```

## Environment

Set the `PORT` environment variable (default: 3001)

## Endpoints

- `POST /navigate` - Navigate to URL, returns { title, content, screenshot }
- `POST /click` - Click element by selector
- `POST /type` - Type text into element
- `POST /extract` - Extract text content from selector
- `POST /screenshot` - Take screenshot of current page

## Connecting from Frontend

In StudyAgent settings, enter your server URL (e.g., `http://localhost:3001`)
The frontend will automatically use Playwright for full browser control.
