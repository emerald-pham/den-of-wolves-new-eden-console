import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { registerServiceWorker } from './pwa';

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

it('serves a network-first app shell with cached static assets for offline launch', () => {
  const serviceWorker = readPublicFile('sw.js');

  expect(serviceWorker).toContain("self.addEventListener('install'");
  expect(serviceWorker).toContain("self.addEventListener('activate'");
  expect(serviceWorker).toContain("self.addEventListener('fetch'");
  expect(serviceWorker).toContain("event.request.mode === 'navigate'");
  expect(serviceWorker).toContain("caches.match('/index.html')");
  expect(serviceWorker).toContain("cache.match(request)");
});
