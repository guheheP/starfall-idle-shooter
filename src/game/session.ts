import { Simulation } from './simulation';

/** Preserves the start of a hidden interval through autosave, pagehide and reload. */
export class SaveSession {
  private hiddenAt: number | null = null;
  constructor(private sim: Simulation, private write: (json: string) => void, private now = Date.now, initiallyHidden = false) {
    if (initiallyHidden) this.hiddenAt = this.now();
  }

  save(): void {
    this.write(JSON.stringify(this.sim.toSave(this.hiddenAt ?? this.now())));
  }

  hide(): void {
    this.hiddenAt ??= this.now();
    this.save();
  }

  resume(): void {
    if (this.hiddenAt === null) return;
    this.sim.claimOffline((this.now() - this.hiddenAt) / 1000);
    this.hiddenAt = null;
    this.save();
  }
}
