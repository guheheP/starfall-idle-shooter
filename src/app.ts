import Phaser from 'phaser';
import { Simulation } from './game/simulation';
import { SpaceScene } from './game/scene';
import { GameAudio } from './game/audio';
import { SaveSession } from './game/session';
import { ProgressStore, PROGRESS_ACTIVE_KEY, INITIAL_RESET_GENERATION,
  type ProgressSnapshot, type ProgressStorage } from './game/progress-store';
import { WORLD_WIDTH, WORLD_HEIGHT } from './game/types';
import { notificationForEvent } from './game/notifications';
import { setupUI } from './ui';

interface Runtime {
  generation: string;
  toast(message: string, tone?: string): void;
  dispose(saveFirst: boolean): Promise<void>;
}

/** Every timer, scene and save belongs to one captured progress generation. */
export function startGameApplication(storage: ProgressStorage) {
  const store = new ProgressStore(storage);
  let runtime: Runtime | null = null;
  let disposed = false;
  let transition = Promise.resolve();
  const safeRead = (): ProgressSnapshot => {
    try { return store.read(); }
    catch { return { saved: undefined, generation: INITIAL_RESET_GENERATION }; }
  };

  function replace(snapshot: ProgressSnapshot, message?: string, force = false): Promise<void> {
    transition = transition.catch(() => {}).then(async () => {
      if (disposed) return;
      let latest = snapshot;
      try { latest = store.read(); } catch { /* Retain the supplied committed snapshot. */ }
      if (!force && runtime?.generation === latest.generation) return;
      const previous = runtime;
      runtime = null;
      if (previous) await previous.dispose(false);
      if (disposed) return;
      // Another reset may commit while Phaser finishes its destruction.
      try { latest = store.read(); } catch { /* Retain the supplied committed snapshot. */ }
      runtime = mount(latest);
      if (message) runtime.toast(message);
      document.querySelector<HTMLElement>('#game-canvas')?.focus({ preventScroll: true });
    });
    return transition;
  }

  function refresh(message = '別の画面で進捗がリセットされました'): void {
    try { void replace(store.read(), message).catch(() => { if (!disposed) window.location.reload(); }); }
    catch { runtime?.toast('保存データを読み込めませんでした。', 'warning'); }
  }

  function mount(snapshot: ProgressSnapshot): Runtime {
    let live = true;
    let warnedStorage = false;
    const sim = new Simulation(snapshot.saved);
    const ui = setupUI(sim, {
      onResetProgress: async () => {
        if (!live || disposed) return false;
        let reset: ProgressSnapshot;
        try { reset = store.reset({ sound: sim.state.sound, effects: sim.state.effects }); }
        catch { return false; }
        try { await replace(reset, '進捗をリセットしました。新しい出撃を開始します'); }
        catch {
          // The reset is already committed. Reload it rather than reporting a failed save.
          if (!disposed) window.location.reload();
        }
        return true;
      },
    });
    const audio = new GameAudio();
    audio.enabled = sim.state.sound;
    const reportStorageError = () => {
      if (!live || warnedStorage) return;
      warnedStorage = true;
      ui.toast('保存できませんでした。ブラウザの保存設定を確認してください。', 'warning');
    };
    const session = new SaveSession(sim, json => {
      if (!live || disposed) return;
      if (!store.write(json, snapshot.generation)) refresh();
    }, Date.now, document.hidden);
    const save = () => {
      if (!live || disposed) return;
      try { session.save(); } catch { reportStorageError(); }
    };
    save();
    const game = new Phaser.Game({
      type: Phaser.AUTO, parent: 'game-canvas', width: WORLD_WIDTH, height: WORLD_HEIGHT,
      backgroundColor: '#070f1d', antialias: true, transparent: false,
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.NO_CENTER },
      fps: { target: 60, forceSetTimeOut: false },
      scene: [new SpaceScene(sim, audio, event => {
        if (!live || disposed) return;
        const notification = notificationForEvent(event);
        if (notification) ui.toast(notification.message, notification.tone);
        if (['wave', 'achievement', 'mastery', 'module', 'loot', 'inventory', 'collection'].includes(event.kind)) save();
      })],
    });
    const canvasHost = document.querySelector<HTMLElement>('#game-canvas')!;
    const canvasResize = new ResizeObserver(entries => {
      if (!live || disposed) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) game.scale.resize(Math.round(width), Math.round(height));
    });
    canvasResize.observe(canvasHost);
    const renderTimer = window.setInterval(() => { if (live && !disposed) ui.render(); }, 120);
    const saveTimer = window.setInterval(() => { if (!document.hidden) save(); }, 5000);
    const onVisibility = () => {
      if (!live || disposed) return;
      try {
        if (!store.isCurrent(snapshot.generation)) { refresh(); return; }
        if (document.hidden) session.hide(); else session.resume();
      } catch { reportStorageError(); }
      if (live) ui.render();
    };
    const onGesture = () => {
      if (!live || disposed) return;
      audio.enabled = sim.state.sound; audio.unlock();
    };
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('pointerdown', onGesture);
    window.addEventListener('pagehide', save);
    window.addEventListener('beforeunload', save);
    onVisibility();
    let destruction: Promise<void> | null = null;
    return {
      generation: snapshot.generation, toast: ui.toast,
      dispose(saveFirst) {
        if (destruction) return destruction;
        if (saveFirst) save();
        live = false;
        clearInterval(renderTimer); clearInterval(saveTimer);
        canvasResize.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        document.removeEventListener('pointerdown', onGesture);
        window.removeEventListener('pagehide', save);
        window.removeEventListener('beforeunload', save);
        ui.destroy();
        sim.paused = true;
        audio.dispose();
        destruction = new Promise<void>(resolve => {
          game.events.once(Phaser.Core.Events.DESTROY, resolve);
          // Destruction happens on the next frame; do not stop the Phaser loop.
          game.destroy(true, false);
        });
        return destruction;
      },
    };
  }

  const onStorage = (event: StorageEvent) => {
    if (!disposed && event.key === PROGRESS_ACTIVE_KEY) refresh();
  };
  runtime = mount(safeRead());
  window.addEventListener('storage', onStorage);
  return {
    reload(): Promise<void> { return replace(store.read(), undefined, true); },
    async dispose(): Promise<void> {
      if (disposed) return;
      window.removeEventListener('storage', onStorage);
      const previous = runtime;
      runtime = null;
      const destruction = previous?.dispose(true);
      disposed = true;
      await Promise.all([destruction, transition.catch(() => {})]);
    },
  };
}
