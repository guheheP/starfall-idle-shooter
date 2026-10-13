export const WORLD_WIDTH = 720;
export const WORLD_HEIGHT = 820;
export type WeaponId = 'pulse' | 'spread' | 'lance' | 'missile' | 'arc' | 'orbit';
export type WeaponRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type AffixId = 'power' | 'rapid' | 'critical' | 'pierce' | 'homing' | 'explosive' | 'chain' | 'frost' | 'leech' | 'salvage';
export interface WeaponAffix { id: AffixId; value: number; }
export interface WeaponItem {
  id: string; name: string; type: WeaponId; rarity: WeaponRarity;
  level: number; power: number; affixes: WeaponAffix[];
  locked: boolean; starter: boolean; acquiredAt: number;
  enhancement?: number;
}
export interface WeaponPreview {
  damage: number; fireRate: number; dps: number;
  critChance: number; critMultiplier: number; effects: string[];
}
export interface LootOutcome { stored: boolean; sold: boolean; credits: number; item: WeaponItem; reason?: 'threshold' | 'full'; }
export type PartSlot = 'wing' | 'body' | 'drone';
export type PartModel = 'focus' | 'velocity' | 'cascade' | 'bastion' | 'reactor' | 'siphon' | 'striker' | 'frost' | 'mender';
export type PartAffixId = 'power' | 'rapid' | 'critical' | 'vitality' | 'regen' | 'guard' | 'reach' | 'chilled' | 'cooldown' | 'leech' | 'salvage';
export interface PartAffix { id: PartAffixId; value: number; }
export interface PartItem {
  id: string; name: string; slot: PartSlot; model: PartModel; rarity: WeaponRarity;
  level: number; power: number; units: number; affixes: PartAffix[];
  locked: boolean; starter: boolean; acquiredAt: number;
  enhancement?: number;
}
export interface PartPreview {
  score: number; stats: { label: string; value: number; unit: string }[]; effects: string[];
}
export interface PartLootOutcome { stored: boolean; sold: boolean; credits: number; item: PartItem; reason?: 'threshold' | 'full'; }
export type UpgradeId = 'damage' | 'rate' | 'shield' | 'drone';
export type ResearchId = 'power' | 'salvage' | 'cooldown';
export type SkillId = 'power' | 'accuracy' | 'cryo' | 'armor' | 'repair' | 'stability' | 'salvage' | 'cooling' | 'overdrive';
export type ModuleId = 'standard' | 'assault' | 'bulwark' | 'salvager';
export type EliteId = 'vanguard' | 'sniper' | 'barrage';
export type SectorId = 'frontier' | 'ion' | 'wreckage' | 'aurora' | 'void';
export interface CollectionState {
  weapons: Partial<Record<WeaponId, number>>;
  parts: Partial<Record<PartModel, number>>;
  rarities: Partial<Record<WeaponRarity, number>>;
  elites: number;
  bosses: number;
  claimed: string[];
}
export interface MasteryProgress { level: number; points: number; current: number; required: number; bonus: number; }
export interface GameState {
  version: 1;
  credits: number;
  totalCredits: number;
  kills: number;
  totalKills: number;
  wave: number;
  bestWave: number;
  runs: number;
  cores: number;
  upgrades: Record<UpgradeId, number>;
  research: Record<ResearchId, number>;
  researchVersion: 1;
  skills: Partial<Record<SkillId, number>>;
  collectionVersion: 1;
  collection: CollectionState;
  weapon: WeaponId;
  module: ModuleId;
  mastery: Partial<Record<WeaponId, number>>;
  inventory: WeaponItem[];
  equippedWeaponId: string;
  equipmentVersion: 2;
  parts: PartItem[];
  equippedParts: Record<PartSlot, string>;
  loadouts: import('./loadouts').LoadoutPresets;
  missions: import('./missions').MissionState;
  operation: import('./operations').OperationId;
  autoSellRarity: WeaponRarity | null;
  lootSerial: number;
  lootStats: { found: number; sold: number; soldCredits: number; };
  autopilot: boolean;
  sound: boolean;
  effects: boolean;
  savedAt: number;
  achievements: string[];
}
export interface Player { x: number; y: number; hp: number; invulnerable: number; }
export interface Enemy {
  id: number; kind: 'scout' | 'fighter' | 'tank' | 'boss';
  x: number; y: number; hp: number; maxHp: number; radius: number;
  age: number; baseX: number; shotTimer: number; hitFlash: number;
  pattern?: 'fan' | 'spiral' | 'cross';
  phase?: number;
  slowLeft?: number;
  slowFactor?: number;
  elite?: EliteId;
  charge?: number;
  aimAngle?: number;
}
export interface Bullet {
  id: number; x: number; y: number; vx: number; vy: number;
  damage: number; radius: number; friendly: boolean;
  weapon: WeaponId; pierce: number; hitIds: number[];
  source?: 'weapon' | 'drone';
  color?: number; crit?: boolean; age?: number;
  homing?: number; explosion?: number; chain?: number; frost?: number; leech?: number; salvage?: number;
  droneModel?: PartModel;
  chilledBonus?: number;
  chainRange?: number;
  empowered?: boolean;
}
export interface GameInput { x: number; y: number; target?: {x: number; y: number}; }
export interface GameStats {
  damage: number; fireRate: number; maxHp: number;
  droneCount: number; offlineRate: number; dps: number;
  critChance: number; critMultiplier: number; regen: number; damageReduction: number;
  moveSpeed: number; effectRadius: number; chilledBonus: number; highShieldDamage: number; cooldownSeconds: number;
  leechCapPerSecond: number;
}
export interface SynergyStatus {
  id: 'critical' | 'cryo' | 'cascade' | 'sustain';
  name: string; description: string; active: boolean; engaged: boolean; detail: string;
}
export type EventKind = 'shot' | 'hit' | 'kill' | 'hurt' | 'wave' | 'boss' | 'overdrive' | 'recovery' | 'achievement' | 'mastery' | 'module' | 'loot' | 'inventory' | 'collection' | 'critical' | 'explosion' | 'chain';
export interface GameEvent { kind: EventKind; x?: number; y?: number; value?: number; healing?: number; chilled?: boolean; empowered?: boolean; manual?: boolean; boss?: boolean; elite?: EliteId; weapon?: WeaponId; source?: 'weapon' | 'drone'; message?: string; item?: WeaponItem | PartItem; autoSold?: boolean; points?: {x:number;y:number}[]; }
export interface OfflineReward { seconds: number; credits: number; }
