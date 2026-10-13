import test from 'node:test';
import assert from 'node:assert/strict';
import { GameAudio } from '../src/game/audio';

class FakeParam {
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
  linearRampToValueAtTime() {}
}
class FakeNode {
  disconnects = 0;
  connect() {}
  disconnect() { this.disconnects++; }
}
class FakeSource extends FakeNode {
  frequency = new FakeParam();
  type = '';
  buffer: unknown;
  onended: (() => void) | null = null;
  stops = 0;
  start() {}
  stop() { this.stops++; }
  finish() { this.onended?.(); }
}
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state = 'suspended';
  sampleRate = 8000;
  currentTime = 0;
  destination = new FakeNode();
  sources: FakeSource[] = [];
  nodes: FakeNode[] = [];
  closes = 0;
  resumes = 0;
  constructor() { FakeAudioContext.instances.push(this); }
  createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
  createOscillator() { return this.source(); }
  createBufferSource() { return this.source(); }
  private source() {
    const source = new FakeSource();
    this.sources.push(source); this.nodes.push(source);
    return source;
  }
  createGain() {
    const gain = Object.assign(new FakeNode(), { gain: new FakeParam() });
    this.nodes.push(gain); return gain;
  }
  createBiquadFilter() {
    const filter = Object.assign(new FakeNode(), { type: '', frequency: new FakeParam() });
    this.nodes.push(filter); return filter;
  }
  resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
  close() { this.closes++; this.state = 'closed'; return Promise.resolve(); }
}

function fixture(t: test.TestContext) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  FakeAudioContext.instances = [];
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: FakeAudioContext });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'AudioContext', previous);
    else Reflect.deleteProperty(globalThis, 'AudioContext');
  });
  const audio = new GameAudio();
  t.after(() => audio.dispose());
  audio.enabled = true; audio.unlock();
  return { audio, context: FakeAudioContext.instances[0] };
}

test('disposing audio stops and disconnects active voices once and leaves late callbacks harmless', t => {
  const { audio, context } = fixture(t);
  audio.play('shot', false, 'spread');
  assert.equal(context.sources.length, 2);
  const lateCallbacks = context.sources.map(source => source.onended!);
  audio.dispose(); audio.dispose();
  assert.equal(context.closes, 1);
  assert.ok(context.sources.every(source => source.stops === 2 && source.onended === null));
  assert.ok(context.nodes.every(node => node.disconnects === 1));
  for (const callback of lateCallbacks) callback();
  assert.ok(context.nodes.every(node => node.disconnects === 1));
  audio.enabled = true; audio.unlock(); audio.play('shot', false, 'spread');
  assert.equal(FakeAudioContext.instances.length, 1);
  assert.equal(context.resumes, 1);
  assert.equal(context.sources.length, 2);
});

test('an externally closed context is recreated with fresh throttle and voice state', async t => {
  const { audio, context } = fixture(t);
  context.currentTime = 100;
  audio.play('shot', false, 'spread');
  const staleCallback = context.sources[0].onended!;
  await context.close();
  audio.unlock();
  const fresh = FakeAudioContext.instances[1];
  assert.ok(fresh);
  audio.play('shot', false, 'spread');
  assert.equal(fresh.sources.length, 2, 'old timestamps must not suppress sounds in the fresh context');
  staleCallback();
  assert.ok(context.nodes.every(node => node.disconnects === 1));
  fresh.sources.forEach(source => source.finish());
  assert.ok(fresh.nodes.every(node => node.disconnects === 1));
});

test('voice limits recover after completed sources without leaking connected nodes', t => {
  const { audio, context } = fixture(t);
  for (let index = 0; index < 30; index++) {
    context.currentTime = index;
    audio.play('kill');
  }
  assert.equal(context.sources.length, 40);
  context.sources.forEach(source => source.finish());
  assert.ok(context.nodes.every(node => node.disconnects === 1));
  context.currentTime = 31; audio.play('kill');
  assert.equal(context.sources.length, 42);
});
