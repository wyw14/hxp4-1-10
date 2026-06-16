import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  server: {
    port: 41010,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:42010',
        changeOrigin: true
      }
    }
  }
});
