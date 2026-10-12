import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    plugins: [react(), tailwindcss()],
    server: {
      host: '127.0.0.1',
      port: 5190,
      strictPort: true,
      proxy: { '/api': env.VITE_API_PROXY || 'http://127.0.0.1:8011' },
    },
  };
});
