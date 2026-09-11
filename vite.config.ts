import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import packageJson from './package.json';

const buildVersionMetadata: Plugin = {
  name: 'build-version-metadata',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'build-version.json',
      source: `${JSON.stringify({ version: packageJson.version })}\n`,
    });
  },
};

function devServerPort(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) return 5173;
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65_535 ? port : 5173;
}

// Static output for Firebase Hosting. HashRouter is used in the app, so no
// server-side rewrite is required for deep links on any static host.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    plugins: [react(), buildVersionMetadata],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      target: 'es2022',
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom', 'zustand'],
            'firebase-app': ['firebase/app'],
            'firebase-auth': ['firebase/auth'],
            'firebase-functions': ['firebase/functions'],
            'firebase-app-check': ['firebase/app-check'],
            'firebase-firestore': ['firebase/firestore'],
          },
        },
      },
    },
    server: {
      port: devServerPort(env.VITE_DEV_SERVER_PORT),
      strictPort: true,
    },
  };
});
