/**
 * ========================================
 * BACKEND API PLACEHOLDERS
 * ========================================
 * All backend connections go through here.
 * Replace placeholder URLs with your real endpoints.
 * API keys are loaded from environment variables (see .env.example).
 */

// ─── CONFIGURATION ──────────────────────────
// TODO: Replace with your deployed agent server URL
const AGENT_SERVER_URL = import.meta.env.VITE_AGENT_SERVER_URL || 'http://localhost:3001';

// TODO: Replace with your WebSocket endpoint for live browser streaming
const AGENT_WS_URL = AGENT_SERVER_URL.replace(/^http/, 'ws') + '/live';

// AI API Keys (loaded from environment variables)
const AI_KEYS = {
  gemini: import.meta.env.VITE_GEMINI_KEY || '',
  groq: import.meta.env.VITE_GROQ_KEY || '',
  cohere: import.meta.env.VITE_COHERE_KEY || '',
  huggingface: import.meta.env.VITE_HF_KEY || '',
};

// ─── AGENT SERVER (Playwright Backend) ──────
/**
 * POST /run — Start an agent task
 * The backend runs Playwright + AI to execute the task.
 * Returns a task_id for tracking.
 *
 * TODO: Connect to your deployed agent server
 */
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
    console.warn('[API] Agent server not available, running in demo mode');
    return `demo_${Date.now()}`;
  }
}

/**
 * POST /navigate — Navigate browser to URL
 * TODO: Connect to Playwright backend
 */
export async function navigateTo(url: string) {
  try {
    const res = await fetch(`${AGENT_SERVER_URL}/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    return await res.json();
  } catch {
    return { ok: false, title: url, error: 'Server not connected' };
  }
}

/**
 * POST /click — Click element in browser
 */
export async function clickElement(selector: string) {
  try {
    const res = await fetch(`${AGENT_SERVER_URL}/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selector }),
    });
    return await res.json();
  } catch {
    return { ok: false, error: 'Server not connected' };
  }
}

/**
 * POST /type — Type text into element
 */
export async function typeText(selector: string, text: string) {
  try {
    const res = await fetch(`${AGENT_SERVER_URL}/type`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selector, text }),
    });
    return await res.json();
  } catch {
    return { ok: false, error: 'Server not connected' };
  }
}

/**
 * GET /screenshot — Get current browser screenshot
 */
export async function getScreenshot(): Promise<string | null> {
  try {
    const res = await fetch(`${AGENT_SERVER_URL}/screenshot`);
    const data = await res.json();
    return data.screenshot || null;
  } catch {
    return null;
  }
}

/**
 * POST /extract — Extract text content from page
 */
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

// ─── WEBSOCKET LIVE STREAM ──────────────────
/**
 * Connect to live browser stream via WebSocket.
 * Server sends base64 JPEG frames continuously.
 *
 * TODO: Connect to your Playwright server WebSocket
 */
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
        // Binary frame
        const blob = new Blob([e.data], { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);
        onFrame(url);
      }
    };
    ws.onclose = onClose;
    ws.onerror = () => {
      console.warn('[WS] Cannot connect to live stream');
      onClose();
    };
    return ws;
  } catch {
    console.warn('[WS] WebSocket not available');
    return null;
  }
}

// ─── AI API CALLS ───────────────────────────
/**
 * Call AI to generate a plan from a task description.
 * Tries Gemini first, then Groq, then Cohere.
 */
export async function aiGeneratePlan(task: string): Promise<string[]> {
  const prompt = `You are StudyAgent, an autonomous AI study assistant. Break this task into clear executable steps (max 8 steps). Return ONLY a JSON array of step strings, no other text.\n\nTask: ${task}`;

  // Try Gemini
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
      const match = text.match(/\[[\s\S]*?\]/);
      if (match) return JSON.parse(match[0]);
    } catch (e) {
      console.warn('[AI] Gemini failed:', e);
    }
  }

  // Try Groq
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
      const text = data?.choices?.[0]?.message?.content || '';
      const match = text.match(/\[[\s\S]*?\]/);
      if (match) return JSON.parse(match[0]);
    } catch (e) {
      console.warn('[AI] Groq failed:', e);
    }
  }

  // Fallback: generic steps
  return [
    `Analyze the task: "${task}"`,
    'Open browser and navigate to relevant page',
    'Extract required information',
    'Process and organize results',
    'Save results to database',
  ];
}

/**
 * Call AI to analyze/summarize extracted content.
 */
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
    } catch {
      // fall through
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
          temperature: 0.3,
        }),
      });
      const data = await res.json();
      return data?.choices?.[0]?.message?.content || 'No analysis available.';
    } catch {
      // fall through
    }
  }

  return 'AI analysis unavailable — no API keys configured. Add keys to your .env file.';
}

export { AGENT_SERVER_URL, AGENT_WS_URL, AI_KEYS };
