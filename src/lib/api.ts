/**
 * ========================================
 * BACKEND API — REAL AGENT ENGINE
 * ========================================
 */

const AGENT_SERVER_URL = import.meta.env.VITE_AGENT_SERVER_URL || 'https://newzyra-1.onrender.com';
const AGENT_WS_URL = AGENT_SERVER_URL.replace(/^https/, 'wss').replace(/^http/, 'ws') + '/live';

const AI_KEYS = {
  gemini: import.meta.env.VITE_GEMINI_KEY || '',
  groq: import.meta.env.VITE_GROQ_KEY || '',
  cohere: import.meta.env.VITE_COHERE_KEY || '',
  huggingface: import.meta.env.VITE_HF_KEY || '',
};

// ─── AGENT SERVER CALLS ──────────────────────

export async function runAgentTask(task: string, userId: string): Promise<string> {
  try {
    const res = await fetch(`${AGENT_SERVER_URL}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, userId }),
    });
    const data = await res.json();
    return data.taskId;
  } catch {
    return `demo_${Date.now()}`;
  }
}

export async function navigateTo(url: string) {
  const res = await fetch(`${AGENT_SERVER_URL}/navigate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return await res.json();
}

export async function clickElement(selector: string) {
  const res = await fetch(`${AGENT_SERVER_URL}/click`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selector }),
  });
  return await res.json();
}

export async function typeText(selector: string, text: string) {
  const res = await fetch(`${AGENT_SERVER_URL}/type`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selector, text }),
  });
  return await res.json();
}

export async function getScreenshot(): Promise<string | null> {
  try {
    const res = await fetch(`${AGENT_SERVER_URL}/screenshot`);
    const data = await res.json();
    return data.screenshot || null;
  } catch {
    return null;
  }
}

export async function getPageInfo() {
  try {
    const res = await fetch(`${AGENT_SERVER_URL}/page-info`);
    return await res.json();
  } catch {
    return null;
  }
}

export async function extractContent(selector?: string) {
  try {
    const res = await fetch(`${AGENT_SERVER_URL}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selector }),
    });
    return await res.json();
  } catch {
    return { ok: false, content: '', error: 'Server not connected' };
  }
}

export async function pressKey(key: string) {
  try {
    const res = await fetch(`${AGENT_SERVER_URL}/press`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    return await res.json();
  } catch {
    return { ok: false };
  }
}

// ─── WEBSOCKET LIVE STREAM ──────────────────

export function connectLiveStream(
  onFrame: (dataUrl: string) => void,
  onLog: (msg: string) => void,
  onClose: () => void
): WebSocket | null {
  try {
    const ws = new WebSocket(AGENT_WS_URL);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'frame') {
          onFrame(`data:image/jpeg;base64,${msg.data}`);
        } else if (msg.type === 'log') {
          onLog(msg.message);
        }
      } catch {
        const blob = new Blob([e.data], { type: 'image/jpeg' });
        onFrame(URL.createObjectURL(blob));
      }
    };
    ws.onclose = onClose;
    ws.onerror = () => { onClose(); };
    return ws;
  } catch {
    return null;
  }
}

// ─── AI: GENERATE REAL ACTION PLAN ──────────
// Returns structured actions the agent will actually execute

export interface AgentAction {
  type: 'navigate' | 'click' | 'type' | 'extract' | 'screenshot' | 'wait' | 'press' | 'analyze';
  description: string;
  url?: string;
  selector?: string;
  text?: string;
  key?: string;
  instruction?: string;
}

export async function aiGenerateActionPlan(task: string): Promise<AgentAction[]> {
  const prompt = `You are an autonomous browser agent. Given a task, generate a precise sequence of browser actions to complete it.

Return ONLY a JSON array of action objects. Each action must have:
- "type": one of: "navigate", "click", "type", "extract", "screenshot", "wait", "press", "analyze"  
- "description": human-readable label for this step
- For "navigate": include "url" (full URL with https://)
- For "click": include "selector" (CSS selector or text description)
- For "type": include "selector" and "text"
- For "press": include "key" (e.g. "Enter")
- For "extract": optionally include "selector"
- For "analyze": include "instruction" (what to do with extracted content)

Task: ${task}

Example for "search google for python tutorials":
[
  {"type":"navigate","description":"Open Google","url":"https://www.google.com"},
  {"type":"screenshot","description":"Capture Google homepage"},
  {"type":"click","description":"Click search box","selector":"textarea[name=q]"},
  {"type":"type","description":"Type search query","selector":"textarea[name=q]","text":"python tutorials"},
  {"type":"press","description":"Submit search","key":"Enter"},
  {"type":"screenshot","description":"Capture search results"},
  {"type":"extract","description":"Extract search results","selector":"#search"},
  {"type":"analyze","description":"Summarize results","instruction":"Summarize the top search results for python tutorials"}
]

Return ONLY the JSON array, no other text.`;

  if (AI_KEYS.gemini) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${AI_KEYS.gemini}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const match = text.match(/\[[\s\S]*\]/);
      if (match) return JSON.parse(match[0]);
    } catch (e) {
      console.warn('[AI] Gemini failed:', e);
    }
  }

  if (AI_KEYS.groq) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${AI_KEYS.groq}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
        }),
      });
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content || '';
      const match = text.match(/\[[\s\S]*\]/);
      if (match) return JSON.parse(match[0]);
    } catch (e) {
      console.warn('[AI] Groq failed:', e);
    }
  }

  // Fallback for common tasks
  if (task.toLowerCase().includes('google') || task.toLowerCase().includes('search')) {
    const query = task.replace(/search (google )?for /i, '').replace(/google /i, '');
    return [
      { type: 'navigate', description: 'Open Google', url: 'https://www.google.com' },
      { type: 'screenshot', description: 'Capture page' },
      { type: 'type', description: 'Enter search query', selector: 'textarea[name=q]', text: query },
      { type: 'press', description: 'Submit search', key: 'Enter' },
      { type: 'screenshot', description: 'Capture results' },
      { type: 'extract', description: 'Extract results' },
      { type: 'analyze', description: 'Summarize findings', instruction: `Summarize what was found for: ${task}` },
    ];
  }

  return [
    { type: 'navigate', description: 'Open browser', url: 'https://www.google.com' },
    { type: 'screenshot', description: 'Capture initial state' },
    { type: 'extract', description: 'Extract page content' },
    { type: 'analyze', description: 'Analyze and summarize', instruction: `Complete this task: ${task}` },
  ];
}

// Keep old function for compatibility
export async function aiGeneratePlan(task: string): Promise<string[]> {
  const actions = await aiGenerateActionPlan(task);
  return actions.map(a => a.description);
}

// ─── REAL AGENT EXECUTOR ────────────────────
// This actually drives the Playwright server step by step

export interface ExecutionCallbacks {
  onStepStart: (index: number, description: string) => void;
  onStepDone: (index: number, result?: string) => void;
  onStepError: (index: number, error: string) => void;
  onScreenshot: (dataUrl: string) => void;
  onLog: (message: string, type?: 'info' | 'action' | 'success' | 'error') => void;
  onProgress: (percent: number) => void;
}

export async function executeAgentPlan(
  actions: AgentAction[],
  callbacks: ExecutionCallbacks
): Promise<string> {
  let extractedContent = '';
  let finalResult = '';

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const pct = Math.round(((i + 1) / actions.length) * 100);

    callbacks.onStepStart(i, action.description);
    callbacks.onLog(`▶ ${action.description}`, 'action');

    try {
      switch (action.type) {
        case 'navigate': {
          if (!action.url) break;
          callbacks.onLog(`Navigating to ${action.url}`, 'info');
          const result = await navigateTo(action.url);
          if (result.ok) {
            callbacks.onLog(`Loaded: ${result.title || action.url}`, 'success');
            // Get screenshot after navigation
            await new Promise(r => setTimeout(r, 800));
            const ss = await getScreenshot();
            if (ss) callbacks.onScreenshot(ss);
            callbacks.onStepDone(i, result.title);
          } else {
            callbacks.onStepError(i, result.error || 'Navigation failed');
          }
          break;
        }

        case 'click': {
          if (!action.selector) break;
          callbacks.onLog(`Clicking: ${action.selector}`, 'info');
          const result = await clickElement(action.selector);
          await new Promise(r => setTimeout(r, 600));
          const ss = await getScreenshot();
          if (ss) callbacks.onScreenshot(ss);
          if (result.ok) {
            callbacks.onStepDone(i, 'Clicked');
          } else {
            callbacks.onLog(`Click failed: ${result.error}`, 'error');
            callbacks.onStepError(i, result.error || 'Click failed');
          }
          break;
        }

        case 'type': {
          if (!action.selector || !action.text) break;
          callbacks.onLog(`Typing "${action.text}" into ${action.selector}`, 'info');
          const result = await typeText(action.selector, action.text);
          const ss = await getScreenshot();
          if (ss) callbacks.onScreenshot(ss);
          callbacks.onStepDone(i, result.ok ? 'Typed' : result.error);
          break;
        }

        case 'press': {
          if (!action.key) break;
          callbacks.onLog(`Pressing ${action.key}`, 'info');
          await pressKey(action.key);
          await new Promise(r => setTimeout(r, 1000));
          const ss = await getScreenshot();
          if (ss) callbacks.onScreenshot(ss);
          callbacks.onStepDone(i, 'Key pressed');
          break;
        }

        case 'screenshot': {
          callbacks.onLog('Taking screenshot', 'info');
          await new Promise(r => setTimeout(r, 400));
          const ss = await getScreenshot();
          if (ss) {
            callbacks.onScreenshot(ss);
            callbacks.onStepDone(i, 'Screenshot captured');
          } else {
            callbacks.onStepError(i, 'Screenshot failed — browser not connected');
          }
          break;
        }

        case 'extract': {
          callbacks.onLog(`Extracting page content`, 'info');
          const result = await extractContent(action.selector);
          if (result.ok && result.content) {
            extractedContent = result.content;
            callbacks.onLog(`Extracted ${result.content.length} chars`, 'success');
            callbacks.onStepDone(i, `${result.content.slice(0, 80)}...`);
          } else {
            callbacks.onStepError(i, 'No content extracted');
          }
          break;
        }

        case 'analyze': {
          callbacks.onLog('Analyzing content with AI...', 'info');
          const instruction = action.instruction || 'Summarize the content';
          const analysis = await aiAnalyze(
            extractedContent || 'No content was extracted from the page.',
            instruction
          );
          finalResult = analysis;
          callbacks.onLog(`Analysis: ${analysis.slice(0, 100)}...`, 'success');
          callbacks.onStepDone(i, analysis);
          break;
        }

        case 'wait': {
          callbacks.onLog('Waiting for page...', 'info');
          await new Promise(r => setTimeout(r, 1500));
          const ss = await getScreenshot();
          if (ss) callbacks.onScreenshot(ss);
          callbacks.onStepDone(i, 'Waited');
          break;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      callbacks.onLog(`Error: ${msg}`, 'error');
      callbacks.onStepError(i, msg);
    }

    callbacks.onProgress(pct);
  }

  if (!finalResult) {
    if (extractedContent) {
      finalResult = await aiAnalyze(extractedContent, 'Provide a concise summary of what was found on the page.');
    } else {
      finalResult = 'Task completed. All browser actions were executed.';
    }
  }

  return finalResult;
}

export async function aiAnalyze(content: string, instruction: string): Promise<string> {
  const prompt = `${instruction}\n\nContent:\n${content.slice(0, 3000)}`;

  if (AI_KEYS.gemini) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${AI_KEYS.gemini}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );
      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No analysis available.';
    } catch { /* fall through */ }
  }

  if (AI_KEYS.groq) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${AI_KEYS.groq}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
        }),
      });
      const data = await res.json();
      return data?.choices?.[0]?.message?.content || 'No analysis available.';
    } catch { /* fall through */ }
  }

  return 'AI analysis unavailable — add API keys to your .env file.';
}

export { AGENT_SERVER_URL, AGENT_WS_URL, AI_KEYS };
