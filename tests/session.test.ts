import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/game/simulation';
import { SaveSession } from '../src/game/session';

const START = 1_800_000_000_000;
const progress = () => ({ ...new Simulation(undefined, START).toSave(START), bestWave: 10, wave: 11 });

test('closing a hidden tab retains the full offline interval on reopening', () => {
  let now = START;
  let stored = '';
  const sim = new Simulation(progress(), now);
  const session = new SaveSession(sim, json => { stored = json; }, () => now);
  session.hide();
  now += 10 * 60 * 1000;
  session.save(); // beforeunload and pagehide must not erase ten minutes of absence.
  assert.equal(JSON.parse(stored).savedAt, START);
  const reloaded = new Simulation(JSON.parse(stored), now + 60 * 1000);
  assert.equal(reloaded.offlineReward?.seconds, 11 * 60);
  assert.equal(reloaded.state.credits, sim.state.credits + Math.floor(11 * 60 * sim.getStats().offlineRate));
});

test('returning from a hidden tab credits once and persists before a reload', () => {
  let now = START;
  let stored = '';
  const sim = new Simulation(progress(), now);
  const session = new SaveSession(sim, json => { stored = json; }, () => now);
  session.hide();
  now += 2 * 60 * 1000;
  session.hide(); // A repeated hidden notification must retain the first timestamp.
  now += 60 * 1000;
  session.resume();
  const credits = sim.state.credits;
  assert.equal(sim.offlineReward?.seconds, 3 * 60);
  session.resume();
  assert.equal(sim.state.credits, credits);
  const reloaded = new Simulation(JSON.parse(stored), now);
  assert.equal(reloaded.state.credits, credits);
  assert.equal(reloaded.offlineReward, null);
});

test('initially hidden loading retains the initial timestamp and credits the absence only once', () => {
  let now = START;
  let stored = '';
  const sim = new Simulation(progress(), now);
  const session = new SaveSession(sim, json => { stored = json; }, () => now, true);
  session.save(); // The initial save happens before visibility listeners are registered.
  assert.equal(JSON.parse(stored).savedAt, START);
  now += 10 * 60 * 1000;
  session.save(); // pagehide/beforeunload without an initial visibilitychange.
  assert.equal(JSON.parse(stored).savedAt, START);
  const before = sim.state.credits;
  session.resume();
  const credits = before + Math.floor(10 * 60 * sim.getStats().offlineRate);
  assert.equal(sim.offlineReward?.seconds, 10 * 60);
  assert.equal(sim.state.credits, credits);
  assert.equal(JSON.parse(stored).savedAt, now);
  session.resume();
  assert.equal(sim.state.credits, credits);
  const reloaded = new Simulation(JSON.parse(stored), now);
  assert.equal(reloaded.state.credits, credits);
  assert.equal(reloaded.offlineReward, null);
});

test('initially visible loading saves the current time and resume does not create an absence', () => {
  let now = START;
  let stored = '';
  const sim = new Simulation(progress(), now);
  const session = new SaveSession(sim, json => { stored = json; }, () => now, false);
  const credits = sim.state.credits;
  now += 10 * 60 * 1000;
  session.save();
  assert.equal(JSON.parse(stored).savedAt, now);
  session.resume();
  assert.equal(sim.state.credits, credits);
  assert.equal(sim.offlineReward, null);
});
