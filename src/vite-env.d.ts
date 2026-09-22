/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_TOKEN?: string;
  readonly VITE_API_SECRET_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
