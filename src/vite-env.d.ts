/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_KEY: string;
  readonly VITE_GROQ_KEY: string;
  readonly VITE_COHERE_KEY: string;
  readonly VITE_HF_KEY: string;
  readonly VITE_AGENT_SERVER_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
