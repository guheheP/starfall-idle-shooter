import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createServiceWorker } from '../build/pwa';

const scope = 'https://example.github.io/starfall-idle-shooter/';
const resources = ['index.html', 'assets/game-hash.js', 'assets/game-hash.css', 'assets/nebula.png'];

function workerHarness(failedResource?: string) {
  const listeners = new Map<string, (event: any) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const fetched: string[] = [];
  let claimed = false;
  const releaseShell = `${scope}index.html`;
  let serverShell = releaseShell;
  const shellDigest = createHash('sha256').update(releaseShell).digest('hex');
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name)!;
      return {
        async addAll(requests: Request[]) {
          for (const request of requests) {
            if (request.url.endsWith(failedResource ?? 'never-fail')) throw new Error('Download failed');
            entries.set(request.url, new Response(request.url));
          }
        },
        async match(key: string) { return entries.get(key)?.clone(); },
        async put(key: string, response: Response) { entries.set(key, response); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name: string) { return stores.delete(name); },
  };
  runInNewContext(createServiceWorker(resources, 'release-1', shellDigest), {
    URL, Request, caches, crypto: webcrypto,
    self: {
      registration: { scope },
      clients: { async claim() { claimed = true; } },
      addEventListener(name: string, listener: (event: any) => void) { listeners.set(name, listener); },
    },
    async fetch(request: { url: string }) {
      fetched.push(request.url);
      if (request.url === releaseShell || request.url === scope || request.url.startsWith(`${scope}?`)) {
        if (request.url.endsWith(failedResource ?? 'never-fail')) throw new Error('Download failed');
        return new Response(serverShell);
      }
      return new Response('online');
    },
  });
  return {
    stores, fetched,
    get claimed() { return claimed; },
    set serverShell(value: string) { serverShell = value; },
    async lifecycle(name: 'install' | 'activate') {
      let pending: Promise<void> | undefined;
      listeners.get(name)!({ waitUntil(promise: Promise<void>) { pending = promise; } });
      await pending;
    },
    async offlineReady(repair = false) {
      let ready: boolean | undefined;
      let pending: Promise<void> | undefined;
      listeners.get('message')!({
        data: { type: 'STARFALL_OFFLINE_STATUS', repair },
        ports: [{ postMessage(result: { ready: boolean }) { ready = result.ready; } }],
        waitUntil(promise: Promise<void>) { pending = promise; },
      });
      await pending;
      return ready;
    },
    fetch(url: string, mode = 'cors', method = 'GET') {
      let response: Promise<Response> | undefined;
      listeners.get('fetch')!({
        request: { url, mode, method },
        respondWith(promise: Promise<Response>) { response = promise; },
      });
      return response;
    },
  };
}

test('offline installation is complete only when every shipped resource is cached', async () => {
  const game = workerHarness();
  await game.lifecycle('install');
  assert.equal(await game.offlineReady(), true);
  [...game.stores.values()][0].delete(new URL('assets/nebula.png', scope).href);
  assert.equal(await game.offlineReady(), false);

  const interrupted = workerHarness('assets/nebula.png');
  await assert.rejects(interrupted.lifecycle('install'), /Download failed/);
  assert.equal(interrupted.stores.size, 0, 'a failed release leaves no partial cache behind');
  assert.equal(await interrupted.offlineReady(), false);

  const existingRelease = workerHarness('assets/nebula.png');
  const oldName = 'starfall-pwa:/starfall-idle-shooter/:previous';
  existingRelease.stores.set(oldName, new Map([['saved-shell', new Response('previous game')]]));
  await assert.rejects(existingRelease.lifecycle('install'));
  assert.equal(existingRelease.stores.get(oldName)?.has('saved-shell'), true,
    'a failed update keeps the previous complete release available');
});

test('activation cleans only older releases for this game scope', async () => {
  const game = workerHarness();
  const ownOld = 'starfall-pwa:/starfall-idle-shooter/:old';
  const otherGame = 'starfall-pwa:/other-game/:old';
  game.stores.set(ownOld, new Map());
  game.stores.set(otherGame, new Map());
  await game.lifecycle('install');
  await game.lifecycle('activate');
  assert.equal(game.stores.has(ownOld), false);
  assert.equal(game.stores.has(otherGame), true);
  assert.equal(game.claimed, true);
  assert.equal(await game.offlineReady(), true);
});

test('offline navigation works at a Pages subpath without caching APIs or other sites', async () => {
  const game = workerHarness();
  await game.lifecycle('install');
  game.fetched.length = 0;
  assert.equal(await (await game.fetch(`${scope}?launch=home`, 'navigate'))?.text(), `${scope}index.html`);
  assert.equal(await (await game.fetch(`${scope}assets/game-hash.js`))?.text(), `${scope}assets/game-hash.js`);
  assert.deepEqual(game.fetched, []);
  assert.equal(game.fetch('https://api.github.com/user'), undefined);
  assert.equal(game.fetch(`${scope}api/save`), undefined);
  assert.equal(game.fetch('https://example.github.io/another-game/', 'navigate'), undefined);
  assert.equal(game.fetch(`${scope}index.html`, 'cors', 'POST'), undefined);
});

test('a successful network read repairs a missing static resource', async () => {
  const game = workerHarness();
  await game.lifecycle('install');
  game.fetched.length = 0;
  const asset = `${scope}assets/nebula.png`;
  [...game.stores.values()][0].delete(asset);
  assert.equal(await game.offlineReady(), false);
  assert.equal(await (await game.fetch(asset))?.text(), 'online');
  assert.equal(await game.offlineReady(), true);
  assert.deepEqual(game.fetched, [asset]);

  [...game.stores.values()][0].delete(asset);
  assert.equal(await game.offlineReady(true), true, 'an online cache check repairs an evicted resource');
});

test('a different release shell cannot enter an old cache during repair or navigation', async () => {
  const game = workerHarness();
  await game.lifecycle('install');
  const entries = [...game.stores.values()][0];
  const shell = `${scope}index.html`;
  entries.delete(shell);
  game.serverShell = 'new release referencing different hashed bundles';
  assert.equal(await game.offlineReady(true), false);
  assert.equal(entries.has(shell), false, 'a failed repair does not store a different release HTML');
  assert.equal(entries.has(`${scope}assets/game-hash.js`), true, 'previous bundle remains available');
  assert.equal(await (await game.fetch(scope, 'navigate'))?.text(), 'new release referencing different hashed bundles');
  assert.equal(entries.has(shell), false, 'online navigation may display new HTML but cannot cache it as the old release');
  assert.equal(await game.offlineReady(), false);

  game.serverShell = shell;
  assert.equal(await game.offlineReady(true), true, 'the matching release can repair the shell');
});

test('presence of every file does not mark mismatched cached HTML as offline-ready', async () => {
  const game = workerHarness();
  await game.lifecycle('install');
  const entries = [...game.stores.values()][0];
  entries.set(`${scope}index.html`, new Response('HTML from another release'));
  assert.equal(await game.offlineReady(), false);
  assert.equal(await game.offlineReady(true), true, 'a matching online shell repairs an incorrect cached shell');
});

test('a mismatched install leaves the previous release cache intact', async () => {
  const game = workerHarness();
  const previous = 'starfall-pwa:/starfall-idle-shooter/:previous';
  game.stores.set(previous, new Map([['previous-shell', new Response('previous game')]]));
  game.serverShell = 'a different deployment';
  await assert.rejects(game.lifecycle('install'), /different release/);
  assert.deepEqual([...game.stores.keys()], [previous]);
  assert.equal(game.stores.get(previous)?.has('previous-shell'), true);
});

test('manifest resolves locally and under GitHub Pages with actual sized PNG icons', async () => {
  const manifest = JSON.parse(await readFile(resolve('public/manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.prefer_related_applications, false);
  for (const base of ['https://localhost:4173/', scope]) {
    assert.equal(new URL(manifest.start_url, base).href, base);
    assert.equal(new URL(manifest.scope, base).href, base);
    assert.equal(new URL(manifest.id, base).href, base);
  }
  assert.ok(manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    const png = await readFile(resolve('public', icon.src));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    const size = Number(icon.sizes.split('x')[0]);
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});
