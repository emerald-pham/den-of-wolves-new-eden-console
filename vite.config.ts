import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { localGmAccessConfiguration, localGmAccessPlugin } from './scripts/local-gm-access.mjs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import packageJson from './package.json';
import { CHANGELOG } from './src/changelog';
import { projectChangelogForDisplay } from './src/lib/changelogDisplayProjection';

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

function changelogDisplaySource(): string {
  return `${JSON.stringify(projectChangelogForDisplay(CHANGELOG))}\n`;
}

const changelogDisplayDevAsset: Plugin = {
  name: 'changelog-display-dev-asset',
  apply: 'serve',
  configureServer(server) {
    const source = changelogDisplaySource();
    server.middlewares.use('/__changelog-display.json', (request, response, next) => {
      if (request.method !== 'GET') {
        next();
        return;
      }
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(source);
    });
  },
};

let changelogDisplayAssetReference: string | undefined;

const changelogDisplayBuildAsset: Plugin = {
  name: 'changelog-display-build-asset',
  apply: 'build',
  buildStart() {
    changelogDisplayAssetReference = this.emitFile({
      type: 'asset',
      name: 'changelog-display.json',
      source: changelogDisplaySource(),
    });
  },
  transform(_source, id) {
    if (id.split('?')[0] !== resolvePath(projectRoot, 'src/changelogDisplayAsset.ts')) return null;
    if (!changelogDisplayAssetReference) throw new Error('The changelog display asset was not emitted.');
    return {
      code: `export const CHANGELOG_DISPLAY_URL = import.meta.ROLLUP_FILE_URL_${changelogDisplayAssetReference};`,
      map: null,
    };
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
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    plugins: [localGmAccessPlugin(localGmAccessConfiguration(command, env)), react(), changelogDisplayDevAsset, changelogDisplayBuildAsset, buildVersionMetadata, serviceWorkerPrecache],
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
        input: {
          index: resolvePath(projectRoot, 'index.html'),
          'pc01-review': resolvePath(projectRoot, 'pc01-review.html'),
          'pc02-review': resolvePath(projectRoot, 'pc02-review.html'),
          'pc03-review': resolvePath(projectRoot, 'pc03-review.html'),
          'pc04-review': resolvePath(projectRoot, 'pc04-review.html'),
          'pc06-review': resolvePath(projectRoot, 'pc06-review.html'),
          'pc07-review': resolvePath(projectRoot, 'pc07-review.html'),
          'pc08-review': resolvePath(projectRoot, 'pc08-review.html'),
          'pc09-review': resolvePath(projectRoot, 'pc09-review.html'),
        },
        output: {
          manualChunks: {
            'pc01-presentations': [
              './src/components/EndeavourEcmDeviceView.tsx',
              './src/components/EndeavourFieldUpgradeChoices.tsx',
              './src/components/EndeavourResearchChoices.tsx',
              './src/components/ScoutResultPanels.tsx',
              './src/components/ShipNavigationMap.tsx',
              './src/components/Starmap.tsx',
            ],
            'session-runtime': ['./src/lib/sessionService.ts', './src/lib/firestore.ts'],
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
