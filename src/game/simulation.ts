import {
  WORLD_HEIGHT, WORLD_WIDTH,
  type Bullet, type Enemy, type GameEvent, type GameInput, type GameState,
  type GameStats, type MasteryProgress, type ModuleId, type OfflineReward, type Player, type ResearchId,
  type UpgradeId, type WeaponId, type WeaponItem, type WeaponPreview, type WeaponRarity, type LootOutcome,
  type PartItem, type PartSlot, type PartPreview, type PartLootOutcome, type PartAffixId, type SkillId, type EliteId,
} from './types';
import { cloneWeapon, createStarterWeapon, generateWeapon, getAffixText, getSellValue, getWeaponColor,
  INVENTORY_CAPACITY, rarityRank, RARITIES, validateWeaponItem, WEAPON_BASES } from './loot';
import { clonePart, createStarterPart, generatePart, getPartSellValue, PART_BASES, PART_CAPACITY,
  PART_SLOTS, partAffixValue, validatePartItem } from './parts';
import { ENHANCEMENT_MAX, enhancementLevel, enhancementMultiplier, getEnhancementCost as enhancementFee } from './enhancement';
import { SKILL_NODES, getSkillDefinition, getResearchBonuses, skillAvailable, skillCost, skillRank } from './research';
import { ELITES, getSector, getWaveScale, getOpeningDropMultiplier } from './sectors';
import { cloneCollection, collectionMilestones, collectionSummary, createCollection, readCollection, recordCollectionLoot } from './collection';
import { cloneLoadouts, isLoadoutSlot, LOADOUT_SLOTS, loadoutName, loadoutReferences, readLoadouts, summarizeLoadouts,
  type LoadoutSlot, type LoadoutPreset, type LoadoutSummary } from './loadouts';
import { cloneMissions, createMissions, getMissionRewardLevel, readMissions, summarizeMissions, type MissionId, type MissionSummary } from './missions';
import { getOperationDefinition, isOperationId, readOperation, type OperationId } from './operations';
import { createRequisitionReward, getRequisitionProfile, isRequisitionModel, type RequisitionModel } from './requisition';

const UPGRADE_BASE: Record<UpgradeId, number> = { damage: 40, rate: 60, shield: 45, drone: 180 };
const RESEARCH_BASE: Record<ResearchId, number> = { power: 3, salvage: 2, cooldown: 3 };
export const UPGRADE_MAX: Record<UpgradeId, number> = { damage: 10, rate: 10, shield: 10, drone: 0 };
const CALIBRATION_GROWTH = 1.32;
export const RESEARCH_MAX: Record<ResearchId, number> = { power: 50, salvage: 50, cooldown: 11 };
export const MODULES: { id: ModuleId; name: string; unlock: number; description: string; color: number }[] = [
  { id: 'standard', name: '標準型', unlock: 0, description: '安定した標準機体', color: 0x57d9ed },
  { id: 'assault', name: '強襲型', unlock: 3, description: '火力 +25% / シールド −20%', color: 0xffb45d },
  { id: 'bulwark', name: '防衛型', unlock: 6, description: 'シールド +45% / 再生 +35% / 火力 −10%', color: 0xb99cff },
  { id: 'salvager', name: '回収型', unlock: 8, description: '獲得 CR +35% / 火力 −12%', color: 0x76e5ad },
];
const MASTERY_THRESHOLDS = [0, 30, 100, 250, 500];
const WEAPON_IDS = Object.keys(WEAPON_BASES) as WeaponId[];
const WEAPON_PATTERN: Record<WeaponId, { damage: number; rate: number; projectiles: number }> = {
  pulse: { damage: 1, rate: 1, projectiles: 2 }, spread: { damage: 0.7, rate: 0.82, projectiles: 5 },
  lance: { damage: 3, rate: 0.55, projectiles: 1 }, missile: { damage: 0.95, rate: 0.63, projectiles: 3 },
  arc: { damage: 1.7, rate: 0.8, projectiles: 1 }, orbit: { damage: 0.42, rate: 0.68, projectiles: 8 },
};
const MAX_OFFLINE_SECONDS = 8 * 60 * 60;
export const OFFLINE_RATE_MULTIPLIER = 3;
const KNOWN_ACHIEVEMENTS = ['first-boss', 'hundred-kills', 'wave-fifteen'];
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const finite = (value: unknown, fallback: number, max = 1e12, min = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
const integer = (value: unknown, fallback: number, max = 1e12, min = 0): number =>
  Math.floor(finite(value, fallback, max, min));
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

function freshState(now: number): GameState {
  return {
    version: 1, credits: 90, totalCredits: 90, kills: 0, totalKills: 0,
    wave: 1, bestWave: 0, runs: 0, cores: 0,
    upgrades: { damage: 0, rate: 0, shield: 0, drone: 0 },
    research: { power: 0, salvage: 0, cooldown: 0 },
    researchVersion: 1, skills: {},
    collectionVersion: 1, collection: createCollection(),
    weapon: 'pulse', module: 'standard', mastery: { pulse: 0, spread: 0, lance: 0 },
    inventory: [createStarterWeapon('pulse', now)], equippedWeaponId: 'starter-pulse',
    equipmentVersion: 2, parts: PART_SLOTS.map(slot => createStarterPart(slot.id, now)),
    equippedParts: { wing: 'starter-wing', body: 'starter-body', drone: 'starter-drone' },
    loadouts: {},
    missions: createMissions(), operation: 'cruise',
    autoSellRarity: null, lootSerial: 0, lootStats: { found: 0, sold: 0, soldCredits: 0 },
    autopilot: true, sound: false, effects: true,
    savedAt: now, achievements: [],
  };
}

/** Rules and persistent progress. Rendering, audio, and storage are adapters. */
export class Simulation {
  public state: GameState;
  public player: Player = { x: WORLD_WIDTH / 2, y: 690, hp: 100, invulnerable: 1.4 };
  public enemies: Enemy[] = [];
  public bullets: Bullet[] = [];
  public waveKills = 0;
  public waveTarget = 0;
  public status: 'fighting' | 'between' | 'recovering' = 'fighting';
  public recoveryLeft = 0;
  public overdriveLeft = 0;
  public overdriveCooldown = 0;
  public paused = false;
  public offlineReward: OfflineReward | null = null;

  private events: GameEvent[] = [];
  private nextId = 1;
  private fireTimer = 0;
  private droneTimer = 0;
  private waveAge = 0;
  private betweenLeft = 0;
  private totalAge = 0;
  private regenTimer = 0;
  private leechBudget = 0;
  private creditedEnemies = new Set<number>();
  private activeOperation: OperationId = 'cruise';
  private readonly startedAt: number;

  constructor(saved?: unknown, now = Date.now(), private readonly rng: () => number = Math.random) {
    now = finite(now, Date.now(), Number.MAX_SAFE_INTEGER);
    this.startedAt = now;
    this.state = this.readSave(saved, now);
    this.player.hp = this.getStats().maxHp;
    this.leechBudget = this.getStats().leechCapPerSecond;
    this.claimCollectionMilestones();
    const absence = Math.max(0, Math.floor((now - this.state.savedAt) / 1000));
    this.claimOffline(absence);
    // A claim belongs to this loaded state and is persisted with the next save.
    this.state.savedAt = now;
    this.startWave();
  }

  private readSave(saved: unknown, now: number): GameState {
    const base = freshState(now);
    const data = record(saved);
    if (data.version !== 1) return base;
    base.loadouts = readLoadouts(data.loadouts);
    const upgrades = record(data.upgrades);
    const oldLevels: Record<UpgradeId, number> = { damage: integer(upgrades.damage, 0, 100), rate: integer(upgrades.rate, 0, 20),
      shield: integer(upgrades.shield, 0, 100), drone: integer(upgrades.drone, 0, 4) };
    const research = record(data.research);
    for (const id of Object.keys(base.upgrades) as UpgradeId[]) {
      base.upgrades[id] = integer(upgrades[id], 0, UPGRADE_MAX[id]);
    }
    for (const id of Object.keys(base.research) as ResearchId[]) {
      base.research[id] = integer(research[id], 0, RESEARCH_MAX[id]);
    }
    base.credits = finite(data.credits, 90);
    base.totalCredits = Math.max(base.credits, finite(data.totalCredits, base.credits));
    if (data.equipmentVersion !== 2) {
      let refund = 0;
      for (const id of Object.keys(oldLevels) as UpgradeId[]) {
        let invested = 0, retained = 0;
        for (let level = 0; level < oldLevels[id]; level++) invested += Math.ceil(UPGRADE_BASE[id] * Math.pow(id === 'drone' ? 2.1 : 1.52, level));
        for (let level = 0; level < base.upgrades[id]; level++) retained += Math.ceil(UPGRADE_BASE[id] * Math.pow(CALIBRATION_GROWTH, level));
        refund += Math.max(0, invested - retained);
      }
      base.credits = Math.min(1e12, base.credits + refund);
      base.totalCredits = Math.max(base.totalCredits, base.credits);
      // Convert existing support investment and armor into protected starting gear.
      base.parts.find(part => part.slot === 'drone')!.units = Math.max(1, oldLevels.drone);
      base.parts.find(part => part.slot === 'body')!.power = Math.min(12, Math.max(1, (100 + oldLevels.shield * 28) / 162));
      base.parts.find(part => part.slot === 'body')!.level = Math.max(1, integer(data.bestWave, 1, 10000));
      if (refund > 0) this.events.push({ kind: 'inventory', value: refund, message: `旧強化費を返還 +${Math.floor(refund).toLocaleString('ja-JP')} CR` });
    }
    base.kills = integer(data.kills, 0);
    base.totalKills = Math.max(base.kills, integer(data.totalKills, base.kills));
    base.bestWave = integer(data.bestWave, 0, 9999);
    base.missions = readMissions(data.missions, base.bestWave);
    base.operation = readOperation(data.operation, base.bestWave);
    base.wave = integer(data.wave, 1, Math.min(10000, base.bestWave + 1), 1);
    base.runs = integer(data.runs, 0, 1e6);
    if (data.researchVersion === 1) {
      const skills = record(data.skills);
      for (const node of SKILL_NODES) if (Object.hasOwn(skills, node.id)) base.skills[node.id] = skillRank(skills as GameState['skills'], node.id);
    } else {
      const oldPower = base.research.power, oldSalvage = base.research.salvage, oldCooling = base.research.cooldown;
      if (oldPower) base.skills.power = Math.min(3, oldPower);
      if (oldSalvage) base.skills.salvage = Math.min(3, oldSalvage);
      if (oldCooling) { base.skills.cooling = Math.min(3, oldCooling); base.skills.salvage = Math.max(2, base.skills.salvage ?? 0); }
      let rebate = integer(data.cores, 0, 1e9) * 1000;
      for (const id of Object.keys(base.research) as ResearchId[]) {
        for (let level = 3; level < base.research[id]; level++) rebate += Math.ceil(RESEARCH_BASE[id] * Math.pow(1.6, level)) * 1000;
      }
      rebate = Math.min(100_000_000, rebate);
      base.credits = Math.min(1e12, base.credits + rebate);
      base.totalCredits = Math.max(base.totalCredits, base.credits);
      if (rebate > 0 || oldPower || oldSalvage || oldCooling) this.events.push({ kind: 'inventory', value: rebate, message: `旧研究を恒久スキルへ移行${rebate ? ` / +${rebate.toLocaleString('ja-JP')} CR` : ''}` });
    }
    base.research = { power: 0, salvage: 0, cooldown: 0 };
    base.cores = 0;
    base.savedAt = finite(data.savedAt, now, Number.MAX_SAFE_INTEGER);
    base.autopilot = typeof data.autopilot === 'boolean' ? data.autopilot : true;
    base.sound = typeof data.sound === 'boolean' ? data.sound : false;
    base.effects = typeof data.effects === 'boolean' ? data.effects : true;
    const achievements = data.achievements;
    base.achievements = Array.isArray(achievements)
      ? KNOWN_ACHIEVEMENTS.filter(id => achievements.includes(id)) : [];
    const module = MODULES.find(item => item.id === data.module);
    if (module && base.bestWave >= module.unlock) base.module = module.id;
    const mastery = record(data.mastery);
    for (const id of WEAPON_IDS) {
      if (id === 'pulse' || id === 'spread' || id === 'lance' || Object.hasOwn(mastery, id)) base.mastery[id] = integer(mastery[id], 0, 1e9);
    }
    base.lootSerial = integer(data.lootSerial, 0, Number.MAX_SAFE_INTEGER - 1000);
    for (const preset of Object.values(base.loadouts)) for (const id of [preset.weaponId, ...Object.values(preset.parts)]) {
      const serial = /^(?:loot|part)-(\d+)$/.exec(id);
      if (serial) base.lootSerial = Math.max(base.lootSerial, integer(Number(serial[1]), 0, Number.MAX_SAFE_INTEGER - 1000));
    }
    const stats = record(data.lootStats);
    base.lootStats = { found: integer(stats.found, 0), sold: integer(stats.sold, 0), soldCredits: finite(stats.soldCredits, 0) };
    base.autoSellRarity = RARITIES.some(rarity => rarity.id === data.autoSellRarity) ? data.autoSellRarity as WeaponRarity : null;
    if (Array.isArray(data.inventory)) {
      const unique = new Set<string>();
      const inventory: WeaponItem[] = [];
      for (const raw of data.inventory) {
        const item = validateWeaponItem(raw);
        if (!item || unique.has(item.id)) continue;
        unique.add(item.id);
        const serial = /^loot-(\d+)$/.exec(item.id);
        if (serial) base.lootSerial = Math.max(base.lootSerial, integer(Number(serial[1]), 0, Number.MAX_SAFE_INTEGER - 1000));
        inventory.push(item);
      }
      // Protect the equipped item before applying the finite capacity to a corrupt oversized save.
      if (inventory.length > INVENTORY_CAPACITY) inventory.sort((a, b) => Number(b.id === data.equippedWeaponId) - Number(a.id === data.equippedWeaponId)
        || Number(loadoutReferences(base.loadouts, b.id).length > 0) - Number(loadoutReferences(base.loadouts, a.id).length > 0)
        || Number(b.locked || b.starter) - Number(a.locked || a.starter));
      base.inventory = inventory.slice(0, INVENTORY_CAPACITY);
      const equipped = base.inventory.find(item => item.id === data.equippedWeaponId);
      const fallback = equipped ?? base.inventory.find(item => item.starter) ?? base.inventory[0];
      if (fallback) { base.equippedWeaponId = fallback.id; base.weapon = fallback.type; }
      else { base.inventory = [createStarterWeapon('pulse', now)]; }
    } else {
      // Saves from the fixed weapon selector gain protected equivalents without losing progress.
      base.inventory = (['pulse', 'spread', 'lance'] as const).filter(type => base.bestWave >= WEAPON_BASES[type].unlock)
        .map(type => createStarterWeapon(type, now));
      const legacy = base.inventory.find(item => item.type === data.weapon);
      if (legacy) { base.equippedWeaponId = legacy.id; base.weapon = legacy.type; }
    }
    if (data.equipmentVersion === 2 && Array.isArray(data.parts)) {
      const unique = new Set(base.inventory.map(item => item.id));
      const parts: PartItem[] = [];
      for (const raw of data.parts) {
        const item = validatePartItem(raw);
        if (!item || unique.has(item.id)) continue;
        unique.add(item.id); parts.push(item);
        const serial = /^part-(\d+)$/.exec(item.id);
        if (serial) base.lootSerial = Math.max(base.lootSerial, integer(Number(serial[1]), 0, Number.MAX_SAFE_INTEGER - 1000));
      }
      const equipped = record(data.equippedParts);
      if (parts.length > PART_CAPACITY) parts.sort((a, b) => Number(Object.values(equipped).includes(b.id)) - Number(Object.values(equipped).includes(a.id))
        || Number(loadoutReferences(base.loadouts, b.id).length > 0) - Number(loadoutReferences(base.loadouts, a.id).length > 0)
        || Number(b.locked || b.starter) - Number(a.locked || a.starter));
      base.parts = parts.slice(0, PART_CAPACITY);
      for (const slot of PART_SLOTS) {
        let owned = base.parts.find(part => part.slot === slot.id && part.id === equipped[slot.id])
          ?? base.parts.find(part => part.slot === slot.id && part.starter) ?? base.parts.find(part => part.slot === slot.id);
        if (!owned) {
          owned = createStarterPart(slot.id, now);
          if (base.parts.length >= PART_CAPACITY) {
            const replacement = base.parts.find(part => !part.locked && !part.starter && !Object.values(equipped).includes(part.id) && !loadoutReferences(base.loadouts, part.id).length)
              ?? base.parts.find(part => base.parts.filter(other => other.slot === part.slot).length > 1 && !Object.values(equipped).includes(part.id) && !loadoutReferences(base.loadouts, part.id).length);
            if (replacement) base.parts = base.parts.filter(part => part.id !== replacement.id);
          }
          base.parts.push(owned);
        }
        base.equippedParts[slot.id] = owned.id;
      }
    }
    if (data.collectionVersion === 1) base.collection = readCollection(data.collection);
    else for (const item of [...base.inventory, ...base.parts]) recordCollectionLoot(base.collection, item);
    return base;
  }

  public getSector() { return getSector(this.state.wave); }
  public getCollectionSummary() { return collectionSummary(this.state.collection); }
  public getCollectionMilestones() { return collectionMilestones(this.state.collection, this.state.bestWave); }

  public getMissions(): MissionSummary[] { return summarizeMissions(this.state.missions, this.state.bestWave); }

  public acceptMission(id: MissionId): boolean {
    const mission = this.getMissions().find(mission => mission.id === id);
    if (!mission?.unlocked || mission.active) return false;
    this.state.missions.active = mission.id;
    this.events.push({ kind: 'inventory', manual: true, message: `${mission.name} を受注` });
    return true;
  }

  public getMissionClaimIssue(id: MissionId, model: RequisitionModel): string | null {
    const mission = this.getMissions().find(mission => mission.id === id);
    if (!mission) return '任務が見つかりません';
    if (!mission.unlocked) return `最高到達 WAVE ${mission.unlockWave} で解放されます`;
    if (!mission.ready) return '任務の目標が未達成です';
    if (!isRequisitionModel(model)) return '報酬の装備を選択してください';
    const profile = getRequisitionProfile(model)!;
    if (this.state.bestWave < profile.unlockWave) return `この装備は最高到達 WAVE ${profile.unlockWave} で解放されます`;
    const weapon = Object.hasOwn(WEAPON_BASES, model);
    if (weapon ? this.state.inventory.length >= INVENTORY_CAPACITY : this.state.parts.length >= PART_CAPACITY)
      return weapon ? '武器保管庫に空き枠を1つ作ってください' : 'パーツ倉庫に空き枠を1つ作ってください';
    return null;
  }

  public claimMission(id: MissionId, model: RequisitionModel): boolean {
    if (this.getMissionClaimIssue(id, model)) return false;
    const mission = this.getMissions().find(mission => mission.id === id)!;
    const serial = this.state.lootSerial + 1;
    if (!Number.isSafeInteger(serial)) return false;
    const item = createRequisitionReward(model, getMissionRewardLevel(this.state.bestWave, mission.rank), mission.rank, serial, () => this.random());
    item.locked = true; item.starter = false;
    item.acquiredAt = this.startedAt + Math.floor(this.totalAge * 1000);
    if ('slot' in item ? !validatePartItem(item) : !validateWeaponItem(item)) return false;
    // Capacity, readiness and model validity precede every persistent mutation. Locked rewards cannot auto-sell.
    this.state.lootSerial = serial;
    if ('slot' in item) this.receivePart(item); else this.receiveWeapon(item);
    this.state.missions.progress[id] = 0;
    this.state.missions.completions[id] = Math.min(1e9, mission.completions + 1);
    this.events.push({ kind: 'inventory', manual: true, message: `${mission.name} Rank ${mission.rank} 報酬を受領` });
    return true;
  }

  private advanceMission(kind: 'wave' | 'kill', enemy?: Enemy, bullet?: Bullet, chilled = false, highShield = false): void {
    const active = this.state.missions.active;
    if (!active) return;
    const mission = this.getMissions().find(mission => mission.id === active)!;
    if (!mission.unlocked || mission.ready) return;
    const matched = kind === 'wave' ? active === 'waves' : !!enemy && (
      active === 'kills' && enemy.kind !== 'boss' && !enemy.elite ||
      active === 'elites' && !!enemy.elite || active === 'bosses' && enemy.kind === 'boss' ||
      active === 'chilled' && chilled || active === 'high-shield' && highShield ||
      mission.weapon !== undefined && bullet?.source !== 'drone' && bullet?.weapon === mission.weapon);
    if (!matched) return;
    this.state.missions.progress[active] = Math.min(mission.target, mission.progress + 1);
    if (mission.progress + 1 >= mission.target) this.events.push({ kind: 'inventory', message: `${mission.name} 達成！ 報酬を選択できます` });
  }

  public getOperation() { return getOperationDefinition(this.state.operation); }
  public getActiveOperation() { return getOperationDefinition(this.activeOperation); }
  public setOperation(id: OperationId): boolean {
    if (!isOperationId(id) || this.state.operation === id || this.state.bestWave < getOperationDefinition(id).unlockWave) return false;
    this.state.operation = id;
    this.events.push({ kind: 'inventory', manual: true, message: `${this.getOperation().name} を予約 / 次の戦闘開始から適用` });
    return true;
  }

  public getLoadouts(): LoadoutSummary[] { return summarizeLoadouts(this.state, MODULES); }
  public getLoadoutReferences(itemId: string): string[] { return loadoutReferences(this.state.loadouts, itemId); }

  public saveLoadout(slot: LoadoutSlot, name?: string): boolean {
    if (!isLoadoutSlot(slot)) return false;
    const label = LOADOUT_SLOTS.find(value => value.id === slot)!.label;
    const preset: LoadoutPreset = { name: loadoutName(name, this.state.loadouts[slot]?.name ?? label),
      weaponId: this.state.equippedWeaponId, parts: { ...this.state.equippedParts }, module: this.state.module };
    const candidate = { ...this.state, loadouts: { [slot]: preset } };
    if (!summarizeLoadouts(candidate, MODULES).find(value => value.slot === slot)!.available) return false;
    this.state.loadouts[slot] = preset;
    this.events.push({ kind: 'inventory', manual: true, message: `${preset.name} を保存` });
    return true;
  }

  public deleteLoadout(slot: LoadoutSlot): boolean {
    if (!isLoadoutSlot(slot) || !this.state.loadouts[slot]) return false;
    const name = this.state.loadouts[slot]!.name;
    delete this.state.loadouts[slot];
    this.events.push({ kind: 'inventory', manual: true, message: `${name} の保存を解除` });
    return true;
  }

  public equipLoadout(slot: LoadoutSlot): boolean {
    if (!isLoadoutSlot(slot)) return false;
    const summary = this.getLoadouts().find(value => value.slot === slot)!;
    if (!summary.available || summary.equipped || !summary.preset) return false;
    const preset = summary.preset;
    const weapon = this.state.inventory.find(item => item.id === preset.weaponId)!;
    const fraction = clamp(this.player.hp / this.getStats().maxHp, 0, 1);
    // All references and the module were checked first. Carry combat timers and in-flight shots intact.
    this.state.equippedWeaponId = weapon.id;
    this.state.weapon = weapon.type;
    this.state.equippedParts = { ...preset.parts };
    this.state.module = preset.module;
    this.player.hp = fraction * this.getStats().maxHp;
    this.events.push({ kind: 'inventory', manual: true, message: `${preset.name} を装備` });
    return true;
  }

  private claimCollectionMilestones(): void {
    for (const milestone of this.getCollectionMilestones()) {
      if (milestone.claimed || milestone.current < milestone.target) continue;
      this.state.collection.claimed.push(milestone.id);
      this.awardCredits(milestone.reward);
      this.events.push({ kind: 'collection', value: milestone.reward, message: `${milestone.name} 達成！ +${milestone.reward.toLocaleString('ja-JP')} CR` });
    }
  }

  private baseDamage(): number {
    const multiplier = this.state.module === 'assault' ? 1.25 : this.state.module === 'bulwark' ? 0.9
      : this.state.module === 'salvager' ? 0.88 : 1;
    return 7 * (1 + this.state.upgrades.damage * 0.03) * (1 + getResearchBonuses(this.state.skills).power) * multiplier;
  }

  public getEquippedPart(slot: PartSlot): PartItem {
    let item = this.state.parts.find(part => part.slot === slot && part.id === this.state.equippedParts[slot]);
    if (item) return item;
    item = this.state.parts.find(part => part.slot === slot) ?? createStarterPart(slot, this.state.savedAt);
    if (!this.state.parts.some(part => part.id === item!.id)) this.state.parts.push(item);
    this.state.equippedParts[slot] = item.id;
    return item;
  }

  private equipmentBonuses() {
    const wing = this.getEquippedPart('wing'), body = this.getEquippedPart('body'), drone = this.getEquippedPart('drone');
    const research = getResearchBonuses(this.state.skills);
    const wingBoost = enhancementMultiplier(wing), bodyBoost = enhancementMultiplier(body), droneBoost = enhancementMultiplier(drone);
    const affix = (id: PartAffixId) => [wing, body, drone].reduce((value, part) => value + partAffixValue(part, id), 0);
    const maxHp = this.bodyHealth(body) * (1 + this.state.upgrades.shield * 0.02) * (1 + affix('vitality') + research.vitality)
      * (this.state.module === 'assault' ? 0.8 : this.state.module === 'bulwark' ? 1.45 : 1);
    const nativeHighShield = body.model === 'reactor' ? Math.min(2, body.power * 0.35) * bodyBoost : 0;
    const highShieldDamage = nativeHighShield + research.highShieldDamage * (1 + nativeHighShield);
    const nativeChilled = Math.min(1.35, affix('chilled'));
    const highShieldActive = this.player.hp > 0 && this.player.hp >= maxHp * 0.7;
    return { wing, body, drone, maxHp, highShieldDamage, highShieldActive,
      power: 1 + affix('power'), rate: 1 + affix('rapid') + (wing.model === 'velocity' ? Math.min(1.2, wing.power * 0.14) * wingBoost : 0),
      critChance: Math.min(0.65, affix('critical') + research.critChance + (wing.model === 'focus' ? Math.min(0.3, wing.power * 0.08) * wingBoost : 0)),
      critMultiplier: 2 + (wing.model === 'focus' ? Math.min(1.4, wing.power * 0.28) * wingBoost : 0) + research.critMultiplier,
      regen: ((body.model === 'bastion' ? 2 : body.model === 'reactor' ? 1.2 : 0.7) * body.power * bodyBoost + affix('regen') + research.regen * Math.max(1, maxHp / 300)
        + (drone.model === 'mender' ? drone.power * drone.units * 2.2 * droneBoost : 0)) * (this.state.module === 'bulwark' ? 1.35 : 1),
      damageReduction: Math.min(0.65, affix('guard') + (body.model === 'bastion' ? Math.min(0.5, body.power * 0.12) * bodyBoost : 0)),
      moveSpeed: 420 * (1 + (wing.model === 'velocity' ? Math.min(0.5, wing.power * 0.12) * wingBoost : 0)),
      effectRadius: 1 + affix('reach') + (wing.model === 'cascade' ? Math.min(1.2, wing.power * 0.3) * wingBoost : 0),
      cascade: wing.model === 'cascade', chilledBonus: nativeChilled + research.chilledBonus * (1 + nativeChilled),
      leech: Math.min(0.2, affix('leech') + (body.model === 'siphon' ? body.power * 0.025 * bodyBoost : 0)),
      salvage: Math.min(1.2, affix('salvage')), cooldown: Math.min(0.55, affix('cooldown')),
    };
  }

  private bodyHealth(body: PartItem): number { return (body.model === 'bastion' ? 162 : body.model === 'reactor' ? 110 : 125) * body.power * enhancementMultiplier(body); }

  public getPartPreview(item: PartItem): PartPreview {
    const stats: PartPreview['stats'] = [];
    const boost = enhancementMultiplier(item);
    if (item.slot === 'wing') {
      stats.push({ label: '会心率', value: item.model === 'focus' ? Math.min(0.3, item.power * 0.08) * 100 * boost : 0, unit: '%' },
        { label: '会心倍率加算', value: item.model === 'focus' ? Math.min(1.4, item.power * 0.28) * boost : 0, unit: '倍' },
        { label: '連射補正', value: item.model === 'velocity' ? Math.min(1.2, item.power * 0.14) * 100 * boost : 0, unit: '%' },
        { label: '移動補正', value: item.model === 'velocity' ? Math.min(0.5, item.power * 0.12) * 100 * boost : 0, unit: '%' },
        { label: '効果範囲', value: item.model === 'cascade' ? Math.min(1.2, item.power * 0.3) * 100 * boost : 0, unit: '%' });
    } else if (item.slot === 'body') {
      stats.push({ label: '基礎シールド', value: this.bodyHealth(item), unit: 'HP' },
        { label: '軽減', value: item.model === 'bastion' ? Math.min(0.65, Math.min(0.5, item.power * 0.12) * boost) * 100 : 0, unit: '%' },
        { label: '再生', value: (item.model === 'bastion' ? 2 : item.model === 'reactor' ? 1.2 : 0.7) * item.power * boost, unit: 'HP/秒' },
        { label: '高シールド威力', value: item.model === 'reactor' ? Math.min(2, item.power * 0.35) * 100 * boost : 0, unit: '%' },
        { label: '吸収', value: item.model === 'siphon' ? Math.min(0.2, item.power * 0.025 * boost) * 100 : 0, unit: '%' });
    } else {
      stats.push({ label: '支援機', value: item.units, unit: '機' },
        { label: '1機の威力', value: this.baseDamage() * item.power * (item.model === 'striker' ? 0.95 : item.model === 'frost' ? 0.7 : 0.45) * boost, unit: '' },
        { label: '再生', value: item.model === 'mender' ? item.power * item.units * 2.2 * boost : 0, unit: 'HP/秒' },
        { label: '減速', value: item.model === 'frost' ? Math.min(0.65, item.power * 0.35 * boost) * 100 : 0, unit: '%' });
    }
    return { score: item.power * boost * (1 + item.affixes.length * 0.08) * (item.slot === 'drone' ? 1 + (item.units - 1) * 0.2 : 1),
      stats, effects: [PART_BASES[item.model].description] };
  }

  public getSynergies(): import('./types').SynergyStatus[] {
    const gear = this.equipmentBonuses(), weapon = this.getEquippedWeapon();
    const has = (id: WeaponItem['affixes'][number]['id']) => weapon.affixes.some(affix => affix.id === id);
    const slowed = this.enemies.filter(enemy => enemy.hp > 0 && (enemy.slowLeft ?? 0) > 0).length;
    const stats = this.getStats();
    const rawShieldPercent = Math.floor(clamp(this.player.hp / stats.maxHp, 0, 1) * 1000) / 10;
    const shieldPercent = gear.highShieldActive ? Math.max(70, rawShieldPercent) : Math.min(69.9, rawShieldPercent);
    const extraTarget = gear.cascade && (weapon.type === 'arc' || weapon.type === 'lance' || has('chain') || has('pierce'));
    const statuses: import('./types').SynergyStatus[] = [
      { id: 'critical', name: '会心増幅', description: '会心武器 × フォーカス: 発生率と倍率を重ねる', active: gear.wing.model === 'focus' && has('critical'), engaged: false,
        detail: `会心率 ${Math.round(stats.critChance * 100)}% · 会心倍率 ${stats.critMultiplier.toFixed(2)}倍` },
      { id: 'cryo', name: '凍結追撃', description: '凍結弾 × 凍結特効: 減速中の敵へのダメージ増加', active: gear.chilledBonus > 0 && (gear.drone.model === 'frost' || has('frost')), engaged: false,
        detail: `凍結中 ${slowed}体 · 追撃威力 +${Math.round(gear.chilledBonus * 100)}%` },
      { id: 'cascade', name: '連鎖拡張', description: 'カスケード × 爆風・連鎖・貫通: 到達範囲と対象を増やす', active: gear.cascade && (weapon.type === 'missile' || weapon.type === 'arc' || weapon.type === 'lance' || has('explosive') || has('chain') || has('pierce')), engaged: false,
        detail: `効果範囲 ×${gear.effectRadius.toFixed(2)}${extraTarget ? ' · 連鎖・貫通の対象 +1' : ''}` },
      { id: 'sustain', name: '高シールド維持', description: '回復手段 × リアクター・安定出力: シールド70%以上で火力増幅', active: gear.highShieldDamage > 0 && (gear.regen > 0 || gear.leech > 0 || has('leech')), engaged: false,
        detail: `シールド ${shieldPercent}% / 発動70% · 威力 +${Math.round(gear.highShieldDamage * 100)}%` },
    ];
    for (const status of statuses) status.engaged = status.active && this.player.hp > 0 && this.status !== 'recovering'
      && (status.id === 'cryo' ? slowed > 0 : status.id === 'sustain' ? gear.highShieldActive : true);
    return statuses;
  }

  public getEquippedWeapon(): WeaponItem {
    const item = this.state.inventory.find(item => item.id === this.state.equippedWeaponId);
    if (item) return item;
    const fallback = this.state.inventory[0] ?? createStarterWeapon('pulse', this.state.savedAt);
    if (!this.state.inventory.length) this.state.inventory.push(fallback);
    this.state.equippedWeaponId = fallback.id;
    this.state.weapon = fallback.type;
    return fallback;
  }

  private equippedEquipment(id: string): WeaponItem | PartItem | undefined {
    if (id === this.state.equippedWeaponId) return this.state.inventory.find(item => item.id === id);
    if (Object.values(this.state.equippedParts).includes(id)) return this.state.parts.find(item => item.id === id);
    return undefined;
  }

  public getEnhancementCost(id: string): number {
    const item = this.equippedEquipment(id);
    return item ? enhancementFee(item) : Infinity;
  }

  public enhanceEquipment(id: string): boolean {
    const item = this.equippedEquipment(id);
    if (!item || enhancementLevel(item) >= ENHANCEMENT_MAX) return false;
    const cost = enhancementFee(item);
    if (!Number.isFinite(cost) || this.state.credits < cost) return false;
    const healthFraction = clamp(this.player.hp / this.getStats().maxHp, 0, 1);
    this.state.credits -= cost;
    item.enhancement = enhancementLevel(item) + 1;
    this.player.hp = healthFraction * this.getStats().maxHp;
    this.events.push({ kind: 'inventory', manual: true, item: 'slot' in item ? clonePart(item) : cloneWeapon(item),
      value: cost, message: `${item.name} を +${item.enhancement} に強化` });
    return true;
  }

  public getSkillRank(id: SkillId): number { return skillRank(this.state.skills, id); }

  public getSkillCost(id: SkillId): number {
    const node = SKILL_NODES.find(node => node.id === id);
    return node && this.getSkillRank(id) < node.maxRank ? skillCost(this.state.skills, id) : Infinity;
  }

  public canLearnSkill(id: SkillId): boolean {
    return SKILL_NODES.some(node => node.id === id) && skillAvailable(this.state.skills, this.state.bestWave, id)
      && this.state.credits >= this.getSkillCost(id);
  }

  public learnSkill(id: SkillId): boolean {
    if (!this.canLearnSkill(id)) return false;
    const healthFraction = clamp(this.player.hp / this.getStats().maxHp, 0, 1);
    const cost = this.getSkillCost(id);
    this.state.credits -= cost;
    this.state.skills[id] = this.getSkillRank(id) + 1;
    this.player.hp = healthFraction * this.getStats().maxHp;
    this.events.push({ kind: 'inventory', manual: true, value: cost, message: `${getSkillDefinition(id).name} Lv.${this.state.skills[id]} 習得` });
    return true;
  }

  public getOverdriveDuration(): number { return 5 + getResearchBonuses(this.state.skills).overdriveDuration; }

  private weaponDamage(item: WeaponItem): number {
    const gear = this.equipmentBonuses();
    const power = item.affixes.find(affix => affix.id === 'power')?.value ?? 0;
    return this.baseDamage() * item.power * (1 + power) * (1 + this.getMastery(item.type).bonus)
      * gear.power * (gear.highShieldActive ? 1 + gear.highShieldDamage : 1) * enhancementMultiplier(item);
  }

  private weaponRate(item: WeaponItem): number {
    const rapid = item.affixes.find(affix => affix.id === 'rapid')?.value ?? 0;
    return Math.min(24, 3.8 * (1 + this.state.upgrades.rate * 0.02) * (1 + rapid) * this.equipmentBonuses().rate);
  }

  public getWeaponPreview(item: WeaponItem): WeaponPreview {
    const pattern = WEAPON_PATTERN[item.type];
    const damage = this.weaponDamage(item) * pattern.damage;
    const fireRate = this.weaponRate(item) * pattern.rate;
    const gear = this.equipmentBonuses();
    const critChance = Math.min(0.65, gear.critChance + (item.affixes.find(affix => affix.id === 'critical')?.value ?? 0));
    return { damage, fireRate, dps: damage * fireRate * pattern.projectiles * (1 + critChance * (gear.critMultiplier - 1)),
      critChance, critMultiplier: gear.critMultiplier, effects: item.affixes.map(getAffixText) };
  }

  public getStats(): GameStats {
    const gear = this.equipmentBonuses();
    const item = this.getEquippedWeapon();
    const damage = this.weaponDamage(item);
    const fireRate = this.weaponRate(item);
    const maxHp = gear.maxHp;
    const droneCount = gear.drone.units;
    const rawOfflineRate = this.state.bestWave > 0
      ? (3 + this.state.bestWave * 1.2) * 0.5 * (1 + getResearchBonuses(this.state.skills).salvage)
        * (this.state.module === 'salvager' ? 1.35 : 1) * (1 + gear.salvage) * getSector(this.state.bestWave).creditMultiplier * OFFLINE_RATE_MULTIPLIER : 0;
    // Keep decimal rates stable before currency is floored, including exact whole-credit eight-hour claims.
    const offlineRate = Math.round(rawOfflineRate * 1e9) / 1e9;
    const preview = this.getWeaponPreview(item);
    const droneDamage = this.baseDamage() * gear.power * gear.drone.power * enhancementMultiplier(gear.drone)
      * (gear.highShieldActive ? 1 + gear.highShieldDamage : 1)
      * (gear.drone.model === 'striker' ? 0.95 : gear.drone.model === 'frost' ? 0.7 : 0.45);
    const droneCrit = gear.drone.model === 'striker' ? 1 + preview.critChance * (gear.critMultiplier - 1) : 1;
    return { damage, fireRate, maxHp, droneCount, offlineRate,
      dps: preview.dps + droneDamage * droneCount * droneCrit * Math.min(2, gear.rate),
      critChance: preview.critChance, critMultiplier: gear.critMultiplier, regen: gear.regen, damageReduction: gear.damageReduction,
      moveSpeed: gear.moveSpeed, effectRadius: gear.effectRadius, chilledBonus: gear.chilledBonus, highShieldDamage: gear.highShieldDamage,
      leechCapPerSecond: maxHp * 0.03,
      cooldownSeconds: Math.max(12, 45 * (1 - getResearchBonuses(this.state.skills).cooldown) * (1 - gear.cooldown)) };
  }

  public getMastery(id: WeaponId): MasteryProgress {
    const points = integer(this.state.mastery[id], 0, 1e9);
    let rank = 0;
    while (rank < MASTERY_THRESHOLDS.length - 1 && points >= MASTERY_THRESHOLDS[rank + 1]) rank++;
    const maximum = rank === MASTERY_THRESHOLDS.length - 1;
    return { level: rank + 1, points, current: maximum ? 0 : points - MASTERY_THRESHOLDS[rank],
      required: maximum ? 0 : MASTERY_THRESHOLDS[rank + 1] - MASTERY_THRESHOLDS[rank], bonus: rank / 10 };
  }

  public setModule(id: ModuleId): boolean {
    const module = MODULES.find(item => item.id === id);
    if (!module || module.id === this.state.module || this.state.bestWave < module.unlock) return false;
    const healthFraction = clamp(this.player.hp / this.getStats().maxHp, 0, 1);
    this.state.module = module.id;
    this.player.hp = healthFraction * this.getStats().maxHp;
    this.events.push({ kind: 'module', manual: true, x: this.player.x, y: this.player.y, message: `${module.name} 装備` });
    return true;
  }

  public getUpgradeCost(id: UpgradeId): number {
    if (!Object.hasOwn(UPGRADE_BASE, id) || this.state.upgrades[id] >= UPGRADE_MAX[id]) return Infinity;
    return Math.ceil(UPGRADE_BASE[id] * Math.pow(CALIBRATION_GROWTH, this.state.upgrades[id]));
  }

  public buyUpgrade(id: UpgradeId): boolean {
    if (!Object.hasOwn(UPGRADE_BASE, id) || this.state.upgrades[id] >= UPGRADE_MAX[id]) return false;
    const cost = this.getUpgradeCost(id);
    if (this.state.credits < cost) return false;
    const oldMaxHp = this.getStats().maxHp;
    this.state.credits -= cost;
    this.state.upgrades[id]++;
    const stats = this.getStats();
    this.player.hp = Math.min(stats.maxHp, this.player.hp + (id === 'shield' ? stats.maxHp - oldMaxHp : 0));
    return true;
  }

  public setWeapon(id: WeaponId): boolean {
    if (!Object.hasOwn(WEAPON_BASES, id)) return false;
    if (id === this.state.weapon) return false;
    let owned = this.state.inventory.filter(item => item.type === id).sort((a, b) => this.getWeaponPreview(b).dps - this.getWeaponPreview(a).dps)[0];
    if (!owned && (id === 'pulse' || id === 'spread' || id === 'lance') && this.state.bestWave >= WEAPON_BASES[id].unlock) {
      owned = createStarterWeapon(id, this.state.savedAt);
      if (this.state.inventory.length < INVENTORY_CAPACITY) this.state.inventory.push(owned);
      else return false;
    }
    return owned ? this.equipWeapon(owned.id) : false;
  }

  public equipWeapon(id: string): boolean {
    const item = this.state.inventory.find(item => item.id === id);
    if (!item || item.id === this.state.equippedWeaponId) return false;
    this.state.equippedWeaponId = item.id;
    this.state.weapon = item.type;
    this.fireTimer = Math.max(this.fireTimer, 0.15);
    this.events.push({ kind: 'inventory', manual: true, message: `${item.name} 装備`, item: cloneWeapon(item) });
    return true;
  }

  public toggleWeaponLock(id: string): boolean {
    const item = this.state.inventory.find(item => item.id === id);
    if (!item || item.starter) return false;
    item.locked = !item.locked;
    this.events.push({ kind: 'inventory' });
    return true;
  }

  public equipPart(id: string): boolean {
    const item = this.state.parts.find(part => part.id === id);
    if (!item || this.state.equippedParts[item.slot] === id) return false;
    const fraction = clamp(this.player.hp / this.getStats().maxHp, 0, 1);
    this.state.equippedParts[item.slot] = id;
    this.player.hp = fraction * this.getStats().maxHp;
    this.droneTimer = Math.max(this.droneTimer, 0.15);
    this.events.push({ kind: 'inventory', manual: true, item: clonePart(item), message: `${item.name} 装備` });
    return true;
  }

  public togglePartLock(id: string): boolean {
    const item = this.state.parts.find(part => part.id === id);
    if (!item || item.starter) return false;
    item.locked = !item.locked;
    this.events.push({ kind: 'inventory' });
    return true;
  }

  private protectedPart(item: PartItem): boolean { return item.starter || item.locked || this.state.equippedParts[item.slot] === item.id; }
  private automaticallyProtectedPart(item: PartItem): boolean { return this.protectedPart(item) || this.getLoadoutReferences(item.id).length > 0; }

  public sellPart(id: string): number {
    const item = this.state.parts.find(part => part.id === id);
    if (!item || this.protectedPart(item)) return 0;
    this.state.parts = this.state.parts.filter(part => part.id !== id);
    const credits = this.sellItem(item);
    this.events.push({ kind: 'inventory', manual: true, value: credits, message: `${item.name} 売却 +${credits} CR` });
    return credits;
  }

  private protectedWeapon(item: WeaponItem): boolean {
    return item.starter || item.locked || item.id === this.state.equippedWeaponId;
  }
  private automaticallyProtectedWeapon(item: WeaponItem): boolean { return this.protectedWeapon(item) || this.getLoadoutReferences(item.id).length > 0; }

  private sellItem(item: WeaponItem | PartItem): number {
    const credits = 'slot' in item ? getPartSellValue(item) : getSellValue(item);
    this.awardCredits(credits);
    this.state.lootStats.sold = Math.min(1e12, this.state.lootStats.sold + 1);
    this.state.lootStats.soldCredits = Math.min(1e12, this.state.lootStats.soldCredits + credits);
    return credits;
  }

  public sellWeapon(id: string): number {
    const item = this.state.inventory.find(item => item.id === id);
    if (!item || this.protectedWeapon(item)) return 0;
    this.state.inventory = this.state.inventory.filter(owned => owned.id !== id);
    const credits = this.sellItem(item);
    this.events.push({ kind: 'inventory', manual: true, value: credits, message: `${item.name} 売却 +${credits} CR` });
    return credits;
  }

  public setAutoSellRarity(rarity: WeaponRarity | null): boolean {
    if (rarity !== null && !RARITIES.some(value => value.id === rarity)) return false;
    if (this.state.autoSellRarity === rarity) return false;
    this.state.autoSellRarity = rarity;
    this.events.push({ kind: 'inventory' });
    return true;
  }

  public sellEligibleWeapons(): { count: number; credits: number } {
    const threshold = this.state.autoSellRarity;
    if (threshold === null) return { count: 0, credits: 0 };
    const items = this.state.inventory.filter(item => !this.automaticallyProtectedWeapon(item) && rarityRank(item.rarity) <= rarityRank(threshold));
    const ids = new Set(items.map(item => item.id));
    this.state.inventory = this.state.inventory.filter(item => !ids.has(item.id));
    const credits = items.reduce((total, item) => total + this.sellItem(item), 0);
    const parts = this.state.parts.filter(item => !this.automaticallyProtectedPart(item) && rarityRank(item.rarity) <= rarityRank(threshold));
    const partIds = new Set(parts.map(item => item.id));
    this.state.parts = this.state.parts.filter(item => !partIds.has(item.id));
    const partCredits = parts.reduce((total, item) => total + this.sellItem(item), 0);
    const count = items.length + parts.length;
    if (count) this.events.push({ kind: 'inventory', manual: true, value: credits + partCredits, message: `${count}個 売却 +${credits + partCredits} CR` });
    return { count, credits: credits + partCredits };
  }

  /** Incoming loot never changes the player's equipped weapon. Policies affect future drops only. */
  public receiveWeapon(raw: WeaponItem): LootOutcome {
    const validated = validateWeaponItem(raw);
    if (!validated) return { stored: false, sold: false, credits: 0, item: createStarterWeapon('pulse') };
    const item = cloneWeapon(validated);
    while (this.state.inventory.some(owned => owned.id === item.id) || this.state.parts.some(owned => owned.id === item.id)) item.id = `loot-${++this.state.lootSerial}`;
    const serial = /^loot-(\d+)$/.exec(item.id);
    if (serial) this.state.lootSerial = Math.max(this.state.lootSerial, integer(Number(serial[1]), 0, Number.MAX_SAFE_INTEGER - 1000));
    this.state.lootStats.found = Math.min(1e12, this.state.lootStats.found + 1);
    const discovered = recordCollectionLoot(this.state.collection, item);
    const threshold = this.state.autoSellRarity;
    let reason: LootOutcome['reason'];
    if (!this.protectedWeapon(item) && threshold !== null && rarityRank(item.rarity) <= rarityRank(threshold)) reason = 'threshold';
    if (!reason && this.state.inventory.length >= INVENTORY_CAPACITY) {
      const candidates = this.state.inventory.filter(owned => !this.automaticallyProtectedWeapon(owned))
        .sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity) || this.getWeaponPreview(a).dps - this.getWeaponPreview(b).dps);
      const lowest = candidates[0];
      const higher = lowest && (rarityRank(item.rarity) > rarityRank(lowest.rarity)
        || rarityRank(item.rarity) === rarityRank(lowest.rarity) && this.getWeaponPreview(item).dps > this.getWeaponPreview(lowest).dps);
      if (higher) {
        this.state.inventory = this.state.inventory.filter(owned => owned.id !== lowest.id);
        const credits = this.sellItem(lowest);
        this.events.push({ kind: 'inventory', value: credits, message: `容量整理: ${lowest.name} 売却 +${credits} CR` });
      } else reason = 'full';
    }
    const credits = reason ? this.sellItem(item) : 0;
    if (!reason) this.state.inventory.push(item);
    this.events.push({ kind: 'loot', item: cloneWeapon(item), autoSold: Boolean(reason), value: credits,
      message: reason === 'full' ? '保管庫満杯 / 自動売却' : reason === 'threshold' ? '設定により自動売却' : `${item.name} 獲得` });
    if (discovered) this.events.push({ kind: 'collection', item: cloneWeapon(item), autoSold: Boolean(reason), message: `${WEAPON_BASES[item.type].name} / ${RARITIES.find(rarity => rarity.id === item.rarity)!.label} 図鑑に登録` });
    this.claimCollectionMilestones();
    return { stored: !reason, sold: Boolean(reason), credits, item: cloneWeapon(item), ...(reason ? { reason } : {}) };
  }

  public receivePart(raw: PartItem): PartLootOutcome {
    const validated = validatePartItem(raw);
    if (!validated) return { stored: false, sold: false, credits: 0, item: createStarterPart('body') };
    const item = clonePart(validated);
    while (this.state.parts.some(owned => owned.id === item.id) || this.state.inventory.some(owned => owned.id === item.id)) item.id = `part-${++this.state.lootSerial}`;
    const serial = /^part-(\d+)$/.exec(item.id);
    if (serial) this.state.lootSerial = Math.max(this.state.lootSerial, integer(Number(serial[1]), 0, Number.MAX_SAFE_INTEGER - 1000));
    this.state.lootStats.found = Math.min(1e12, this.state.lootStats.found + 1);
    const discovered = recordCollectionLoot(this.state.collection, item);
    let reason: PartLootOutcome['reason'];
    if (!this.protectedPart(item) && this.state.autoSellRarity !== null && rarityRank(item.rarity) <= rarityRank(this.state.autoSellRarity)) reason = 'threshold';
    if (!reason && this.state.parts.length >= PART_CAPACITY) {
      const candidates = this.state.parts.filter(owned => !this.automaticallyProtectedPart(owned)).sort((a, b) =>
        rarityRank(a.rarity) - rarityRank(b.rarity) || Number(b.slot === item.slot) - Number(a.slot === item.slot)
        || this.getPartPreview(a).score - this.getPartPreview(b).score);
      const lowest = candidates[0];
      const higher = lowest && (rarityRank(item.rarity) > rarityRank(lowest.rarity)
        || rarityRank(item.rarity) === rarityRank(lowest.rarity) && this.getPartPreview(item).score > this.getPartPreview(lowest).score);
      if (higher) {
        this.state.parts = this.state.parts.filter(part => part.id !== lowest.id);
        const credits = this.sellItem(lowest);
        this.events.push({ kind: 'inventory', value: credits, message: `容量整理: ${lowest.name} 売却 +${credits} CR` });
      } else reason = 'full';
    }
    const credits = reason ? this.sellItem(item) : 0;
    if (!reason) this.state.parts.push(item);
    this.events.push({ kind: 'loot', item: clonePart(item), value: credits, autoSold: Boolean(reason),
      message: reason === 'full' ? 'パーツ倉庫満杯 / 自動売却' : reason === 'threshold' ? '設定により自動売却' : `${item.name} 獲得` });
    if (discovered) this.events.push({ kind: 'collection', item: clonePart(item), autoSold: Boolean(reason), message: `${PART_BASES[item.model].name} / ${RARITIES.find(rarity => rarity.id === item.rarity)!.label} 図鑑に登録` });
    this.claimCollectionMilestones();
    return { stored: !reason, sold: Boolean(reason), credits, item: clonePart(item), ...(reason ? { reason } : {}) };
  }

  public toggleAutopilot(): void { this.state.autopilot = !this.state.autopilot; }

  /** The storage/visibility adapter consumes its elapsed-time interval exactly once. */
  public claimOffline(absenceSeconds: number): OfflineReward | null {
    if (!Number.isFinite(absenceSeconds) || absenceSeconds < 60 || this.state.bestWave <= 0) return null;
    const seconds = Math.min(Math.floor(absenceSeconds), MAX_OFFLINE_SECONDS);
    const credits = Math.floor(seconds * this.getStats().offlineRate);
    if (credits <= 0) return null;
    this.awardCredits(credits);
    this.offlineReward = { seconds, credits };
    return this.offlineReward;
  }

  public activateOverdrive(): boolean {
    if (this.paused || this.status !== 'fighting' || this.overdriveCooldown > 0) return false;
    this.overdriveLeft = this.getOverdriveDuration();
    this.overdriveCooldown = this.getStats().cooldownSeconds;
    this.bullets = this.bullets.filter(b => b.friendly);
    this.fireTimer = 0;
    this.player.invulnerable = Math.max(this.player.invulnerable, 1);
    this.events.push({ kind: 'overdrive', x: this.player.x, y: this.player.y });
    return true;
  }

  public getResearchCost(id: ResearchId): number {
    return Object.hasOwn(RESEARCH_BASE, id) ? this.getSkillCost(id === 'cooldown' ? 'cooling' : id) : Infinity;
  }

  public buyResearch(id: ResearchId): boolean {
    return Object.hasOwn(RESEARCH_BASE, id) ? this.learnSkill(id === 'cooldown' ? 'cooling' : id) : false;
  }

  public getPrestigeReward(): number {
    const clearedThisRun = this.state.wave - 1;
    return this.state.bestWave >= 15 && clearedThisRun >= 15 ? 500 * Math.floor(clearedThisRun / 5) : 0;
  }

  public prestige(): boolean {
    const reward = this.getPrestigeReward();
    if (reward <= 0) return false;
    const old = this.state;
    this.state = {
      ...freshState(old.savedAt),
      bestWave: old.bestWave, totalCredits: old.totalCredits, totalKills: old.totalKills,
      credits: old.credits, researchVersion: 1, skills: { ...old.skills }, cores: 0, runs: old.runs + 1,
      collectionVersion: 1, collection: cloneCollection(old.collection),
      achievements: [...old.achievements], sound: old.sound, effects: old.effects,
      autopilot: old.autopilot, module: old.module, mastery: { ...old.mastery },
      weapon: old.weapon, inventory: old.inventory.map(cloneWeapon), equippedWeaponId: old.equippedWeaponId,
      autoSellRarity: old.autoSellRarity, lootSerial: old.lootSerial, lootStats: { ...old.lootStats },
      equipmentVersion: 2, parts: old.parts.map(clonePart), equippedParts: { ...old.equippedParts },
      loadouts: cloneLoadouts(old.loadouts),
      missions: cloneMissions(old.missions), operation: old.operation,
    };
    this.awardCredits(reward);
    this.player = { x: WORLD_WIDTH / 2, y: 690, hp: this.getStats().maxHp, invulnerable: 1.4 };
    this.leechBudget = this.getStats().leechCapPerSecond;
    this.overdriveLeft = 0;
    this.overdriveCooldown = 0;
    this.recoveryLeft = 0;
    this.offlineReward = null;
    this.startWave();
    return true;
  }

  public toSave(now = Date.now()): GameState {
    this.state.savedAt = finite(now, Date.now(), Number.MAX_SAFE_INTEGER);
    return { ...this.state, upgrades: { ...this.state.upgrades }, research: { ...this.state.research },
      mastery: { ...this.state.mastery }, achievements: [...this.state.achievements],
      inventory: this.state.inventory.map(cloneWeapon), lootStats: { ...this.state.lootStats },
      parts: this.state.parts.map(clonePart), equippedParts: { ...this.state.equippedParts }, skills: { ...this.state.skills },
      collection: cloneCollection(this.state.collection), loadouts: cloneLoadouts(this.state.loadouts), missions: cloneMissions(this.state.missions) };
  }

  public drainEvents(): GameEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  /** Substeps preserve collisions if a frame is late; hidden-tab time is handled by saves. */
  public update(dtSeconds: number, input: GameInput): void {
    if (this.paused || !Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
    let left = Math.min(dtSeconds, 1);
    while (left > 0) {
      const step = Math.min(left, 1 / 60);
      this.step(step, input);
      left -= step;
    }
  }

  private startWave(): void {
    this.activeOperation = this.state.operation;
    this.status = 'fighting';
    this.waveAge = 0;
    this.waveKills = 0;
    this.bullets = [];
    this.enemies = [];
    this.creditedEnemies.clear();
    this.fireTimer = 0;
    this.droneTimer = 0.3;
    const wave = this.state.wave;
    // Equipment has the largest progression budget; capped calibration no longer carries an exponential stat curve.
    const scale = getWaveScale(wave);
    const boss = wave % 5 === 0;
    if (boss) {
      this.addEnemy('boss', WORLD_WIDTH / 2, 330, 245 * scale, 58, 1.8);
      for (let i = 0; i < 4; i++) this.addEnemy('fighter', 120 + i * 160, 430, 19 * scale, 20, 2.8 + i * 0.35);
    } else {
      const count = Math.min(14, 6 + Math.floor(wave / 2));
      const cols = Math.min(count, 5);
      for (let i = 0; i < count; i++) {
        const row = Math.floor(i / cols);
        const x = 130 + (i % cols) * (460 / Math.max(1, cols - 1));
        const kind = wave >= 4 && i % 5 === 0 ? 'tank' : wave >= 2 && i % 3 === 0 ? 'fighter' : 'scout';
        const hp = (kind === 'tank' ? 33 : kind === 'fighter' ? 19 : 12) * scale;
        this.addEnemy(kind, x, 240 + row * 86, hp, kind === 'tank' ? 26 : 19, 2.8 + (i % 5) * 0.46);
      }
    }
    const eliteCount = (wave >= 20 ? 1 : 0) + this.getActiveOperation().extraElites;
    const candidates = this.enemies.filter(enemy => enemy.kind !== 'boss');
    for (let index = 0; index < eliteCount; index++) {
      const elite = (['vanguard', 'sniper', 'barrage'] as const)[(Math.max(0, Math.floor((wave - 20) / 3)) + index) % 3];
      const target = candidates[index];
      if (target) {
        target.elite = elite; target.charge = 0;
        target.hp *= ELITES[elite].healthMultiplier; target.maxHp = target.hp;
        target.radius *= 1.15;
        target.shotTimer = Math.max(target.shotTimer, ELITES[elite].chargeTime + 0.3);
      }
    }
    this.waveTarget = this.enemies.length;
    this.events.push({ kind: boss ? 'boss' : 'wave', value: wave, boss });
  }

  private addEnemy(kind: Enemy['kind'], x: number, y: number, hp: number, radius: number, shotTimer: number): void {
    const operation = this.getActiveOperation();
    hp *= operation.healthMultiplier;
    shotTimer *= operation.shotInterval;
    this.enemies.push({ id: this.nextId++, kind, x, y, hp, maxHp: hp, radius,
      age: 0, baseX: x, shotTimer, hitFlash: 0,
      ...(kind === 'boss' ? { pattern: (['fan', 'spiral', 'cross'] as const)[Math.floor(this.state.wave / 5 - 1) % 3], phase: 1 } : {}) });
  }

  private step(dt: number, input: GameInput): void {
    this.totalAge += dt;
    const leechCap = this.getStats().leechCapPerSecond;
    this.leechBudget = Math.min(leechCap, this.leechBudget + leechCap * dt);
    this.overdriveCooldown = Math.max(0, this.overdriveCooldown - dt);
    this.overdriveLeft = Math.max(0, this.overdriveLeft - dt);
    this.player.invulnerable = Math.max(0, this.player.invulnerable - dt);
    if (this.status === 'recovering') {
      this.recoveryLeft -= dt;
      if (this.recoveryLeft <= 0) {
        this.recoveryLeft = 0;
        this.player.hp = this.getStats().maxHp;
        this.leechBudget = this.getStats().leechCapPerSecond;
        this.player.x = WORLD_WIDTH / 2;
        this.player.y = 690;
        this.player.invulnerable = 2;
        this.startWave();
      }
      return;
    }
    if (this.status === 'between') {
      this.betweenLeft -= dt;
      this.movePlayer(dt, input);
      if (this.betweenLeft <= 0) this.startWave();
      return;
    }
    this.waveAge += dt;
    this.movePlayer(dt, input);
    this.updateEnemies(dt);
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) this.fireVolley();
    this.droneTimer -= dt;
    if (this.droneTimer <= 0 && this.getStats().droneCount > 0) this.fireDrones();
    this.updateBullets(dt);
    this.regenTimer += dt;
    if (this.regenTimer >= 1) {
      this.regenTimer -= 1;
      if (this.player.hp > 0) {
        const regen = this.getStats().regen;
        this.player.hp = Math.min(this.getStats().maxHp, this.player.hp + regen);
      }
    }
    if (this.player.hp <= 0 || this.waveAge > (this.state.wave % 5 === 0 ? 50 : 40)) {
      this.recover();
    } else if (this.enemies.length === 0) {
      this.completeWave();
    }
  }

  private movePlayer(dt: number, input: GameInput): void {
    const moveSpeed = this.getStats().moveSpeed;
    let vx = finite(input?.x, 0, 1, -1);
    let vy = finite(input?.y, 0, 1, -1);
    const target = input?.target;
    if (target && Number.isFinite(target.x) && Number.isFinite(target.y)) {
      const dx = clamp(target.x, 32, WORLD_WIDTH - 32) - this.player.x;
      const dy = clamp(target.y, 360, WORLD_HEIGHT - 60) - this.player.y;
      const distance = Math.hypot(dx, dy);
      const speed = Math.min(moveSpeed, distance / dt);
      vx = distance > 1 ? dx / distance * speed / moveSpeed : 0;
      vy = distance > 1 ? dy / distance * speed / moveSpeed : 0;
    } else if (Math.abs(vx) + Math.abs(vy) < 0.01 && this.state.autopilot) {
      let aimX = this.player.x;
      const targetEnemy = this.enemies.reduce<Enemy | undefined>((best, enemy) =>
        !best || Math.abs(enemy.x - this.player.x) < Math.abs(best.x - this.player.x) ? enemy : best, undefined);
      if (targetEnemy) aimX = targetEnemy.x;
      let threat: Bullet | undefined;
      let threatTime = Infinity;
      for (const bullet of this.bullets) {
        if (bullet.friendly || bullet.vy <= 0) continue;
        const time = (this.player.y - bullet.y) / bullet.vy;
        if (time < 0 || time > 0.65 || time > threatTime) continue;
        const predictedX = bullet.x + bullet.vx * time;
        if (Math.abs(predictedX - this.player.x) < 42) { threat = bullet; threatTime = time; }
      }
      if (threat) {
        const predictedX = threat.x + threat.vx * threatTime;
        const direction = this.player.x < 110 ? 1 : this.player.x > 610 ? -1 : this.player.x <= predictedX ? -1 : 1;
        aimX = this.player.x + direction * 115;
      }
      vx = clamp((aimX - this.player.x) / 40, -0.8, 0.8);
      vy = clamp((690 - this.player.y) / 60, -0.5, 0.5);
    }
    const length = Math.hypot(vx, vy);
    if (length > 1) { vx /= length; vy /= length; }
    this.player.x = clamp(this.player.x + vx * moveSpeed * dt, 32, WORLD_WIDTH - 32);
    this.player.y = clamp(this.player.y + vy * moveSpeed * dt, 360, WORLD_HEIGHT - 60);
  }

  private updateEnemies(dt: number): void {
    const wave = this.state.wave;
    const sector = getSector(wave);
    for (const enemy of this.enemies) {
      enemy.slowLeft = Math.max(0, (enemy.slowLeft ?? 0) - dt);
      const slow = enemy.slowLeft > 0 ? clamp(enemy.slowFactor ?? 1, 0.35, 1) : 1;
      enemy.age += dt * slow;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      const amplitude = enemy.kind === 'boss' ? 140 : 28;
      enemy.x = clamp(enemy.baseX + Math.sin(enemy.age * (enemy.kind === 'boss' ? 0.6 : 1.1) + enemy.id * 1.7) * amplitude, 45, 675);
      enemy.y += Math.sin(enemy.age * 1.2 + enemy.id) * dt * 9 * slow;
      if (enemy.kind === 'boss' && enemy.phase === 1 && enemy.hp <= enemy.maxHp * 0.5) {
        enemy.phase = 2;
        enemy.shotTimer = Math.max(enemy.shotTimer, 0.9);
        this.events.push({ kind: 'boss', value: wave, boss: true, message: 'ボス 第2形態 / 弾幕強化' });
      }
      const previousShotTimer = enemy.shotTimer;
      enemy.shotTimer -= dt * slow;
      if (enemy.elite) {
        const warning = ELITES[enemy.elite].chargeTime;
        if ((previousShotTimer > warning && enemy.shotTimer <= warning) || enemy.aimAngle === undefined && enemy.shotTimer <= warning)
          enemy.aimAngle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
        enemy.charge = enemy.shotTimer <= warning ? clamp(1 - enemy.shotTimer / warning, 0, 1) : 0;
      }
      if (enemy.shotTimer > 0) continue;
      const dx = this.player.x - enemy.x;
      const dy = this.player.y - enemy.y;
      const angle = Math.atan2(dy, dx);
      let speed = (140 + Math.min(wave * 6, 170)) * sector.enemySpeed * this.getActiveOperation().bulletSpeed;
      const damage = enemy.kind === 'boss' ? 17 + wave * 1.0 : 8 + wave * 0.9;
      let shotAngles = (enemy.kind === 'tank' ? [-0.12, 0.12] : [0]).map(offset => angle + offset);
      if (enemy.kind === 'boss') {
        const enraged = enemy.phase === 2;
        if (enemy.pattern === 'spiral') {
          const center = Math.PI / 2 + Math.sin(enemy.age * 1.65) * 0.55;
          shotAngles = (enraged ? [-0.4, -0.24, -0.08, 0.08, 0.24, 0.4] : [-0.27, -0.09, 0.09, 0.27]).map(offset => center + offset);
        } else if (enemy.pattern === 'cross') {
          shotAngles = (enraged ? [-0.65, -0.3, 0.3, 0.65] : [-0.46, 0.46]).map(offset => Math.PI / 2 + offset);
          shotAngles.push(angle);
        } else {
          shotAngles = (enraged ? [-0.36, -0.24, -0.12, 0, 0.12, 0.24, 0.36] : [-0.3, -0.15, 0, 0.15, 0.3]).map(offset => angle + offset);
        }
      }
      if (enemy.elite === 'vanguard') shotAngles = [-0.18, 0, 0.18].map(offset => (enemy.aimAngle ?? angle) + offset);
      if (enemy.elite === 'sniper') { shotAngles = [enemy.aimAngle ?? angle]; speed *= 1.4; }
      if (enemy.elite === 'barrage') {
        const rotation = enemy.age * 0.28;
        shotAngles = Array.from({ length: 6 }, (_, index) => rotation + index * Math.PI / 3);
        speed *= 0.72;
      }
      for (const shotAngle of shotAngles) this.addBullet(enemy.x, enemy.y + enemy.radius,
        Math.cos(shotAngle) * speed, Math.sin(shotAngle) * speed, damage * (enemy.elite === 'sniper' ? 1.35 : 1),
        enemy.kind === 'boss' ? 7 : enemy.elite === 'sniper' ? 4 : 5, false, 'pulse', 1, 'weapon',
        { color: enemy.elite ? ELITES[enemy.elite].color : enemy.kind === 'boss' ? enemy.phase === 2 ? 0xff57b8 : 0xff785e : enemy.kind === 'tank' ? 0xffae4d : 0xff5974 });
      const interval = enemy.elite ? ELITES[enemy.elite].shotInterval : enemy.kind === 'boss' ? Math.max(0.95, 1.75 - wave * 0.018) / (enemy.phase === 2 ? 1.08 : 1)
        : 3.5 + enemy.id % 3 * 0.55 - Math.min(1.5, wave * 0.06);
      enemy.shotTimer = interval * sector.shotInterval * this.getActiveOperation().shotInterval;
      if (enemy.elite) { enemy.charge = 0; enemy.aimAngle = undefined; }
    }
  }

  private fireVolley(): void {
    const stats = this.getStats();
    const item = this.getEquippedWeapon();
    const gear = this.equipmentBonuses();
    const weapon = item.type;
    const boost = this.overdriveLeft > 0;
    const damage = stats.damage * (boost ? 1.45 : 1);
    const speed = 780;
    const affix = (id: WeaponItem['affixes'][number]['id']) => item.affixes.find(affix => affix.id === id)?.value ?? 0;
    const create = (x: number, y: number, vx: number, vy: number, amount: number, radius: number, pierce = 1): void => {
      const crit = stats.critChance > 0 && this.random() < stats.critChance;
      const pierceTotal = pierce + Math.round(affix('pierce'));
      const chain = Math.max(Math.round(affix('chain')), weapon === 'arc' ? 2 : 0);
      this.addBullet(x, y, vx, vy, amount * (crit ? stats.critMultiplier : 1), radius, true, weapon,
        Math.min(7, pierceTotal + (gear.cascade && pierceTotal > 1 ? 1 : 0)), 'weapon', {
          color: getWeaponColor(item), crit, homing: Math.max(affix('homing'), weapon === 'missile' ? 2.5 : weapon === 'orbit' ? 1.1 : 0),
          explosion: Math.max(affix('explosive'), weapon === 'missile' ? 65 : 0) * gear.effectRadius,
          chain: Math.min(4, chain + (gear.cascade && chain > 0 ? 1 : 0)),
          frost: affix('frost'), leech: Math.min(0.2, affix('leech') + gear.leech),
          salvage: Math.min(1.8, affix('salvage') + gear.salvage), chilledBonus: gear.chilledBonus,
          chainRange: 190 * gear.effectRadius,
          empowered: gear.highShieldActive && gear.highShieldDamage > 0,
        });
    };
    if (weapon === 'pulse') {
      for (const x of [-9, 9]) create(this.player.x + x, this.player.y - 18, 0, -speed, damage, 4);
    } else if (weapon === 'spread') {
      for (const angle of [-0.24, -0.12, 0, 0.12, 0.24]) {
        create(this.player.x, this.player.y - 18, Math.sin(angle) * speed, -Math.cos(angle) * speed, damage * 0.7, 5);
      }
    } else if (weapon === 'lance') {
      create(this.player.x, this.player.y - 22, 0, -1050, damage * 3, 9, 3);
    } else if (weapon === 'missile') {
      for (const angle of [-0.32, 0, 0.32]) create(this.player.x + Math.sin(angle) * 40, this.player.y - 16,
        Math.sin(angle) * 580, -Math.cos(angle) * 580, damage * 0.95, 7);
    } else if (weapon === 'arc') {
      const target = this.enemies.filter(enemy => enemy.hp > 0).sort((a, b) =>
        Math.hypot(a.x - this.player.x, a.y - this.player.y) - Math.hypot(b.x - this.player.x, b.y - this.player.y))[0];
      const angle = target ? Math.atan2(target.y - this.player.y, target.x - this.player.x) : -Math.PI / 2;
      create(this.player.x, this.player.y - 24, Math.cos(angle) * 950, Math.sin(angle) * 950, damage * 1.7, 7);
    } else {
      const rotation = Math.sin(this.totalAge * 1.5) * 0.34;
      for (let index = 0; index < 8; index++) {
        const petal = index * Math.PI / 4 + rotation;
        const angle = -Math.PI / 2 + (index - 3.5) / 3.5 * 0.65 + rotation * 0.2;
        create(this.player.x + Math.cos(petal) * 28, this.player.y - 18 + Math.sin(petal) * 20,
          Math.cos(angle) * 670, Math.sin(angle) * 670, damage * 0.42, 6);
      }
    }
    this.fireTimer += 1 / (stats.fireRate * WEAPON_PATTERN[weapon].rate * (boost ? 2 : 1));
    this.events.push({ kind: 'shot', x: this.player.x, y: this.player.y, value: boost ? 1 : 0, weapon, source: 'weapon', empowered: gear.highShieldActive && gear.highShieldDamage > 0 });
  }

  private fireDrones(): void {
    const stats = this.getStats();
    const gear = this.equipmentBonuses(), drone = gear.drone;
    const targets = [...this.enemies].sort((a, b) => a.hp - b.hp);
    for (let i = 0; i < stats.droneCount; i++) {
      const target = targets[i % targets.length];
      if (!target) break;
      const x = this.player.x + (i % 2 === 0 ? -1 : 1) * (67 + Math.floor(i / 2) * 29);
      const y = this.player.y + 10;
      const angle = Math.atan2(target.y - y, target.x - x);
      const damage = this.baseDamage() * gear.power * drone.power * enhancementMultiplier(drone)
        * (gear.highShieldActive ? 1 + gear.highShieldDamage : 1)
        * (drone.model === 'striker' ? 0.95 : drone.model === 'frost' ? 0.7 : 0.45);
      const crit = drone.model === 'striker' && this.random() < stats.critChance;
      this.addBullet(x, y, Math.cos(angle) * 880, Math.sin(angle) * 880, damage * (crit ? stats.critMultiplier : 1), 5, true, 'pulse', 1, 'drone', {
        color: PART_BASES[drone.model].color, droneModel: drone.model, crit,
        frost: drone.model === 'frost' ? Math.min(0.65, drone.power * 0.35 * enhancementMultiplier(drone)) : 0,
        leech: gear.leech, chilledBonus: gear.chilledBonus, salvage: gear.salvage,
        empowered: gear.highShieldActive && gear.highShieldDamage > 0,
      });
    }
    this.droneTimer = (this.overdriveLeft > 0 ? 0.5 : 1) / Math.min(2, gear.rate);
  }

  private addBullet(x: number, y: number, vx: number, vy: number, damage: number,
    radius: number, friendly: boolean, weapon: WeaponId, pierce = 1, source: Bullet['source'] = 'weapon', traits: Partial<Bullet> = {}): void {
    if (this.bullets.length >= 350) return;
    this.bullets.push({ ...traits, id: this.nextId++, x, y, vx, vy, damage, radius, friendly, weapon, pierce, source, age: 0, hitIds: [] });
  }

  private random(): number { return finite(this.rng(), 0.5, 0.999999999); }

  private damageEnemy(enemy: Enemy, damage: number, bullet: Bullet): void {
    if (enemy.hp <= 0) return;
    const wasChilled = (enemy.slowLeft ?? 0) > 0;
    const highShield = this.player.hp > 0 && this.player.hp >= this.getStats().maxHp * 0.7;
    const chilled = (enemy.slowLeft ?? 0) > 0 && (bullet.chilledBonus ?? 0) > 0;
    if (chilled) damage *= 1 + finite(bullet.chilledBonus, 0, 2);
    const dealt = Math.min(enemy.hp, damage);
    let actualHealing = 0;
    enemy.hp -= damage;
    enemy.hitFlash = 0.09;
    if ((bullet.frost ?? 0) > 0) {
      enemy.slowLeft = 2;
      enemy.slowFactor = 1 - clamp(bullet.frost!, 0, 0.65);
    }
    if ((bullet.leech ?? 0) > 0 && this.player.hp > 0) {
      const stats = this.getStats();
      this.leechBudget = Math.min(this.leechBudget, stats.leechCapPerSecond);
      const healing = Math.min(dealt * clamp(bullet.leech!, 0, 0.2), this.leechBudget, Math.max(0, stats.maxHp - this.player.hp));
      this.player.hp += healing;
      this.leechBudget -= healing;
      actualHealing = healing;
    }
    this.events.push({ kind: bullet.crit ? 'critical' : 'hit', x: enemy.x, y: enemy.y, value: damage, boss: enemy.kind === 'boss',
      weapon: bullet.weapon, source: bullet.source ?? 'weapon', elite: enemy.elite, healing: actualHealing, chilled, empowered: bullet.empowered === true });
    if (enemy.hp <= 0) this.killEnemy(enemy, bullet, wasChilled, highShield);
  }

  /** Secondary damage inherits attribution and statuses but does not recursively trigger effects. */
  private triggerEffects(primary: Enemy, bullet: Bullet): void {
    if ((bullet.explosion ?? 0) > 0) {
      const radius = clamp(bullet.explosion!, 1, WORLD_WIDTH);
      this.events.push({ kind: 'explosion', x: primary.x, y: primary.y, value: radius, weapon: bullet.weapon, source: bullet.source ?? 'weapon', empowered: bullet.empowered });
      for (const enemy of this.enemies) {
        if (enemy.id !== primary.id && enemy.hp > 0 && Math.hypot(enemy.x - primary.x, enemy.y - primary.y) <= radius + enemy.radius)
          this.damageEnemy(enemy, bullet.damage * 0.55, bullet);
      }
    }
    if ((bullet.chain ?? 0) > 0) {
      const points = [{ x: primary.x, y: primary.y }];
      const visited = new Set([primary.id]);
      let last = primary;
      const chainRange = bullet.chainRange ?? 190 * this.getStats().effectRadius;
      for (let index = 0; index < Math.min(4, Math.floor(bullet.chain!)); index++) {
        const target = this.enemies.filter(enemy => enemy.hp > 0 && !visited.has(enemy.id)
          && Math.hypot(enemy.x - last.x, enemy.y - last.y) <= chainRange)
          .sort((a, b) => Math.hypot(a.x - last.x, a.y - last.y) - Math.hypot(b.x - last.x, b.y - last.y))[0];
        if (!target) break;
        visited.add(target.id);
        points.push({ x: target.x, y: target.y });
        this.damageEnemy(target, bullet.damage * Math.pow(0.72, index + 1), bullet);
        last = target;
      }
      if (points.length > 1) this.events.push({ kind: 'chain', points, value: points.length - 1, weapon: bullet.weapon, source: bullet.source ?? 'weapon', empowered: bullet.empowered });
    }
  }

  private updateBullets(dt: number): void {
    const survivors: Bullet[] = [];
    for (const bullet of this.bullets) {
      bullet.age = (bullet.age ?? 0) + dt;
      if (bullet.age > 6) continue;
      if (bullet.friendly && (bullet.homing ?? 0) > 0) {
        const target = this.enemies.filter(enemy => enemy.hp > 0 && !bullet.hitIds.includes(enemy.id))
          .sort((a, b) => Math.hypot(a.x - bullet.x, a.y - bullet.y) - Math.hypot(b.x - bullet.x, b.y - bullet.y))[0];
        if (target) {
          const angle = Math.atan2(bullet.vy, bullet.vx);
          const aim = Math.atan2(target.y - bullet.y, target.x - bullet.x);
          const delta = Math.atan2(Math.sin(aim - angle), Math.cos(aim - angle));
          const heading = angle + clamp(delta, -bullet.homing! * dt, bullet.homing! * dt);
          const speed = Math.hypot(bullet.vx, bullet.vy);
          bullet.vx = Math.cos(heading) * speed;
          bullet.vy = Math.sin(heading) * speed;
        }
      }
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.x < -40 || bullet.x > WORLD_WIDTH + 40 || bullet.y < -50 || bullet.y > WORLD_HEIGHT + 40) continue;
      if (bullet.friendly) {
        for (const enemy of this.enemies) {
          if (enemy.hp <= 0 || bullet.hitIds.includes(enemy.id)) continue;
          if (Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y) > enemy.radius + bullet.radius) continue;
          bullet.hitIds.push(enemy.id);
          bullet.pierce--;
          this.damageEnemy(enemy, bullet.damage, bullet);
          this.triggerEffects(enemy, bullet);
          if (bullet.pierce <= 0) break;
        }
        if (bullet.pierce > 0) survivors.push(bullet);
      } else if (Math.hypot(bullet.x - this.player.x, bullet.y - this.player.y) < 13 + bullet.radius) {
        if (this.player.invulnerable <= 0) {
          const damage = bullet.damage * (1 - this.getStats().damageReduction);
          this.player.hp -= damage;
          this.player.invulnerable = 0.55;
          this.events.push({ kind: 'hurt', x: this.player.x, y: this.player.y, value: damage });
        }
      } else survivors.push(bullet);
    }
    this.bullets = survivors;
    this.enemies = this.enemies.filter(enemy => enemy.hp > 0);
  }

  private awardCredits(amount: number): void {
    this.state.credits = Math.min(1e12, this.state.credits + amount);
    this.state.totalCredits = Math.min(1e12, this.state.totalCredits + amount);
  }

  private creditsFor(amount: number): number {
    return Math.floor(amount * (this.state.module === 'salvager' ? 1.35 : 1) * getSector(this.state.wave).creditMultiplier * this.getActiveOperation().creditMultiplier);
  }

  private killEnemy(enemy: Enemy, bullet: Bullet, chilled = false, highShield = false): void {
    if (this.creditedEnemies.has(enemy.id)) return;
    this.creditedEnemies.add(enemy.id);
    this.advanceMission('kill', enemy, bullet, chilled, highShield);
    const wave = this.state.wave;
    const sector = getSector(wave);
    const reward = this.creditsFor((enemy.kind === 'boss' ? 95 + wave * 12 : 8 + wave * 2 + (enemy.kind === 'tank' ? 8 : 0))
      * (1 + getResearchBonuses(this.state.skills).salvage) * (1 + clamp(bullet.salvage ?? 0, 0, 1.8))
      * (enemy.elite ? ELITES[enemy.elite].creditMultiplier : 1));
    this.awardCredits(reward);
    this.state.kills++;
    this.state.totalKills++;
    this.waveKills++;
    if (bullet.source !== 'drone' && Object.hasOwn(WEAPON_BASES, bullet.weapon)) {
      const oldLevel = this.getMastery(bullet.weapon).level;
      this.state.mastery[bullet.weapon] = Math.min(1e9, (this.state.mastery[bullet.weapon] ?? 0) + (enemy.kind === 'boss' ? 5 : 1));
      const newLevel = this.getMastery(bullet.weapon).level;
      if (newLevel > oldLevel) this.events.push({ kind: 'mastery', value: newLevel, x: this.player.x, y: this.player.y,
        message: `${WEAPON_BASES[bullet.weapon].name} 熟練 Lv.${newLevel} / 火力 +${(newLevel - 1) * 10}%` });
    }
    if (enemy.elite) this.state.collection.elites = Math.min(1e9, this.state.collection.elites + 1);
    if (enemy.kind === 'boss') this.state.collection.bosses = Math.min(1e9, this.state.collection.bosses + 1);
    this.events.push({ kind: 'kill', x: enemy.x, y: enemy.y, value: reward, boss: enemy.kind === 'boss', elite: enemy.elite,
      weapon: bullet.weapon, source: bullet.source ?? 'weapon' });
    if (enemy.elite) {
      if (this.random() < 0.5) {
        const item = generateWeapon(wave, ++this.state.lootSerial, () => this.random(), true);
        item.acquiredAt = this.startedAt + Math.floor(this.totalAge * 1000); this.receiveWeapon(item);
      } else {
        const item = generatePart(wave, ++this.state.lootSerial, () => this.random(), true);
        item.acquiredAt = this.startedAt + Math.floor(this.totalAge * 1000); this.receivePart(item);
      }
    } else if (enemy.kind === 'boss' || this.random() < Math.min(1, sector.weaponDropChance * getOpeningDropMultiplier(wave) + this.getActiveOperation().dropBonus)) {
      const item = generateWeapon(wave, ++this.state.lootSerial, () => this.random(), enemy.kind === 'boss');
      item.acquiredAt = this.startedAt + Math.floor(this.totalAge * 1000);
      this.receiveWeapon(item);
    }
    if (!enemy.elite && (enemy.kind === 'boss' || this.random() < Math.min(1, sector.partDropChance * getOpeningDropMultiplier(wave) + this.getActiveOperation().dropBonus))) {
      const item = generatePart(wave, ++this.state.lootSerial, () => this.random(), enemy.kind === 'boss');
      item.acquiredAt = this.startedAt + Math.floor(this.totalAge * 1000);
      this.receivePart(item);
    }
    this.claimCollectionMilestones();
    if (this.state.totalKills >= 100) this.achievement('hundred-kills', 250, '撃墜数 100 達成！ +250 CR');
  }

  private completeWave(): void {
    const cleared = this.state.wave;
    this.advanceMission('wave');
    // First-clear guarantees survive reloads via bestWave; retries and later sorties cannot farm them.
    if (this.state.runs === 0 && this.state.bestWave < cleared && (cleared === 1 || cleared === 2)) {
      const serial = ++this.state.lootSerial;
      const item = cleared === 1
        ? generateWeapon(cleared, serial, () => this.random(), false, 'uncommon')
        : generatePart(cleared, serial, () => this.random(), false, 'uncommon');
      item.acquiredAt = this.startedAt + Math.floor(this.totalAge * 1000);
      const outcome = 'slot' in item ? this.receivePart(item) : this.receiveWeapon(item);
      if (outcome.stored) this.events.push({ kind: 'inventory', message: `${cleared === 1 ? '武器' : 'パーツ'}を初回回収。装備倉庫で比較・装備できます` });
    }
    this.state.bestWave = Math.max(this.state.bestWave, cleared);
    if (cleared % 5 === 0) this.achievement('first-boss', 150, '初ボス撃破！ +150 CR');
    if (cleared >= 15) this.achievement('wave-fifteen', 500, 'WAVE 15 突破！ 恒久研究と再出撃が解放されました');
    this.awardCredits(this.creditsFor((15 + cleared * 4) * (1 + getResearchBonuses(this.state.skills).salvage)));
    this.state.wave = Math.min(10000, cleared + 1);
    this.claimCollectionMilestones();
    this.status = 'between';
    this.betweenLeft = 1.25;
    this.bullets = [];
    this.player.hp = Math.min(this.getStats().maxHp, this.player.hp + this.getStats().maxHp * 0.16);
    this.events.push({ kind: 'wave', value: cleared, message: 'CLEAR', boss: cleared % 5 === 0 });
  }

  private achievement(id: string, reward: number, message: string): void {
    if (this.state.achievements.includes(id)) return;
    this.state.achievements.push(id);
    const baseReward = reward;
    reward = Math.floor(reward * (this.state.module === 'salvager' ? 1.35 : 1));
    this.awardCredits(reward);
    this.events.push({ kind: 'achievement', value: reward, message: message.replace(`+${baseReward} CR`, `+${reward} CR`) });
  }

  private recover(): void {
    this.status = 'recovering';
    this.recoveryLeft = 3;
    this.overdriveLeft = 0;
    this.bullets = [];
    // A long failed boss attempt still produces salvage for the next upgrade.
    const salvage = this.creditsFor((this.state.wave - 1) * this.waveAge * 0.13 * (1 + getResearchBonuses(this.state.skills).salvage));
    if (salvage > 0) this.awardCredits(salvage);
    this.events.push({ kind: 'recovery', value: salvage, message: '3秒後に同じWAVEへ再出撃' });
  }
}
