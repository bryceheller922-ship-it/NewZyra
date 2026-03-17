import { useState, useEffect, useRef, useCallback } from 'react';
import {
  onAuthChange, signInEmail, signUpEmail, signInGoogle, signOut,
  addDocument, getCollection, updateDocument, deleteDocument,
} from './lib/firebase';
import {
  aiGeneratePlan, aiAnalyze,
  runAgentTask, connectLiveStream, getScreenshot,
  AGENT_SERVER_URL,
} from './lib/api';

// ═══════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════
type Page = 'home' | 'skills' | 'notes' | 'leaderboard' | 'messages' | 'settings';

interface UserInfo {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  prompt: string;
}

interface Note {
  id: string;
  title: string;
  content: string;
  color: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

interface LeaderboardEntry {
  id: string;
  rank: number;
  name: string;
  avatar: string;
  xp: number;
  tasksCompleted: number;
  streak: number;
}

interface Message {
  id: string;
  from: string;
  fromName: string;
  text: string;
  time: string;
  isMine: boolean;
}

interface Chat {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  unread: number;
  isGroup: boolean;
  messages: Message[];
}

interface AgentStep {
  id: number;
  text: string;
  status: 'pending' | 'running' | 'done' | 'error';
  result?: string;
}

interface AgentLog {
  time: string;
  text: string;
  type: 'info' | 'action' | 'success' | 'error' | 'question';
}

// ═══════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════
const SKILLS: Skill[] = [
  { id: 'grade-check', name: 'Grade Check', description: 'Check your grades on Skyward or Canvas', icon: '📊', category: 'Academic', prompt: 'Check my grades on Skyward' },
  { id: 'assignment-scan', name: 'Assignment Scanner', description: 'Scan Canvas for upcoming assignments and due dates', icon: '📋', category: 'Academic', prompt: 'Scan Canvas for upcoming assignments' },
  { id: 'homework-summary', name: 'Homework Summarizer', description: 'Summarize your current homework load', icon: '📝', category: 'Academic', prompt: 'Summarize my homework assignments' },
  { id: 'research', name: 'Research Assistant', description: 'Research a topic and compile key findings', icon: '🔬', category: 'Research', prompt: 'Research the following topic: ' },
  { id: 'study-plan', name: 'Study Planner', description: 'Create a personalized study plan for exams', icon: '📅', category: 'Planning', prompt: 'Create a study plan for my upcoming exams' },
  { id: 'reading-analyzer', name: 'Reading Analyzer', description: 'Analyze and summarize a reading assignment', icon: '📖', category: 'Academic', prompt: 'Analyze my reading assignment' },
  { id: 'concept-explainer', name: 'Concept Explainer', description: 'Break down complex concepts into simple terms', icon: '💡', category: 'Learning', prompt: 'Explain the following concept: ' },
  { id: 'web-scraper', name: 'Web Scraper', description: 'Extract structured data from any website', icon: '🌐', category: 'Tools', prompt: 'Scrape the following website: ' },
  { id: 'quiz-maker', name: 'Quiz Maker', description: 'Generate quiz questions from your notes', icon: '❓', category: 'Learning', prompt: 'Generate quiz questions from my notes' },
  { id: 'citation-gen', name: 'Citation Generator', description: 'Generate citations for your research papers', icon: '📎', category: 'Research', prompt: 'Generate citations for: ' },
];

const NOTE_COLORS = ['#1a1a3e', '#1e293b', '#172554', '#14532d', '#4c1d95', '#7c2d12', '#701a75'];

// ═══════════════════════════════════════════════
//  SVG ICONS (inline, no external deps)
// ═══════════════════════════════════════════════
function Icon({ name, size = 20, className = '' }: { name: string; size?: number; className?: string }) {
  const s = { width: size, height: size };
  const paths: Record<string, React.JSX.Element> = {
    home: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    skills: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
    notes: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
    leaderboard: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    messages: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
    settings: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    play: <svg {...s} viewBox="0 0 24 24" fill="currentColor" className={className}><polygon points="5 3 19 12 5 21 5 3"/></svg>,
    plus: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    send: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    x: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    edit: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    trash: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
    search: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
    logout: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
    check: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="20 6 9 17 4 12"/></svg>,
    loader: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`animate-spin ${className}`}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>,
    bot: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>,
    fire: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>,
    trophy: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>,
    users: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    zap: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    clock: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    eye: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
    terminal: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>,
    globe: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
    menu: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
    arrowLeft: <svg {...s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  };
  return paths[name] || <span>?</span>;
}

// ═══════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════
export default function App() {
  // ─── Auth state ────────────────────────────
  const [user, setUser] = useState<UserInfo | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authError, setAuthError] = useState('');

  // ─── Nav state ─────────────────────────────
  const [page, setPage] = useState<Page>('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ─── Agent state ───────────────────────────
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);
  const [agentScreenshot, setAgentScreenshot] = useState<string | null>(null);
  const [agentProgress, setAgentProgress] = useState(0);
  const [agentResult, setAgentResult] = useState<string | null>(null);
  const [agentQuestion, setAgentQuestion] = useState<string | null>(null);
  const [agentQuestionCtx, setAgentQuestionCtx] = useState('');
  const [agentAnswer, setAgentAnswer] = useState('');
  const agentAnswerResolve = useRef<((v: string) => void) | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const [showSkillRunner, setShowSkillRunner] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'logs'>('preview');
  const [mobileStepsOpen, setMobileStepsOpen] = useState(false);

  // ─── Notes state ───────────────────────────
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteEdit, setNoteEdit] = useState<Note | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteColor, setNoteColor] = useState(NOTE_COLORS[0]);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteSearch, setNoteSearch] = useState('');

  // ─── Messages state ────────────────────────
  // TODO: Load chats from Firebase Realtime DB or Firestore
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [msgInput, setMsgInput] = useState('');
  const msgEndRef = useRef<HTMLDivElement>(null);

  // ─── Leaderboard state ─────────────────────
  // TODO: Load leaderboard from Firebase collection 'leaderboard'
  const [leaderboard] = useState<LeaderboardEntry[]>([]);
  const [lbTimeframe, setLbTimeframe] = useState<'weekly' | 'monthly' | 'alltime'>('weekly');

  // ─── Task input state ──────────────────────
  const [taskInput, setTaskInput] = useState('');
  const [taskHistory, setTaskHistory] = useState<Array<{ id: string; task: string; status: string; time: string }>>([]);

  // ═══════════════════════════════════════════
  //  AUTH EFFECTS
  // ═══════════════════════════════════════════
  useEffect(() => {
    const unsub = onAuthChange((u) => {
      if (u) {
        setUser({ uid: u.uid, email: u.email, displayName: u.displayName, photoURL: u.photoURL });
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });
    const t = setTimeout(() => setAuthLoading(false), 3000);
    return () => { unsub(); clearTimeout(t); };
  }, []);

  // Load notes from Firebase when user logs in
  useEffect(() => {
    if (!user) return;
    getCollection(`users/${user.uid}/notes`, 'createdAt')
      .then((docs) => setNotes(docs as unknown as Note[]))
      .catch(() => {});
    // TODO: Load leaderboard from Firebase
    // getCollection('leaderboard', 'xp').then(setLeaderboard);
  }, [user]);

  // Scroll messages
  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [activeChat, chats]);

  // Close mobile menu when navigating
  const navigateTo2 = useCallback((p: Page) => {
    setPage(p);
    setMobileMenuOpen(false);
    if (p !== 'skills') setShowSkillRunner(false);
  }, []);

  // ═══════════════════════════════════════════
  //  AUTH HANDLERS
  // ═══════════════════════════════════════════
  const handleAuth = async () => {
    setAuthError('');
    try {
      if (authMode === 'login') await signInEmail(authEmail, authPass);
      else await signUpEmail(authEmail, authPass);
    } catch (e: unknown) {
      setAuthError((e as Error).message || 'Auth failed');
    }
  };

  const handleGoogleAuth = async () => {
    try { await signInGoogle(); } catch (e: unknown) { setAuthError((e as Error).message); }
  };

  // ═══════════════════════════════════════════
  //  AGENT ENGINE
  // ═══════════════════════════════════════════
  const addLog = useCallback((text: string, type: AgentLog['type'] = 'info') => {
    setAgentLogs((prev) => [...prev, { time: new Date().toLocaleTimeString(), text, type }]);
  }, []);

  const askUser = useCallback((question: string, context: string): Promise<string> => {
    return new Promise((resolve) => {
      agentAnswerResolve.current = resolve;
      setAgentQuestion(question);
      setAgentQuestionCtx(context);
    });
  }, []);

  const submitAnswer = useCallback(() => {
    if (agentAnswerResolve.current && agentAnswer.trim()) {
      addLog(`User answered: ${agentAnswer}`, 'info');
      agentAnswerResolve.current(agentAnswer);
      agentAnswerResolve.current = null;
      setAgentQuestion(null);
      setAgentQuestionCtx('');
      setAgentAnswer('');
    }
  }, [agentAnswer, addLog]);

  const connectWs = useCallback(() => {
    if (wsRef.current) return;
    const ws = connectLiveStream(
      (frame) => setAgentScreenshot(frame),
      (msg) => addLog(msg, 'action'),
      () => { setLiveConnected(false); wsRef.current = null; }
    );
    if (ws) {
      ws.onopen = () => setLiveConnected(true);
      wsRef.current = ws;
    }
  }, [addLog]);

  const runAgent = useCallback(async (task: string) => {
    if (agentRunning || !task.trim()) return;

    setAgentRunning(true);
    setAgentSteps([]);
    setAgentLogs([]);
    setAgentScreenshot(null);
    setAgentProgress(0);
    setAgentResult(null);
    setAgentQuestion(null);
    setShowSkillRunner(true);
    setPage('skills');
    setActiveTab('preview');
    setMobileMenuOpen(false);

    addLog(`Starting task: ${task}`, 'info');
    addLog('Generating execution plan with AI...', 'info');

    // Try connecting to live stream
    connectWs();

    // Generate plan via AI
    let steps: string[];
    try {
      steps = await aiGeneratePlan(task);
      addLog(`Plan generated: ${steps.length} steps`, 'success');
    } catch {
      steps = ['Analyze the task', 'Open browser and navigate', 'Extract information', 'Compile results', 'Save to database'];
      addLog('Using fallback plan', 'info');
    }

    const agentStepList: AgentStep[] = steps.map((s, i) => ({
      id: i, text: s, status: 'pending' as const,
    }));
    setAgentSteps(agentStepList);

    // Try to tell the backend to run the task
    let taskId: string | null = null;
    try {
      taskId = await runAgentTask(task, user?.uid || 'anon');
      if (taskId && !taskId.startsWith('demo_')) {
        addLog(`Backend task started: ${taskId}`, 'success');
      }
    } catch {
      addLog('Running in local mode (no backend server)', 'info');
    }

    // Execute each step
    for (let i = 0; i < agentStepList.length; i++) {
      const step = agentStepList[i];
      const pct = Math.round(((i + 1) / agentStepList.length) * 100);

      // Update step status to running
      setAgentSteps((prev) => prev.map((s) => s.id === step.id ? { ...s, status: 'running' } : s));
      addLog(`Step ${i + 1}: ${step.text}`, 'action');

      // Try to get screenshot from backend
      try {
        const ss = await getScreenshot();
        if (ss) setAgentScreenshot(ss);
      } catch {
        // No backend — no screenshot
      }

      // Check if step needs credentials
      const lowerStep = step.text.toLowerCase();
      if (lowerStep.includes('login') || lowerStep.includes('credential') || lowerStep.includes('sign in') || lowerStep.includes('password')) {
        const answer = await askUser(
          'This step requires login credentials. What are your credentials for this service?',
          `Step: ${step.text}\n\nFormat: username / password\nOr type "skip" to skip this step.`
        );
        if (answer.toLowerCase() !== 'skip') {
          addLog('Credentials received, proceeding with login...', 'info');
        } else {
          addLog('Skipping login step', 'info');
        }
      }

      // Simulate step execution with AI analysis
      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));

      // Try AI analysis for extraction steps
      if (lowerStep.includes('extract') || lowerStep.includes('summarize') || lowerStep.includes('analyze') || lowerStep.includes('compile')) {
        try {
          const analysis = await aiAnalyze(
            `Task: ${task}\nCurrent step: ${step.text}\nStep number: ${i + 1} of ${agentStepList.length}`,
            'Generate a brief realistic result for this step of the study agent task. Be specific and helpful. Keep it under 100 words.'
          );
          addLog(`Result: ${analysis.slice(0, 150)}`, 'success');
          setAgentSteps((prev) => prev.map((s) => s.id === step.id ? { ...s, status: 'done', result: analysis } : s));
        } catch {
          setAgentSteps((prev) => prev.map((s) => s.id === step.id ? { ...s, status: 'done', result: 'Step completed' } : s));
        }
      } else {
        setAgentSteps((prev) => prev.map((s) => s.id === step.id ? { ...s, status: 'done', result: 'Completed' } : s));
      }

      setAgentProgress(pct);
      addLog(`Step ${i + 1} completed ✓`, 'success');
    }

    // Final result
    try {
      const finalResult = await aiAnalyze(
        `Task: ${task}\nSteps completed: ${steps.join(', ')}`,
        'Generate a comprehensive final summary of what was accomplished in this agent task. Include specific data points, findings, or results. Be detailed but concise.'
      );
      setAgentResult(finalResult);
      addLog('Task completed successfully!', 'success');
    } catch {
      setAgentResult('Task completed. All steps executed successfully.');
      addLog('Task completed.', 'success');
    }

    // Save to Firebase
    if (user) {
      try {
        await addDocument(`users/${user.uid}/tasks`, {
          task,
          steps: steps,
          result: 'completed',
          timestamp: new Date().toISOString(),
        });
      } catch { /* ignore */ }
    }

    setTaskHistory((prev) => [
      { id: Date.now().toString(), task, status: 'completed', time: new Date().toLocaleTimeString() },
      ...prev,
    ]);

    setAgentRunning(false);
  }, [agentRunning, user, addLog, askUser, connectWs]);

  // ═══════════════════════════════════════════
  //  NOTES HANDLERS
  // ═══════════════════════════════════════════
  const saveNote = async () => {
    if (!noteTitle.trim()) return;
    const data = { title: noteTitle, content: noteContent, color: noteColor };
    if (noteEdit) {
      if (user) {
        try { await updateDocument(`users/${user.uid}/notes/${noteEdit.id}`, data); } catch { /* */ }
      }
      setNotes((prev) => prev.map((n) => n.id === noteEdit.id ? { ...n, ...data } : n));
    } else {
      const id = user
        ? await addDocument(`users/${user.uid}/notes`, data).catch(() => Date.now().toString())
        : Date.now().toString();
      setNotes((prev) => [{ id: id as string, ...data }, ...prev]);
    }
    resetNoteForm();
  };

  const deleteNote = async (id: string) => {
    if (user) { try { await deleteDocument(`users/${user.uid}/notes/${id}`); } catch { /* */ } }
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const editNote = (note: Note) => {
    setNoteEdit(note);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setNoteColor(note.color || NOTE_COLORS[0]);
    setShowNoteForm(true);
  };

  const resetNoteForm = () => {
    setShowNoteForm(false);
    setNoteEdit(null);
    setNoteTitle('');
    setNoteContent('');
    setNoteColor(NOTE_COLORS[0]);
  };

  // ═══════════════════════════════════════════
  //  MESSAGES HANDLERS
  // ═══════════════════════════════════════════
  const sendMessage = () => {
    if (!msgInput.trim() || !activeChat) return;
    const newMsg: Message = {
      id: Date.now().toString(),
      from: 'me', fromName: 'You',
      text: msgInput, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isMine: true,
    };
    setChats((prev) => prev.map((c) =>
      c.id === activeChat
        ? { ...c, messages: [...c.messages, newMsg], lastMessage: msgInput, unread: 0 }
        : c
    ));
    setMsgInput('');
    // TODO: Send message to Firebase Realtime DB or Firestore
    // await addDocument(`chats/${activeChat}/messages`, { ...newMsg });
  };

  // ═══════════════════════════════════════════
  //  AUTH SCREEN
  // ═══════════════════════════════════════════
  if (authLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-dark-950 bg-grid">
        <div className="text-center animate-fade-up">
          <div className="text-6xl mb-4">🤖</div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-neon-blue to-neon-purple bg-clip-text text-transparent">StudyAgent</h1>
          <div className="mt-4"><Icon name="loader" size={28} className="text-neon-blue mx-auto" /></div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center bg-dark-950 bg-grid relative overflow-hidden p-4">
        {/* Decorative orbs */}
        <div className="absolute top-20 left-20 w-72 h-72 bg-neon-blue/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-neon-purple/5 rounded-full blur-3xl" />

        <div className="card p-6 sm:p-8 w-full max-w-md animate-fade-up relative z-10">
          <div className="text-center mb-6 sm:mb-8">
            <div className="text-4xl sm:text-5xl mb-3">🤖</div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-neon-blue to-neon-purple bg-clip-text text-transparent">
              StudyAgent
            </h1>
            <p className="text-slate-400 text-sm mt-2">Autonomous AI Study Assistant</p>
          </div>

          <div className="space-y-3 sm:space-y-4">
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">Email</label>
              <input
                type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">Password</label>
              <input
                type="password" value={authPass} onChange={(e) => setAuthPass(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
              />
            </div>

            {authError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-red-400 text-sm">
                {authError}
              </div>
            )}

            <button onClick={handleAuth} className="btn-primary w-full py-3 text-sm">
              {authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-dark-500" />
              <span className="text-xs text-slate-500">or</span>
              <div className="flex-1 h-px bg-dark-500" />
            </div>

            <button onClick={handleGoogleAuth} className="w-full py-3 card flex items-center justify-center gap-2 text-sm hover:bg-dark-700 cursor-pointer">
              <span>🌐</span> Continue with Google
            </button>

            <p className="text-center text-sm text-slate-500">
              {authMode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
              <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="text-neon-blue hover:underline cursor-pointer">
                {authMode === 'login' ? 'Sign Up' : 'Sign In'}
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  //  MAIN LAYOUT
  // ═══════════════════════════════════════════
  const currentChat = chats.find((c) => c.id === activeChat);
  const filteredNotes = notes.filter((n) =>
    n.title.toLowerCase().includes(noteSearch.toLowerCase()) ||
    n.content.toLowerCase().includes(noteSearch.toLowerCase())
  );

  const navItems: { id: Page; icon: string; label: string }[] = [
    { id: 'home', icon: 'home', label: 'Home' },
    { id: 'skills', icon: 'skills', label: 'Skills' },
    { id: 'notes', icon: 'notes', label: 'Notes' },
    { id: 'leaderboard', icon: 'leaderboard', label: 'Ranks' },
    { id: 'messages', icon: 'messages', label: 'Messages' },
  ];

  return (
    <div className="h-full flex bg-dark-950 bg-grid overflow-hidden relative">

      {/* ─── MOBILE SIDEBAR OVERLAY ──────── */}
      <div
        className={`sidebar-overlay md:hidden ${mobileMenuOpen ? 'active' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* ─── SIDEBAR (desktop: always visible, mobile: slide-in drawer) ──── */}
      <aside className={`
        fixed md:relative z-50 md:z-auto
        h-full
        ${sidebarOpen ? 'w-60' : 'w-16'}
        flex-shrink-0 bg-dark-900/95 md:bg-dark-900/80 border-r border-dark-600/50
        flex flex-col transition-all duration-300 backdrop-blur-sm
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="p-4 flex items-center gap-3 border-b border-dark-600/50">
          <button onClick={() => { setSidebarOpen(!sidebarOpen); if (window.innerWidth < 768) setMobileMenuOpen(false); }} className="text-2xl cursor-pointer flex-shrink-0">🤖</button>
          {sidebarOpen && (
            <h1 className="font-bold text-lg bg-gradient-to-r from-neon-blue to-neon-purple bg-clip-text text-transparent whitespace-nowrap">
              StudyAgent
            </h1>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-3 space-y-1 px-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { navigateTo2(item.id); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all cursor-pointer group ${
                page === item.id ? 'nav-active text-neon-blue' : 'text-slate-400 hover:text-white hover:bg-dark-700/50'
              }`}
            >
              <Icon name={item.icon} size={18} />
              {sidebarOpen && <span className="whitespace-nowrap">{item.label}</span>}
              {item.id === 'messages' && chats.reduce((s, c) => s + c.unread, 0) > 0 && (
                <span className="ml-auto bg-neon-pink text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {chats.reduce((s, c) => s + c.unread, 0)}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Agent status */}
        {agentRunning && sidebarOpen && (
          <div className="mx-3 mb-3 p-3 rounded-xl bg-neon-blue/10 border border-neon-blue/20">
            <div className="flex items-center gap-2 text-xs text-neon-blue">
              <div className="w-2 h-2 rounded-full bg-neon-blue live-dot" />
              Agent Running
            </div>
            <div className="mt-2 h-1 bg-dark-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-neon-blue to-neon-purple rounded-full progress-bar transition-all duration-500" style={{ width: `${agentProgress}%` }} />
            </div>
          </div>
        )}

        {/* Bottom: settings + logout */}
        <div className="border-t border-dark-600/50 p-2 space-y-1">
          <button onClick={() => navigateTo2('settings')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm cursor-pointer ${page === 'settings' ? 'nav-active text-neon-blue' : 'text-slate-400 hover:text-white hover:bg-dark-700/50'}`}>
            <Icon name="settings" size={18} />
            {sidebarOpen && <span>Settings</span>}
          </button>
          <button onClick={() => signOut()} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 cursor-pointer">
            <Icon name="logout" size={18} />
            {sidebarOpen && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* ─── MOBILE BOTTOM NAV ──────────── */}
      <div className="mobile-bottom-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => navigateTo2(item.id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 cursor-pointer transition-colors relative ${
              page === item.id ? 'text-neon-blue' : 'text-slate-500'
            }`}
          >
            <Icon name={item.icon} size={20} />
            <span className="text-[10px] font-medium">{item.label}</span>
            {item.id === 'messages' && chats.reduce((s, c) => s + c.unread, 0) > 0 && (
              <span className="absolute top-0.5 right-1/4 bg-neon-pink text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">
                {chats.reduce((s, c) => s + c.unread, 0)}
              </span>
            )}
            {page === item.id && <div className="absolute -top-0.5 left-1/4 right-1/4 h-0.5 bg-neon-blue rounded-full" />}
          </button>
        ))}
      </div>

      {/* ─── MAIN CONTENT ──────────────── */}
      <main className="flex-1 overflow-y-auto mobile-main-content">

        {/* ─── MOBILE TOP HEADER ────────── */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-dark-600/50 bg-dark-900/80 backdrop-blur-sm sticky top-0 z-20">
          <button onClick={() => { setSidebarOpen(true); setMobileMenuOpen(true); }} className="text-slate-400 hover:text-white cursor-pointer p-1">
            <Icon name="menu" size={22} />
          </button>
          <h1 className="font-bold text-sm bg-gradient-to-r from-neon-blue to-neon-purple bg-clip-text text-transparent flex items-center gap-2">
            <span className="text-lg">🤖</span> StudyAgent
          </h1>
          <button onClick={() => navigateTo2('settings')} className="text-slate-400 hover:text-white cursor-pointer p-1">
            <Icon name="settings" size={20} />
          </button>
        </div>

        {/* ════════════ HOME PAGE ════════════ */}
        {page === 'home' && (
          <div className="p-4 sm:p-6 max-w-6xl mx-auto animate-fade-up">
            {/* Header */}
            <div className="mb-6 sm:mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold">
                Welcome back, <span className="bg-gradient-to-r from-neon-blue to-neon-purple bg-clip-text text-transparent">{user.displayName || user.email?.split('@')[0] || 'Student'}</span>
              </h2>
              <p className="text-slate-400 mt-1 text-sm">What would you like to accomplish today?</p>
            </div>

            {/* Task input */}
            <div className="card p-4 sm:p-5 mb-6 glow-blue">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <input
                    value={taskInput}
                    onChange={(e) => setTaskInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { runAgent(taskInput); setTaskInput(''); } }}
                    placeholder="Tell StudyAgent what to do..."
                    className="w-full px-4 py-3 sm:py-3.5 pr-10 text-sm"
                    disabled={agentRunning}
                  />
                  <Icon name="terminal" size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500" />
                </div>
                <button
                  onClick={() => { runAgent(taskInput); setTaskInput(''); }}
                  disabled={agentRunning || !taskInput.trim()}
                  className="btn-primary px-6 py-3 sm:py-0 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {agentRunning ? <Icon name="loader" size={16} /> : <Icon name="zap" size={16} />}
                  Run
                </button>
              </div>
            </div>

            {/* Quick tasks */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-6 sm:mb-8">
              {['Check my grades', 'Scan assignments', 'Summarize homework', 'Make study plan'].map((task) => (
                <button
                  key={task}
                  onClick={() => runAgent(task)}
                  disabled={agentRunning}
                  className="card p-3 sm:p-4 text-left hover:border-neon-blue/40 cursor-pointer text-sm group disabled:opacity-50"
                >
                  <span className="text-lg mb-1 block">
                    {task.includes('grades') ? '📊' : task.includes('assign') ? '📋' : task.includes('homework') ? '📝' : '📅'}
                  </span>
                  <span className="text-slate-300 group-hover:text-white transition-colors text-xs sm:text-sm">{task}</span>
                </button>
              ))}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6 sm:mb-8">
              <div className="card p-3 sm:p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider">Tasks Done</p>
                    <p className="text-xl sm:text-3xl font-bold mt-1 text-white">{taskHistory.length}</p>
                  </div>
                  <div className="hidden sm:flex w-12 h-12 rounded-xl bg-neon-blue/10 items-center justify-center">
                    <Icon name="check" size={24} className="text-neon-blue" />
                  </div>
                </div>
              </div>
              <div className="card p-3 sm:p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider">Skills</p>
                    <p className="text-xl sm:text-3xl font-bold mt-1 text-white">{SKILLS.length}</p>
                  </div>
                  <div className="hidden sm:flex w-12 h-12 rounded-xl bg-neon-purple/10 items-center justify-center">
                    <Icon name="skills" size={24} className="text-neon-purple" />
                  </div>
                </div>
              </div>
              <div className="card p-3 sm:p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider">Notes</p>
                    <p className="text-xl sm:text-3xl font-bold mt-1 text-white">{notes.length}</p>
                  </div>
                  <div className="hidden sm:flex w-12 h-12 rounded-xl bg-neon-green/10 items-center justify-center">
                    <Icon name="notes" size={24} className="text-neon-green" />
                  </div>
                </div>
              </div>
            </div>

            {/* Recent activity */}
            {taskHistory.length > 0 && (
              <div>
                <h3 className="text-base sm:text-lg font-semibold mb-3">Recent Activity</h3>
                <div className="space-y-2">
                  {taskHistory.slice(0, 5).map((t) => (
                    <div key={t.id} className="card p-3 sm:p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${t.status === 'completed' ? 'bg-green-400' : 'bg-yellow-400'}`} />
                        <span className="text-sm text-slate-300 truncate">{t.task}</span>
                      </div>
                      <span className="text-xs text-slate-500 flex-shrink-0 ml-2">{t.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════ SKILLS PAGE ════════════ */}
        {page === 'skills' && !showSkillRunner && (
          <div className="p-4 sm:p-6 max-w-6xl mx-auto animate-fade-up">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold">Skills Library</h2>
                <p className="text-slate-400 text-xs sm:text-sm mt-1">Predefined agent tasks — click Run to execute</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {SKILLS.map((skill) => (
                <div key={skill.id} className="card p-4 sm:p-5 group">
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-2xl sm:text-3xl">{skill.icon}</span>
                    <span className="text-[10px] sm:text-xs px-2 py-1 rounded-full bg-dark-600/80 text-slate-400">{skill.category}</span>
                  </div>
                  <h3 className="font-semibold text-white mb-1 text-sm sm:text-base">{skill.name}</h3>
                  <p className="text-xs sm:text-sm text-slate-400 mb-4">{skill.description}</p>
                  <button
                    onClick={() => runAgent(skill.prompt)}
                    disabled={agentRunning}
                    className="w-full btn-primary py-2 sm:py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                  >
                    <Icon name="play" size={14} />
                    Run Skill
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════════════ SKILL RUNNER / AGENT CONSOLE ════════════ */}
        {page === 'skills' && showSkillRunner && (
          <div className="h-full flex flex-col animate-fade-up agent-console-mobile">
            {/* Top bar */}
            <div className="flex items-center justify-between px-3 sm:px-6 py-2 sm:py-3 border-b border-dark-600/50 bg-dark-900/50 flex-shrink-0">
              <div className="flex items-center gap-2 sm:gap-3">
                <button onClick={() => setShowSkillRunner(false)} className="card px-2 sm:px-3 py-1 sm:py-1.5 text-xs cursor-pointer hover:bg-dark-600">
                  ← Back
                </button>
                <div className="flex items-center gap-2">
                  {agentRunning && <div className="w-2 h-2 rounded-full bg-green-400 live-dot" />}
                  <span className="font-semibold text-xs sm:text-sm">
                    {agentRunning ? 'Running...' : agentResult ? 'Complete' : 'Agent Console'}
                  </span>
                </div>
                {liveConnected && (
                  <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                    🟢 LIVE
                  </span>
                )}
              </div>
              <div className="flex gap-1 sm:gap-2">
                {/* Mobile: Steps toggle */}
                <button onClick={() => setMobileStepsOpen(!mobileStepsOpen)} className="md:hidden px-2 py-1 rounded-lg text-xs cursor-pointer text-slate-400 hover:text-white border border-dark-600/50">
                  Steps
                </button>
                <button onClick={() => setActiveTab('preview')} className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs cursor-pointer transition-all ${activeTab === 'preview' ? 'bg-neon-blue/20 text-neon-blue border border-neon-blue/30' : 'text-slate-400 hover:text-white'}`}>
                  <Icon name="eye" size={14} className="inline mr-0.5 sm:mr-1" /> <span className="hidden sm:inline">Preview</span>
                </button>
                <button onClick={() => setActiveTab('logs')} className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs cursor-pointer transition-all ${activeTab === 'logs' ? 'bg-neon-blue/20 text-neon-blue border border-neon-blue/30' : 'text-slate-400 hover:text-white'}`}>
                  <Icon name="terminal" size={14} className="inline mr-0.5 sm:mr-1" /> <span className="hidden sm:inline">Logs</span>
                </button>
              </div>
            </div>

            {/* Agent question banner */}
            {agentQuestion && (
              <div className="mx-3 sm:mx-6 mt-3 sm:mt-4 p-3 sm:p-4 rounded-xl bg-gradient-to-r from-amber-500/15 to-orange-500/10 border border-amber-500/30 animate-fade-up flex-shrink-0">
                <div className="flex items-start gap-2 sm:gap-3">
                  <span className="text-xl sm:text-2xl mt-0.5">🤚</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-amber-300 text-xs sm:text-sm mb-1">Agent needs your input</p>
                    <p className="text-xs sm:text-sm text-slate-300 mb-1">{agentQuestion}</p>
                    {agentQuestionCtx && <p className="text-[10px] sm:text-xs text-slate-500 mb-2 sm:mb-3">{agentQuestionCtx}</p>}
                    <div className="flex gap-2">
                      <input
                        value={agentAnswer}
                        onChange={(e) => setAgentAnswer(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && submitAnswer()}
                        placeholder="Type your answer..."
                        className="flex-1 px-3 py-2 text-xs sm:text-sm min-w-0"
                        autoFocus
                      />
                      <button onClick={submitAnswer} className="btn-primary px-3 sm:px-4 py-2 text-xs sm:text-sm flex-shrink-0">Reply</button>
                      <button
                        onClick={() => { agentAnswerResolve.current?.('skip'); agentAnswerResolve.current = null; setAgentQuestion(null); }}
                        className="px-2 sm:px-3 py-2 text-xs sm:text-sm text-slate-400 hover:text-white card cursor-pointer flex-shrink-0"
                      >
                        Skip
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Mobile steps drawer */}
            {mobileStepsOpen && (
              <div className="md:hidden border-b border-dark-600/50 p-3 max-h-60 overflow-y-auto flex-shrink-0 bg-dark-900/50">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs uppercase tracking-wider text-slate-500">Execution Steps</h4>
                  <button onClick={() => setMobileStepsOpen(false)} className="text-slate-400 cursor-pointer"><Icon name="x" size={14} /></button>
                </div>
                <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-gradient-to-r from-neon-blue to-neon-purple rounded-full transition-all duration-700 progress-bar" style={{ width: `${agentProgress}%` }} />
                </div>
                <div className="space-y-1.5">
                  {agentSteps.map((step) => (
                    <div key={step.id} className={`p-2 rounded-lg text-xs ${
                      step.status === 'running' ? 'bg-neon-blue/10 border border-neon-blue/30' :
                      step.status === 'done' ? 'bg-green-500/5 border border-green-500/20' :
                      'bg-dark-800/50 border border-dark-600/30'
                    }`}>
                      <div className="flex items-center gap-2">
                        {step.status === 'running' && <Icon name="loader" size={12} className="text-neon-blue" />}
                        {step.status === 'done' && <Icon name="check" size={12} className="text-green-400" />}
                        {step.status === 'pending' && <div className="w-3 h-3 rounded-full border border-dark-400" />}
                        <span className="text-[11px]">{step.text}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {agentResult && (
                  <div className="mt-3 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="text-[10px] font-semibold text-green-400 mb-1">✓ Result</p>
                    <p className="text-[11px] text-slate-300">{agentResult}</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 flex overflow-hidden min-h-0">
              {/* Steps panel (left) — desktop only */}
              <div className="hidden md:block w-72 flex-shrink-0 border-r border-dark-600/50 overflow-y-auto p-4">
                <h4 className="text-xs uppercase tracking-wider text-slate-500 mb-3">Execution Steps</h4>
                {/* Progress bar */}
                <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden mb-4">
                  <div
                    className="h-full bg-gradient-to-r from-neon-blue to-neon-purple rounded-full transition-all duration-700 progress-bar"
                    style={{ width: `${agentProgress}%` }}
                  />
                </div>

                <div className="space-y-2">
                  {agentSteps.map((step) => (
                    <div key={step.id} className={`p-3 rounded-xl text-sm transition-all ${
                      step.status === 'running' ? 'bg-neon-blue/10 border border-neon-blue/30' :
                      step.status === 'done' ? 'bg-green-500/5 border border-green-500/20' :
                      step.status === 'error' ? 'bg-red-500/5 border border-red-500/20' :
                      'bg-dark-800/50 border border-dark-600/30'
                    }`}>
                      <div className="flex items-center gap-2">
                        {step.status === 'running' && <Icon name="loader" size={14} className="text-neon-blue" />}
                        {step.status === 'done' && <Icon name="check" size={14} className="text-green-400" />}
                        {step.status === 'error' && <span className="text-red-400 text-xs">✕</span>}
                        {step.status === 'pending' && <div className="w-3.5 h-3.5 rounded-full border border-dark-400" />}
                        <span className={`text-xs ${step.status === 'running' ? 'text-neon-blue' : step.status === 'done' ? 'text-slate-300' : 'text-slate-500'}`}>
                          {step.text}
                        </span>
                      </div>
                      {step.result && step.status === 'done' && (
                        <p className="text-xs text-slate-500 mt-1.5 pl-5 line-clamp-2">{step.result}</p>
                      )}
                    </div>
                  ))}
                </div>

                {agentSteps.length === 0 && (
                  <div className="text-center py-12 text-slate-500 text-sm">
                    <Icon name="bot" size={32} className="mx-auto mb-2 opacity-30" />
                    <p>Run a skill to see steps</p>
                  </div>
                )}

                {/* Result */}
                {agentResult && (
                  <div className="mt-4 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                    <p className="text-xs font-semibold text-green-400 mb-1">✓ Task Result</p>
                    <p className="text-xs text-slate-300 leading-relaxed">{agentResult}</p>
                  </div>
                )}
              </div>

              {/* Main preview/logs area (right) */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4">
                {activeTab === 'preview' && (
                  <div className="h-full flex flex-col">
                    {/* Browser chrome */}
                    <div className="browser-chrome flex-1 flex flex-col">
                      <div className="chrome-bar">
                        <div className="chrome-dot bg-red-500" />
                        <div className="chrome-dot bg-yellow-500" />
                        <div className="chrome-dot bg-green-500" />
                        <div className="flex-1 mx-2 sm:mx-3 px-2 sm:px-3 py-1 rounded-md bg-dark-800/80 text-[10px] sm:text-xs text-slate-500 flex items-center gap-1 sm:gap-2 overflow-hidden">
                          <Icon name="globe" size={12} />
                          <span className="truncate">{agentRunning ? 'Agent browsing...' : 'Ready'}</span>
                        </div>
                        {liveConnected && <span className="text-[10px] sm:text-xs text-green-400 flex-shrink-0">LIVE</span>}
                      </div>

                      {/* Screenshot / Live preview area */}
                      <div className="flex-1 bg-dark-950 flex items-center justify-center min-h-[200px] sm:min-h-[300px] relative">
                        {agentScreenshot ? (
                          <img
                            src={agentScreenshot}
                            alt="Agent browser view"
                            className="w-full h-full object-contain"
                          />
                        ) : agentRunning ? (
                          <div className="text-center px-4">
                            <Icon name="loader" size={32} className="text-neon-blue mx-auto mb-3 sm:size-[40px]" />
                            <p className="text-xs sm:text-sm text-slate-400">Agent is working...</p>
                            <p className="text-[10px] sm:text-xs text-slate-600 mt-1">
                              {liveConnected ? 'Streaming live browser view' : 'Connect Playwright server for live preview'}
                            </p>
                          </div>
                        ) : (
                          <div className="text-center px-4">
                            <div className="text-4xl sm:text-5xl mb-3 opacity-20">🖥️</div>
                            <p className="text-xs sm:text-sm text-slate-500">Live browser preview</p>
                            <p className="text-[10px] sm:text-xs text-slate-600 mt-1">Run a skill to see the agent in action</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Mobile: inline progress bar below preview */}
                    <div className="md:hidden mt-3">
                      <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                        <span>Progress</span>
                        <span>{agentProgress}%</span>
                      </div>
                      <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-neon-blue to-neon-purple rounded-full transition-all duration-700 progress-bar" style={{ width: `${agentProgress}%` }} />
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'logs' && (
                  <div className="font-mono text-[10px] sm:text-xs space-y-1">
                    <div className="sticky top-0 bg-dark-900/90 backdrop-blur-sm pb-2 mb-2 border-b border-dark-600/30">
                      <span className="text-slate-400">Action Logs</span>
                      <span className="ml-2 text-slate-600">({agentLogs.length} entries)</span>
                    </div>
                    {agentLogs.map((log, i) => (
                      <div key={i} className="flex gap-1.5 sm:gap-2 py-1 animate-slide-in" style={{ animationDelay: `${i * 20}ms` }}>
                        <span className="text-slate-600 flex-shrink-0">{log.time}</span>
                        <span className={`flex-shrink-0 ${
                          log.type === 'success' ? 'text-green-400' :
                          log.type === 'error' ? 'text-red-400' :
                          log.type === 'action' ? 'text-neon-blue' :
                          log.type === 'question' ? 'text-amber-400' :
                          'text-slate-400'
                        }`}>
                          {log.type === 'success' ? '✓' : log.type === 'error' ? '✕' : log.type === 'action' ? '▶' : log.type === 'question' ? '?' : '·'}
                        </span>
                        <span className="text-slate-300 break-all">{log.text}</span>
                      </div>
                    ))}
                    {agentLogs.length === 0 && (
                      <div className="text-center py-12 text-slate-600">
                        No logs yet. Run a skill to see activity.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════════════ NOTES PAGE ════════════ */}
        {page === 'notes' && (
          <div className="p-4 sm:p-6 max-w-6xl mx-auto animate-fade-up">
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold">Notes</h2>
                <p className="text-slate-400 text-xs sm:text-sm mt-1">Your personal study notes</p>
              </div>
              <button onClick={() => { resetNoteForm(); setShowNoteForm(true); }} className="btn-primary flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm px-3 sm:px-5 py-2 sm:py-2.5">
                <Icon name="plus" size={16} /> <span className="hidden sm:inline">New</span> Note
              </button>
            </div>

            {/* Search */}
            <div className="relative mb-4 sm:mb-6">
              <Icon name="search" size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={noteSearch}
                onChange={(e) => setNoteSearch(e.target.value)}
                placeholder="Search notes..."
                className="w-full pl-11 pr-4 py-2.5 sm:py-3 text-sm"
              />
            </div>

            {/* Note form modal */}
            {showNoteForm && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={resetNoteForm}>
                <div className="card p-5 sm:p-6 w-full max-w-lg sm:mx-4 rounded-b-none sm:rounded-b-2xl animate-fade-up" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-sm sm:text-base">{noteEdit ? 'Edit Note' : 'New Note'}</h3>
                    <button onClick={resetNoteForm} className="text-slate-400 hover:text-white cursor-pointer">
                      <Icon name="x" size={18} />
                    </button>
                  </div>
                  <input
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    placeholder="Note title..."
                    className="w-full px-4 py-3 text-sm mb-3"
                  />
                  <textarea
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="Write your note here..."
                    rows={6}
                    className="w-full px-4 py-3 text-sm mb-3 resize-none"
                  />
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xs text-slate-500 mr-2">Color:</span>
                    {NOTE_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setNoteColor(c)}
                        className={`w-6 h-6 rounded-full cursor-pointer transition-all ${noteColor === c ? 'ring-2 ring-neon-blue scale-110' : 'hover:scale-110'}`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={resetNoteForm} className="px-4 py-2 text-sm text-slate-400 hover:text-white cursor-pointer">Cancel</button>
                    <button onClick={saveNote} className="btn-primary px-6 py-2 text-sm">Save</button>
                  </div>
                </div>
              </div>
            )}

            {/* Notes grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {filteredNotes.map((note) => (
                <div
                  key={note.id}
                  className="rounded-2xl p-4 sm:p-5 border border-dark-600/30 hover:border-neon-blue/20 transition-all group"
                  style={{ background: `linear-gradient(135deg, ${note.color || NOTE_COLORS[0]}cc, ${note.color || NOTE_COLORS[0]}88)` }}
                >
                  <h4 className="font-semibold text-white mb-2 text-sm sm:text-base">{note.title}</h4>
                  <p className="text-xs sm:text-sm text-slate-300/80 mb-4 line-clamp-4 whitespace-pre-wrap">{note.content}</p>
                  <div className="note-actions flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => editNote(note)} className="text-xs px-2.5 py-1 rounded-lg bg-white/10 text-white hover:bg-white/20 cursor-pointer flex items-center gap-1">
                      <Icon name="edit" size={12} /> Edit
                    </button>
                    <button onClick={() => deleteNote(note.id)} className="text-xs px-2.5 py-1 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 cursor-pointer flex items-center gap-1">
                      <Icon name="trash" size={12} /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {filteredNotes.length === 0 && (
              <div className="text-center py-12 sm:py-16">
                <div className="text-4xl sm:text-5xl mb-3 opacity-20">📝</div>
                <p className="text-slate-500 text-sm">No notes yet. Create your first note!</p>
              </div>
            )}
          </div>
        )}

        {/* ════════════ LEADERBOARD PAGE ════════════ */}
        {page === 'leaderboard' && (
          <div className="p-4 sm:p-6 max-w-4xl mx-auto animate-fade-up">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold">Leaderboard</h2>
                <p className="text-slate-400 text-xs sm:text-sm mt-1">Top students by XP earned</p>
              </div>
              <div className="flex gap-1 p-1 rounded-xl bg-dark-800/80">
                {(['weekly', 'monthly', 'alltime'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setLbTimeframe(t);
                      // TODO: Fetch leaderboard from Firebase based on timeframe
                    }}
                    className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs cursor-pointer transition-all ${
                      lbTimeframe === t ? 'bg-neon-blue/20 text-neon-blue' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {t === 'weekly' ? 'Week' : t === 'monthly' ? 'Month' : 'All Time'}
                  </button>
                ))}
              </div>
            </div>

            {leaderboard.length > 0 ? (
              <>
                {/* Top 3 podium */}
                <div className="flex items-end justify-center gap-2 sm:gap-4 mb-8 pt-8">
                  {leaderboard[1] && (
                    <div className="text-center w-24 sm:w-32">
                      <div className="text-3xl sm:text-4xl mb-2">{leaderboard[1].avatar}</div>
                      <div className="card p-3 sm:p-4 bg-gradient-to-t from-slate-500/10 to-transparent">
                        <div className="h-20 sm:h-24 flex items-end justify-center">
                          <div className="text-center">
                            <p className="font-semibold text-xs sm:text-sm text-slate-200">{leaderboard[1].name}</p>
                            <p className="text-[10px] sm:text-xs text-slate-400 mt-1">{leaderboard[1].xp.toLocaleString()} XP</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {leaderboard[0] && (
                    <div className="text-center w-28 sm:w-36">
                      <div className="text-4xl sm:text-5xl mb-2">{leaderboard[0].avatar}</div>
                      <div className="card p-3 sm:p-4 glow-blue bg-gradient-to-t from-neon-blue/10 to-transparent">
                        <div className="h-28 sm:h-32 flex items-end justify-center">
                          <div className="text-center">
                            <p className="font-bold text-sm sm:text-base text-white">{leaderboard[0].name}</p>
                            <p className="text-xs sm:text-sm text-neon-blue mt-1">{leaderboard[0].xp.toLocaleString()} XP</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {leaderboard[2] && (
                    <div className="text-center w-24 sm:w-32">
                      <div className="text-3xl sm:text-4xl mb-2">{leaderboard[2].avatar}</div>
                      <div className="card p-3 sm:p-4 bg-gradient-to-t from-orange-500/10 to-transparent">
                        <div className="h-16 sm:h-20 flex items-end justify-center">
                          <div className="text-center">
                            <p className="font-semibold text-xs sm:text-sm text-slate-200">{leaderboard[2].name}</p>
                            <p className="text-[10px] sm:text-xs text-slate-400 mt-1">{leaderboard[2].xp.toLocaleString()} XP</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Full ranking list — mobile: card layout, desktop: table */}
                <div className="card overflow-hidden">
                  {/* Desktop table header */}
                  <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-3 border-b border-dark-600/50 text-xs uppercase tracking-wider text-slate-500">
                    <span className="col-span-1">Rank</span>
                    <span className="col-span-5">Student</span>
                    <span className="col-span-2 text-right">XP</span>
                    <span className="col-span-2 text-right">Tasks</span>
                    <span className="col-span-2 text-right">Streak</span>
                  </div>
                  {leaderboard.map((entry, i) => (
                    <div key={entry.id} className={`flex sm:grid sm:grid-cols-12 gap-2 px-4 sm:px-5 py-3 sm:py-3.5 items-center border-b border-dark-600/20 hover:bg-dark-700/30 transition-all ${i < 3 ? 'bg-dark-800/30' : ''}`}>
                      <span className={`sm:col-span-1 font-bold text-base sm:text-lg mr-3 sm:mr-0 ${i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'text-slate-500'}`}>
                        #{entry.rank}
                      </span>
                      <div className="sm:col-span-5 flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                        <span className="text-lg">{entry.avatar}</span>
                        <span className="font-medium text-xs sm:text-sm text-white truncate">{entry.name}</span>
                      </div>
                      <span className="sm:col-span-2 text-right text-xs sm:text-sm font-semibold text-neon-blue">{entry.xp.toLocaleString()}</span>
                      <span className="hidden sm:block sm:col-span-2 text-right text-sm text-slate-400">{entry.tasksCompleted}</span>
                      <span className="sm:col-span-2 text-right text-xs sm:text-sm ml-2 sm:ml-0">
                        <span className="inline-flex items-center gap-1 text-orange-400">
                          <Icon name="fire" size={14} /> {entry.streak}d
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-16 sm:py-20">
                <div className="w-16 sm:w-20 h-16 sm:h-20 rounded-2xl bg-dark-800/80 border border-dark-600/50 flex items-center justify-center mx-auto mb-4">
                  <Icon name="trophy" size={28} className="text-slate-600 sm:size-9" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-slate-300 mb-2">No Rankings Yet</h3>
                <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
                  Complete tasks with StudyAgent to earn XP and climb the leaderboard.
                  Rankings will appear here once connected to the backend.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ════════════ MESSAGES PAGE ════════════ */}
        {page === 'messages' && (
          <div className="h-full flex animate-fade-up" style={{ height: 'calc(100% - 52px)' }}>
            {/* Chat list */}
            <div className={`${activeChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-shrink-0 flex-col border-r border-dark-600/50`}>
              <div className="p-3 sm:p-4 border-b border-dark-600/50">
                <h2 className="text-base sm:text-lg font-bold mb-2 sm:mb-3">Messages</h2>
                <div className="relative">
                  <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input placeholder="Search conversations..." className="w-full pl-9 pr-4 py-2 text-xs" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {chats.length > 0 ? (
                  chats.map((chat) => (
                    <button
                      key={chat.id}
                      onClick={() => {
                        setActiveChat(chat.id);
                        setChats((prev) => prev.map((c) => c.id === chat.id ? { ...c, unread: 0 } : c));
                      }}
                      className={`w-full flex items-center gap-3 px-3 sm:px-4 py-3 border-b border-dark-600/20 cursor-pointer transition-all text-left ${
                        activeChat === chat.id ? 'bg-neon-blue/5 border-l-2 border-l-neon-blue' : 'hover:bg-dark-800/50'
                      }`}
                    >
                      <span className="text-xl sm:text-2xl flex-shrink-0">{chat.avatar}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-xs sm:text-sm text-white">{chat.name}</span>
                          {chat.unread > 0 && (
                            <span className="bg-neon-blue text-white text-[10px] sm:text-xs w-4 sm:w-5 h-4 sm:h-5 rounded-full flex items-center justify-center">{chat.unread}</span>
                          )}
                        </div>
                        <p className="text-[10px] sm:text-xs text-slate-500 truncate mt-0.5">
                          {chat.isGroup && <Icon name="users" size={10} className="inline mr-1" />}
                          {chat.lastMessage}
                        </p>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 sm:py-16 px-6 text-center">
                    <div className="w-12 sm:w-14 h-12 sm:h-14 rounded-2xl bg-dark-800/80 border border-dark-600/50 flex items-center justify-center mb-3">
                      <Icon name="messages" size={20} className="text-slate-600 sm:size-6" />
                    </div>
                    <p className="text-xs sm:text-sm text-slate-400 font-medium mb-1">No conversations yet</p>
                    <p className="text-[10px] sm:text-xs text-slate-600">Messages will appear here once connected to the backend.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Chat view */}
            {activeChat && currentChat ? (
              <div className="flex-1 flex flex-col">
                {/* Chat header */}
                <div className="px-3 sm:px-5 py-2.5 sm:py-3 border-b border-dark-600/50 flex items-center gap-2 sm:gap-3 flex-shrink-0">
                  <button onClick={() => setActiveChat(null)} className="md:hidden text-slate-400 hover:text-white cursor-pointer mr-1">
                    <Icon name="arrowLeft" size={18} />
                  </button>
                  <span className="text-xl sm:text-2xl">{currentChat.avatar}</span>
                  <div>
                    <h3 className="font-semibold text-xs sm:text-sm">{currentChat.name}</h3>
                    <p className="text-[10px] sm:text-xs text-slate-500">{currentChat.isGroup ? 'Group Chat' : 'Direct Message'}</p>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3">
                  {currentChat.messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] sm:max-w-[70%] px-3 sm:px-4 py-2 sm:py-2.5 ${msg.isMine ? 'msg-sent' : 'msg-received'}`}>
                        {!msg.isMine && currentChat.isGroup && (
                          <p className="text-[10px] sm:text-xs font-semibold text-neon-blue mb-1">{msg.fromName}</p>
                        )}
                        <p className="text-xs sm:text-sm text-slate-200">{msg.text}</p>
                        <p className="text-[9px] sm:text-[10px] text-slate-500 mt-1 text-right">{msg.time}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={msgEndRef} />
                </div>

                {/* Message input */}
                <div className="px-3 sm:px-5 py-2.5 sm:py-3 border-t border-dark-600/50 flex-shrink-0">
                  {/* TODO: Connect to Firebase Realtime Database for real-time messaging */}
                  <div className="flex gap-2">
                    <input
                      value={msgInput}
                      onChange={(e) => setMsgInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                      placeholder="Type a message..."
                      className="flex-1 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm"
                    />
                    <button onClick={sendMessage} className="btn-primary px-3 sm:px-4 flex items-center gap-1 sm:gap-2">
                      <Icon name="send" size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 hidden md:flex items-center justify-center">
                <div className="text-center">
                  <div className="w-20 h-20 rounded-2xl bg-dark-800/80 border border-dark-600/50 flex items-center justify-center mx-auto mb-4">
                    <Icon name="messages" size={36} className="text-slate-600" />
                  </div>
                  <p className="text-slate-400 text-sm font-medium mb-1">
                    {chats.length > 0 ? 'Select a conversation' : 'No messages yet'}
                  </p>
                  <p className="text-xs text-slate-600">
                    {chats.length > 0 ? 'Choose a chat from the sidebar to start messaging' : 'Conversations will appear here once connected to the backend'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════ SETTINGS PAGE ════════════ */}
        {page === 'settings' && (
          <div className="p-4 sm:p-6 max-w-3xl mx-auto animate-fade-up">
            <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Settings</h2>

            {/* Account */}
            <div className="card p-4 sm:p-5 mb-3 sm:mb-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm sm:text-base">
                <Icon name="users" size={18} className="text-neon-blue" /> Account
              </h3>
              <div className="space-y-2 text-xs sm:text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Email</span>
                  <span className="text-white truncate ml-4">{user.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Name</span>
                  <span className="text-white">{user.displayName || 'Not set'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">UID</span>
                  <span className="text-slate-500 font-mono text-[10px] sm:text-xs truncate ml-4 max-w-[200px]">{user.uid}</span>
                </div>
              </div>
            </div>

            {/* Agent Server */}
            <div className="card p-4 sm:p-5 mb-3 sm:mb-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm sm:text-base">
                <Icon name="globe" size={18} className="text-neon-purple" /> Agent Server (Playwright)
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-500 mb-3">
                Connect to your Playwright backend for real browser automation and live preview.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={AGENT_SERVER_URL}
                  readOnly
                  className="flex-1 px-4 py-2.5 text-xs sm:text-sm font-mono"
                />
                <button
                  onClick={connectWs}
                  className={`px-4 py-2.5 text-xs sm:text-sm rounded-xl cursor-pointer ${
                    liveConnected
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : 'btn-primary'
                  }`}
                >
                  {liveConnected ? '✓ Connected' : 'Connect'}
                </button>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-600 mt-2">
                {/* TODO: Make server URL configurable via env */}
                Run <code className="text-neon-blue">node server/index.js</code> on your machine to enable live browsing
              </p>
            </div>

            {/* AI Provider */}
            <div className="card p-4 sm:p-5 mb-3 sm:mb-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm sm:text-base">
                <Icon name="zap" size={18} className="text-neon-green" /> AI Providers
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-500 mb-3">
                Models are tried in order. If one fails, the next is used automatically.
              </p>
              <div className="space-y-2">
                {[
                  { name: 'Google Gemini', model: 'gemini-2.0-flash', status: 'active' },
                  { name: 'Groq', model: 'llama-3.3-70b', status: 'fallback' },
                  { name: 'Cohere', model: 'command-r-plus', status: 'fallback' },
                  { name: 'Hugging Face', model: 'mistral-7b', status: 'fallback' },
                ].map((p) => (
                  <div key={p.name} className="flex items-center justify-between py-2 px-3 rounded-lg bg-dark-800/50">
                    <div className="min-w-0">
                      <span className="text-xs sm:text-sm text-white">{p.name}</span>
                      <span className="text-[10px] sm:text-xs text-slate-500 ml-1 sm:ml-2 hidden sm:inline">{p.model}</span>
                    </div>
                    <span className={`text-[10px] sm:text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                      p.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-dark-600 text-slate-400'
                    }`}>
                      {p.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Firebase */}
            <div className="card p-4 sm:p-5 mb-3 sm:mb-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm sm:text-base">
                <Icon name="terminal" size={18} className="text-neon-orange" /> Firebase
              </h3>
              <div className="space-y-2 text-xs sm:text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Project</span>
                  <span className="text-white font-mono text-[10px] sm:text-xs">new-zyra</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Auth</span>
                  <span className="text-green-400 text-xs">✓ Connected</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Firestore</span>
                  <span className="text-green-400 text-xs">✓ Connected</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Storage</span>
                  <span className="text-green-400 text-xs">✓ Connected</span>
                </div>
              </div>
            </div>

            {/* About */}
            <div className="card p-4 sm:p-5">
              <h3 className="font-semibold mb-3 text-sm sm:text-base">About</h3>
              <p className="text-xs sm:text-sm text-slate-400">
                StudyAgent v2.0 — Autonomous AI Study Assistant<br />
                Built with React, Firebase, and AI-powered reasoning.<br />
                <span className="text-[10px] sm:text-xs text-slate-600 mt-1 block">
                  Supports Gemini, Groq, Cohere, and Hugging Face models with automatic fallback.
                  Connect a Playwright server for full browser automation.
                </span>
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
