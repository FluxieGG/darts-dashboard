import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { remoteRelayPlugin } from './scripts/viteRemoteRelayPlugin';
import { careerVaultPlugin } from './scripts/viteCareerVaultPlugin';
import { replayClipperPlugin } from './scripts/viteReplayClipperPlugin';
import { dartCounterBridgePlugin } from './scripts/viteDartCounterPlugin';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    remoteRelayPlugin(),
    careerVaultPlugin(),
    replayClipperPlugin(),
    dartCounterBridgePlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Proxy local Autodarts Board Manager API (HTTP & WS) same-origin so Edge/Chrome never prompt for local network access
      '/api/board': {
        target: 'http://127.0.0.1:3180',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/board/, ''),
        ws: true,
        configure: (proxy) => {
          proxy.on('error', () => {
            // Silently ignore transient ECONNREFUSED while Autodarts Desktop starts up
          });
        },
      },
      // Proxy Autodarts Cloud API
      '/api/autodarts': {
        target: 'https://api.autodarts.io',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/autodarts/, ''),
        secure: true,
      },
    },
  },
  preview: {
    port: 4173,
    host: true,
    proxy: {
      '/api/board': {
        target: 'http://127.0.0.1:3180',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/board/, ''),
        ws: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          charts: ['recharts'],
          icons: ['lucide-react'],
          auth: ['oidc-client-ts'],
        },
      },
    },
  },
});
