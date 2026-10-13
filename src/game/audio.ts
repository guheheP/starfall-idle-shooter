import type { EventKind, WeaponId } from './types';

/** Synthesized weapon and salvage effects, unlocked only by an enabled user gesture. */
export class GameAudio {
  private context?: AudioContext;
  private noiseBuffer?: AudioBuffer;
  private lastPlayed = new Map<EventKind, number>();
  private voices = new Map<AudioScheduledSourceNode, () => void>();
  private disposed = false;
  enabled = false;

  unlock() {
    if (!this.enabled || this.disposed) return;
    if (this.context?.state === 'closed') this.releaseContext();
    this.context ??= new AudioContext();
    if (!this.noiseBuffer) {
      this.noiseBuffer = this.context.createBuffer(1, Math.floor(this.context.sampleRate * .7), this.context.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    void this.context.resume().catch(() => {});
  }

  /** Releases browser audio resources when the owning game is destroyed. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.enabled = false;
    const context = this.context;
    this.releaseContext();
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }

  private releaseContext(): void {
    for (const [source, release] of this.voices) {
      try { source.stop(); } catch { /* A source may already have finished. */ }
      release();
    }
    this.context = undefined;
    this.noiseBuffer = undefined;
    this.lastPlayed.clear();
  }

  private trackVoice(source: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    const release = () => {
      if (!this.voices.delete(source)) return;
      source.onended = null;
      for (const node of nodes) node.disconnect();
    };
    this.voices.set(source, release);
    source.onended = release;
  }

  play(kind: EventKind, boss = false, weapon: WeaponId = 'pulse') {
    if (this.disposed || !this.enabled || !this.context || this.context.state !== 'running') return;
    const time = this.context.currentTime;
    const interval: Partial<Record<EventKind, number>> = { shot: .12, kill: .045, critical: .08, explosion: .12, chain: .12, hurt: .1, loot: .45 };
    if (time - (this.lastPlayed.get(kind) ?? -1) < (interval[kind] ?? 0)) return;
    this.lastPlayed.set(kind, time);
    if (kind === 'shot') {
      if (weapon === 'pulse') this.tone(920, 300, .065, .017, 'triangle');
      if (weapon === 'spread') { this.tone(310, 95, .07, .015, 'sawtooth'); this.noise(.065, .023, 2800); }
      if (weapon === 'lance') { this.tone(1320, 270, .13, .016, 'sawtooth'); this.tone(660, 135, .12, .012, 'sine'); }
      if (weapon === 'missile') { this.tone(125, 55, .11, .021, 'triangle'); this.noise(.12, .028, 1100); }
      if (weapon === 'arc') { this.tone(1720, 440, .045, .011, 'square'); this.tone(2240, 920, .035, .01, 'triangle', .022); }
      if (weapon === 'orbit') { this.tone(1100, 1650, .09, .013, 'sine'); this.tone(1650, 830, .07, .008, 'triangle', .018); }
    }
    if (kind === 'kill' || kind === 'explosion') {
      const large = boss || kind === 'explosion';
      this.tone(large ? 95 : 190, 30, large ? .32 : .11, .035, 'sawtooth');
      this.noise(large ? .3 : .1, large ? .055 : .027, large ? 1150 : 1800);
    }
    if (kind === 'critical') { this.tone(980, 190, .075, .023, 'triangle'); this.noise(.04, .024, 4000); }
    if (kind === 'chain') { this.tone(2350, 750, .065, .014, 'square'); this.tone(1700, 540, .06, .013, 'triangle', .03); }
    if (kind === 'hurt') this.tone(130, 45, .2, .05, 'square');
    if (kind === 'overdrive') {
      [220, 330, 440, 660].forEach((freq, i) => this.tone(freq, freq * 1.5, .22, .032, 'triangle', i * .06));
      this.noise(.3, .027, 1700);
    }
    if (kind === 'loot') [659, 988, 1318].forEach((freq, i) => this.tone(freq, freq * 1.01, .18, .018, 'sine', i * .055));
    if (kind === 'wave' || kind === 'achievement' || kind === 'collection' || kind === 'mastery') {
      [440, 554, 660].forEach((freq, i) => this.tone(freq, freq, .16, .025, 'sine', i * .07));
    }
    if (kind === 'module' || kind === 'inventory') this.tone(330, 660, .18, .022, 'triangle');
  }

  private tone(from: number, to: number, duration: number, volume: number, type: OscillatorType, delay = 0) {
    if (!this.context || this.voices.size >= 40) return;
    const ctx = this.context, osc = ctx.createOscillator(), gain = ctx.createGain(), now = ctx.currentTime + delay;
    this.trackVoice(osc, [osc, gain]);
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + duration);
    gain.gain.setValueAtTime(.001, now);
    gain.gain.linearRampToValueAtTime(volume, now + .003);
    gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    osc.connect(gain); gain.connect(ctx.destination); osc.start(now); osc.stop(now + duration + .02);
  }

  private noise(duration: number, volume: number, frequency: number) {
    if (!this.context || !this.noiseBuffer || this.voices.size >= 40) return;
    const ctx = this.context, source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain(), now = ctx.currentTime;
    this.trackVoice(source, [source, filter, gain]);
    source.buffer = this.noiseBuffer; filter.type = 'lowpass'; filter.frequency.setValueAtTime(frequency, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + duration);
    gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    source.connect(filter); filter.connect(gain); gain.connect(ctx.destination); source.start(now); source.stop(now + duration + .01);
  }
}
