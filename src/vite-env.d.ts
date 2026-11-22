/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTODARTS_CLIENT_ID?: string;
  readonly VITE_AUTODARTS_REDIRECT_URI?: string;
  readonly VITE_AUTODARTS_API_URL?: string;
  readonly VITE_BOARD_MANAGER_WS?: string;
  readonly VITE_BOARD_MANAGER_HTTP?: string;
  readonly VITE_DEFAULT_DATA_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
