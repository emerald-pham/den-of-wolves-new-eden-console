import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import packageJson from './package.json';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

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

const serviceWorkerPrecache: Plugin = {
  name: 'versioned-service-worker-precache',
  apply: 'build',
  writeBundle(outputOptions, bundle) {
    const staticShellUrls = [
      '/',
      '/index.html',
      '/manifest.webmanifest',
      '/icons/dradis-ball-180.png',
      '/icons/dradis-ball-192.png',
      '/icons/dradis-ball-512.png',
      '/icons/dradis-ball-maskable-512.png',
    ];
    const hashedAssetUrls = Object.keys(bundle)
      .filter((fileName) => fileName.startsWith('assets/') && !fileName.endsWith('.map'))
      .map((fileName) => `/${fileName}`)
      .sort();
    const precacheUrls = [...staticShellUrls, ...hashedAssetUrls];
    const fingerprint = createHash('sha256')
      .update(precacheUrls.join('\n'))
      .digest('hex')
      .slice(0, 12);
    const cacheName = `new-eden-console-shell-${packageJson.version}-${fingerprint}`;
    const outputDirectory = outputOptions.dir ?? dirname(
      outputOptions.file ?? resolvePath(projectRoot, 'dist/index.html'),
    );
    const source = readFileSync(resolvePath(projectRoot, 'public/sw.js'), 'utf8')
      .replace(
        "const CACHE_NAME = 'new-eden-console-shell-dev';",
        `const CACHE_NAME = ${JSON.stringify(cacheName)};`,
      )
      .replace(
        /const PRECACHE_URLS = \[[\s\S]*?\];/,
        `const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 2)};`,
      );
    writeFileSync(join(outputDirectory, 'sw.js'), source);
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
    plugins: [react(), buildVersionMetadata, serviceWorkerPrecache],
    ...(process.env.TICKER_SMOKE_CACHE_DIR
      ? { cacheDir: resolvePath(process.env.TICKER_SMOKE_CACHE_DIR) }
      : {}),
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
            'gm-console': ['./src/routes/GmConsole.tsx'],
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
