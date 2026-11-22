import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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
      // Proxy local Autodarts Board Manager API (HTTP & WS)
      '/api/board': {
        target: 'http://127.0.0.1:3180',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/board/, ''),
        ws: true,
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
