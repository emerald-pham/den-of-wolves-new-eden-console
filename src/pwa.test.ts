import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import {
  applyServiceWorkerUpdate,
  getServiceWorkerUpdateState,
  registerServiceWorker,
} from './pwa';

const root = process.cwd();
const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');

afterEach(() => {
  if (originalServiceWorker) {
    Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker);
  } else {
    Reflect.deleteProperty(navigator, 'serviceWorker');
  }
});

function readPublicFile(path: string): string {
  return readFileSync(resolve(root, 'public', path), 'utf8');
}

function readPngDimensions(path: string): { readonly width: number; readonly height: number } {
  const png = readFileSync(resolve(root, 'public', path));
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

it('publishes installable Android metadata with any-purpose and maskable DRADIS icons', () => {
  const manifest = JSON.parse(readPublicFile('manifest.webmanifest')) as {
    readonly name: string;
    readonly short_name: string;
    readonly id: string;
    readonly start_url: string;
    readonly scope: string;
    readonly display: string;
    readonly orientation: string;
    readonly theme_color: string;
    readonly background_color: string;
    readonly icons: readonly {
      readonly src: string;
      readonly sizes: string;
      readonly type: string;
      readonly purpose?: string;
    }[];
  };

  expect(manifest.name).toBe('Den of Wolves: New Eden — Unofficial Companion Console');
  expect(manifest.short_name).toBe('New Eden Console');
  expect(manifest.id).toBe('./');
  expect(manifest.start_url).toBe('./');
  expect(manifest.scope).toBe('./');
  expect(manifest.display).toBe('standalone');
  expect(manifest.orientation).toBe('any');
  expect(manifest.theme_color).toBe('#04070a');
  expect(manifest.background_color).toBe('#04070a');
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({
      src: '/icons/dradis-ball-192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    }),
    expect.objectContaining({
      src: '/icons/dradis-ball-maskable-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    }),
    expect.objectContaining({
      src: '/icons/dradis-ball-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    }),
  ]));

  for (const icon of manifest.icons) {
    expect(readPngDimensions(icon.src.replace(/^\//, ''))).toEqual({
      width: Number(icon.sizes.split('x')[0]),
      height: Number(icon.sizes.split('x')[1]),
    });
  }
});

it('publishes iOS home-screen metadata and a safe-area viewport', () => {
  const index = readFileSync(resolve(root, 'index.html'), 'utf8');

  expect(index).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
  expect(index).toContain('<link rel="apple-touch-icon" sizes="180x180" href="/icons/dradis-ball-180.png" />');
  expect(index).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
  expect(index).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />');
  expect(index).toContain('<meta name="apple-mobile-web-app-title" content="New Eden Console" />');
  expect(index).toContain('<meta name="mobile-web-app-capable" content="yes" />');
  expect(index).toContain('<meta name="theme-color" content="#04070a" />');
  expect(index).toContain('viewport-fit=cover');
  expect(readPngDimensions('icons/dradis-ball-180.png')).toEqual({ width: 180, height: 180 });
});

it('registers the root service worker when the browser exposes the API', async () => {
  const register = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register },
  });

  registerServiceWorker();
  await Promise.resolve();

  expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
});

it('never turns an update notice race or registration failure into an automatic reload', async () => {
  vi.resetModules();
  const reload = vi.fn();
  vi.stubGlobal('window', { location: { reload } });
  const { applyServiceWorkerUpdate, markServiceWorkerUpdateAvailable, registerServiceWorker } =
    await import('./pwa');
  const register = vi.fn().mockRejectedValue(new Error('registration unavailable'));
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register },
  });

  // The build marker can arrive before register() settles, and a failed
  // registration must leave the player in the current shell safely.
  markServiceWorkerUpdateAvailable();
  applyServiceWorkerUpdate();
  registerServiceWorker();
  await Promise.resolve();
  await Promise.resolve();

  expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  expect(reload).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it('keeps a waiting worker non-blocking until the player explicitly applies it', async () => {
  const eventListeners = new Map<string, EventListener>();
  const worker = {
    postMessage: vi.fn(),
  } as unknown as ServiceWorker;
  const registration = {
    waiting: worker,
    installing: null,
    update: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn(),
  } as unknown as ServiceWorkerRegistration;
  const serviceWorker = {
    controller: {} as ServiceWorker,
    register: vi.fn().mockResolvedValue(registration),
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      eventListeners.set(type, listener);
    }),
  } as unknown as ServiceWorkerContainer;
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: serviceWorker,
  });

  registerServiceWorker();
  await Promise.resolve();
  await Promise.resolve();

  expect(getServiceWorkerUpdateState()).toMatchObject({ available: true, activated: false });
  expect(worker.postMessage).not.toHaveBeenCalled();
  applyServiceWorkerUpdate();
  expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  expect(eventListeners.get('controllerchange')).toBeDefined();
  eventListeners.get('controllerchange')?.(new Event('controllerchange'));
  expect(getServiceWorkerUpdateState()).toMatchObject({ available: true, activated: true });
});

it('serves a network-first app shell with cached static assets for offline launch', () => {
  const serviceWorker = readPublicFile('sw.js');

  expect(serviceWorker).toContain("self.addEventListener('install'");
  expect(serviceWorker).toContain("self.addEventListener('activate'");
  expect(serviceWorker).toContain("self.addEventListener('fetch'");
  expect(serviceWorker).toContain("event.request.mode === 'navigate'");
  expect(serviceWorker).toContain("matchCached('/index.html')");
  expect(serviceWorker).toContain("cache.match(request)");
});

it('keeps updates waiting, revalidates the manifest, and supports explicit activation', () => {
  const serviceWorker = readPublicFile('sw.js');

  expect(serviceWorker).toContain('const CACHE_PREFIX =');
  expect(serviceWorker).toContain('const PRECACHE_URLS =');
  expect(serviceWorker).toContain("event.data?.type === 'SKIP_WAITING'");
  const installLifecycle = serviceWorker.slice(
    serviceWorker.indexOf("self.addEventListener('install'"),
    serviceWorker.indexOf("self.addEventListener('activate'"),
  );
  expect(installLifecycle).not.toContain('self.skipWaiting()');
  expect(serviceWorker).toContain("if (url.pathname === '/manifest.webmanifest')");
  expect(serviceWorker).toContain('const cached = await matchCached(request);');
});

it('generates a versioned precache worker during production builds', () => {
  const viteConfig = readFileSync(resolve(root, 'vite.config.ts'), 'utf8');

  expect(viteConfig).toContain("name: 'versioned-service-worker-precache'");
  expect(viteConfig).toContain("const cacheName = `new-eden-console-shell-");
  expect(viteConfig).toContain("filter((fileName) => fileName.startsWith('assets/') && !fileName.endsWith('.map'))");
  expect(viteConfig).toContain("writeFileSync(join(outputDirectory, 'sw.js'), source)");
});
