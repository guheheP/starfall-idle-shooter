import type { Simulation } from './game/simulation';
import { MODULES } from './game/simulation';
import { WEAPON_BASES, RARITIES, INVENTORY_CAPACITY, getAffixText, getSellValue } from './game/loot';
import { PART_BASES, PART_SLOTS, PART_CAPACITY, getPartAffixText, getPartSellValue } from './game/parts';
import { ENHANCEMENT_MAX, enhancementLevel, enhancementMultiplier, getEnhancementInvestment, getEnhancementRefund } from './game/enhancement';
import { SKILL_NODES, SKILL_BRANCHES, type SkillBranch } from './game/research';
import { SECTORS, getSector, getOpeningDropMultiplier } from './game/sectors';
import type { LoadoutSlot } from './game/loadouts';
import type { ModuleId, UpgradeId, WeaponItem, WeaponRarity, PartItem, PartSlot, SkillId } from './game/types';
import { gearArt, gearArtModel } from './ui/gear-art';
import { renderMissionBoard } from './ui/mission-board';
import { getMissionRewardLevel, type MissionId, type MissionSummary } from './game/missions';
import { OPERATION_NODES, type OperationId } from './game/operations';
import { getRequisitionProfile, isRequisitionModel, type RequisitionModel } from './game/requisition';
import { getPwaState, subscribePwaState, installPwa } from './pwa';

type LootItem = WeaponItem | PartItem;
type InventoryCategory = 'weapon' | PartSlot;
type RecordsTab = 'navigation' | 'collection' | 'missions';
const isWeapon = (item: LootItem): item is WeaponItem => 'type' in item;

const icons: Record<string, string> = {
  crosshair: '<circle cx="12" cy="12" r="6"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
  rate: '<path d="m13 2-8 12h6l-1 8 9-13h-6z"/>',
  shield: '<path d="m12 2 8 3v6c0 5-4 8-8 11-4-3-8-6-8-11V5z"/><path d="m8 11 3 3 5-6"/>',
  drone: '<path d="m12 8 4 4-4 4-4-4zM9 9 6 6m9 3 3-3M9 15l-3 3m9-3 3 3"/><circle cx="5" cy="5" r="3"/><circle cx="19" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><circle cx="12" cy="12" r="1"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3v1"/>',
  settings: '<path d="m9 3 1-1h4l1 1 1 3 3 1 2 2v4l-2 2-3 1-1 3-1 2h-4l-1-2-1-3-3-1-2-2V9l2-2 3-1z"/><circle cx="12" cy="11.5" r="3"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  coin: '<path d="m12 2 9 5v10l-9 5-9-5V7z"/><path d="m15 8-6 4 6 4"/>',
  core: '<path d="m12 2 9 10-9 10L3 12z"/><path d="m12 7 4 5-4 5-4-5z"/>',
  sound: '<path d="M3 9h4l5-4v14l-5-4H3zM16 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>',
  pulse: '<path d="M7 20V9l3-4v15m4 0V5l3 4v11M7 12h3m4 0h3M8.5 2v1m7 0V2"/>',
  spread: '<path d="m4 4 5 8m11-8-5 8M12 2v10m-6 8 6-8 6 8zM3 13l2 3m16-3-2 3"/>',
  lance: '<path d="M12 2v14m-3-5 3 5 3-5M8 5 5 9v11h14V9l-3-4M9 20v2m6-2v2"/>',
  module: '<path d="m12 2 8 5v10l-8 5-8-5V7z"/><path d="m12 7 4 3v4l-4 3-4-3v-4zM4 7l4 3m8 0 4-3M12 17v5"/>',
  assault: '<path d="m12 2 7 8-7 12-7-12zM12 5v11m-4-6 4 6 4-6"/>',
  salvager: '<path d="M5 3v7l7 4 7-4V3M5 3l7 4 7-4M12 7v7m-6 3 6 4 6-4M3 12v5m18-5v5"/>',
  missile: '<path d="m12 2 4 6v9H8V8zM8 12l-4 5v4l4-2m8-7 4 5v4l-4-2M10 20v2m4-2v2"/><circle cx="12" cy="10" r="2"/>',
  arc: '<path d="m14 2-9 11h6l-1 9 9-13h-6zM4 3 2 7m18 10 2 4"/>',
  orbit: '<circle cx="12" cy="12" r="4"/><ellipse cx="12" cy="12" rx="10" ry="6" transform="rotate(-35 12 12)"/><path d="m10 4 3-2 3 3M6 17l-2 3 4 2"/>',
  inventory: '<path d="m5 5 3-2h8l3 2 2 4v10l-2 2H5l-2-2V9zM3 10h18M8 3v4h8V3M9 10v4h6v-4M7 18h10"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  weapon: '<path d="M7 3h3v13H6V7zm7 0h3l1 4v9h-4zM6 10h4m4 0h4M8 16v5m8-5v5M10 18h4"/>',
  wing: '<path d="m10 5-8 7 1 6 6-2 3 4 3-4 6 2 1-6-8-7-2 3zM12 8v12M3 13l6-4-1 5-5 2m18-3-6-4 1 5 5 2"/>',
  body: '<path d="m8 3-3 4v10l3 4h8l3-4V7l-3-4zM8 3v4h8V3M9 10h6v6H9zM5 11H3v5h2m14-5h2v5h-2M8 19h8"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M8 6.5a4.5 4.5 0 0 1 5 0"/>',
  frost: '<path d="M12 2v20M3 7l18 10M3 17 21 7M8 4l4 3 4-3M8 20l4-3 4 3M3 11l4-2V5m14 8-4 2v4M3 13l4 2v4m14-8-4-2V5"/>',
  mender: '<path d="m12 2 8 4v7c0 4-4 7-8 9-4-2-8-5-8-9V6zM12 8v8m-4-4h8"/>',
  records: '<circle cx="12" cy="12" r="9"/><path d="m16 7-2 7-6 3 2-7zM12 2v2m0 16v2M2 12h2m16 0h2"/>',
};
const icon = (name: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.crosshair}</svg>`;
const cssColor = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
const format = (value: number): string => {
  if (!Number.isFinite(value)) return 'MAX';
  if (value >= 1e9) return `${(value / 1e9).toFixed(value >= 1e10 ? 1 : 2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(value >= 1e7 ? 1 : 2)}M`;
  if (value >= 1e4) return `${(value / 1e3).toFixed(1)}K`;
  return Math.floor(value).toLocaleString('ja-JP');
};
const fee = (value: number) => Number.isFinite(value) ? Math.ceil(value).toLocaleString('ja-JP') : 'MAX';
const duration = (seconds: number) => seconds >= 3600 ? `${Math.floor(seconds / 3600)}時間 ${Math.floor(seconds % 3600 / 60)}分` : `${Math.max(1, Math.floor(seconds / 60))}分`;
const escapeHTML = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
const rarityInfo = (rarity: WeaponRarity) => RARITIES.find(item => item.id === rarity)!;
const upgrades: { id: UpgradeId; name: string; label: string; description: string; glyph: string }[] = [
  { id: 'damage', name: '出力の補助調整', label: 'POWER TRIM', description: '装備の出力を少し調整。1段階 +3%、最大10段階', glyph: 'crosshair' },
  { id: 'rate', name: '連射の補助調整', label: 'RATE TRIM', description: '装備の連射速度を少し調整。1段階 +2%、最大10段階', glyph: 'rate' },
  { id: 'shield', name: '耐久の補助調整', label: 'SHIELD TRIM', description: '装備の耐久力を少し調整。1段階 +2%、最大10段階', glyph: 'shield' },
];
const moduleUI: Record<ModuleId, { name: string; effect: string; glyph: string }> = {
  standard: { name: '標準型', effect: 'バランス重視', glyph: 'module' },
  assault: { name: '強襲型', effect: '威力 +25% / 耐久 −20%', glyph: 'assault' },
  bulwark: { name: '防衛型', effect: '耐久 +45% / 威力 −10%', glyph: 'shield' },
  salvager: { name: '回収型', effect: 'CR +35% / 威力 −12%', glyph: 'salvager' },
};
export interface UIOptions { onResetProgress?: () => boolean | Promise<boolean>; }
export function setupUI(sim: Simulation, options: UIOptions = {}): { render(): void; toast(message: string, tone?: string): void; destroy(): void } {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('Missing #app host');
  const row = (item: { id: UpgradeId; name: string; description: string; glyph: string }, kind: string) => `<div class="upgrade-row" data-row="${kind}-${item.id}" title="${item.description}"><div class="upgrade-glyph">${icon(item.glyph)}</div><div class="upgrade-copy"><h3>${item.name}<small data-value="${kind}-${item.id}-level"></small></h3><span class="upgrade-stat" data-value="${kind}-${item.id}-stat"></span></div><button class="purchase" data-action="${kind}" data-id="${item.id}" aria-label="${item.name}を強化"><span class="purchase-plus">＋</span><span data-value="${kind}-${item.id}-cost"></span></button></div>`;
  app.innerHTML = `
    <div class="app-shell">
      <main class="game-layout">
        <section class="flight-section" aria-label="シューティングプレイ画面">
          <div class="mobile-flight-summary"><span class="mobile-credit">${icon('coin')}<b data-value="mobile-credits">90</b><small>CR</small></span><span class="mobile-power"><small>DPS</small><b data-value="mobile-dps">65</b></span><button data-action="help" aria-label="遊び方を開く">${icon('help')}</button><button data-action="settings" aria-label="設定を開く">${icon('settings')}</button></div>
          <div class="cockpit" id="cockpit">
            <div id="game-canvas" aria-label="シューティング画面。WASD・矢印キーまたはドラッグで移動、Spaceで必殺技" tabindex="0"></div>
            <div class="cockpit-vignette" aria-hidden="true"></div>
            <div class="flight-topline"><span><span class="status-dot"></span> <span data-value="flight-state">SYSTEM ONLINE</span></span><span class="microtype" data-value="sector">SECTOR 01</span></div>
            <div class="field-hud">
              <div class="wave-display"><span class="microtype">CURRENT WAVE</span><div><span data-value="wave">01</span><span class="wave-suffix">/ <span data-value="wave-name">巡航宙域</span></span></div></div>
              <div class="best-display"><span class="microtype">BEST RECORD</span><strong>W<span data-value="best-wave">01</span></strong></div>
            </div>
            <div class="wave-progress" aria-label="ウェーブ進行"><span data-value="wave-progress-bar"></span></div>
            <div class="boss-hud" hidden><div><span class="microtype">HOSTILE FLAGSHIP</span><span data-value="boss-hp"></span></div><div class="boss-health"><span data-value="boss-health-bar"></span></div></div>
            <div class="shield-hud"><div><span class="microtype">SHIELD</span><span data-value="shield-number"></span></div><div class="shield-meter"><span data-value="shield-bar"></span></div></div>
            <div class="mode-hud"><span class="mode-orbit" aria-hidden="true"></span><span data-value="flight-mode">AUTO PILOT</span></div>
            <div class="field-notice" hidden><span class="microtype" data-value="notice-label"></span><strong data-value="notice-text"></strong></div>
            <span class="corner corner-tl" aria-hidden="true"></span><span class="corner corner-tr" aria-hidden="true"></span><span class="corner corner-bl" aria-hidden="true"></span><span class="corner corner-br" aria-hidden="true"></span>
          </div>
          <div class="game-toolbar"><button class="auto-toggle" data-action="autopilot" aria-pressed="true" title="移動も射撃も自動。WASD・矢印・ドラッグで手動操作"><span class="toggle-light"></span><b data-value="auto-label">自動操縦 ON</b></button><button class="overdrive" data-action="overdrive" aria-label="必殺技 オーバードライブ"><span class="overdrive-icon">${icon('rate')}</span><span><b>オーバードライブ</b><small data-value="overdrive-status">必殺技、準備完了</small></span><kbd>SPACE</kbd><span class="overdrive-progress" data-value="overdrive-bar"></span></button><button class="pause-button" data-action="pause" aria-label="一時停止" title="一時停止（P）">${icon('pause')}</button></div>
        </section>
        <aside class="hangar" aria-label="機体の強化と研究">
          <div class="hangar-header"><h2>機体整備</h2><span class="hangar-badge">MK. <span data-value="ship-mark">01</span></span><span class="active-module" data-value="module-name">標準型</span><div class="hangar-tools"><button class="icon-button records-tool" data-action="records" aria-label="航行情報・収集記録・任務を開く" title="航行情報・収集記録・任務">${icon('records')}<span>記録</span></button><button class="icon-button" data-action="help" aria-label="遊び方を開く" title="遊び方">${icon('help')}</button><button class="icon-button" data-action="settings" aria-label="設定を開く" title="設定">${icon('settings')}</button></div></div>
          <div class="resource-readout"><div class="credits">${icon('coin')}<strong data-value="credits">0</strong><span>CR</span></div><span class="resource-growth" data-value="offline-rate"></span></div>
          <div class="ship-readout"><div class="ship-stats"><div><span>推定 DPS</span><b data-value="dps">0</b></div><div><span>シールド</span><b data-value="max-hp">100</b></div><div><span>武装</span><b data-value="weapon-name">パルス</b></div><div><span>支援機</span><b data-value="drone-count">0</b></div></div></div>
          <button class="next-objective mission-shortcut" data-action="missions" aria-label="任務を選ぶ"><span class="mission-shortcut-heading"><b data-value="mission-badge">任務</b><kbd>M</kbd></span><p data-value="objective">任務を選ぶ</p><div class="objective-track"><span data-value="objective-bar"></span></div><small class="mission-shortcut-next" data-value="next-wave-objective"></small></button>
          <div class="hangar-tabs" role="tablist" aria-label="整備メニュー"><button id="tab-weapons" data-action="tab" data-id="weapons" role="tab" aria-selected="true" aria-controls="panel-weapons" tabindex="0">装備</button><button id="tab-upgrades" data-action="tab" data-id="upgrades" role="tab" aria-selected="false" aria-controls="panel-upgrades" tabindex="-1">補助調整</button><button id="tab-research" data-action="tab" data-id="research" role="tab" aria-selected="false" aria-controls="panel-research" tabindex="-1">研究</button></div>
          <div class="hangar-panel" id="panel-upgrades" role="tabpanel" aria-labelledby="tab-upgrades" hidden>${upgrades.map(item => row(item, 'upgrade')).join('')}<p class="calibration-note">装備を主役に、CRで少しずつ補助調整。</p></div>
          <div class="hangar-panel" id="panel-weapons" role="tabpanel" aria-labelledby="tab-weapons"><section class="loadout-section" aria-label="現在の装備"><div class="equipment-grid">${(['weapon', 'wing', 'body', 'drone'] as InventoryCategory[]).map(slot => `<button class="equipment-slot" data-action="open-slot" data-id="${slot}" aria-label="${{ weapon: '武器', wing: 'ウィング', body: 'ボディ', drone: 'ドローン' }[slot]}の装備倉庫を開く"><span class="gear-thumbnail" data-value="slot-${slot}-icon" aria-hidden="true"></span><span class="gear-copy"><span class="gear-heading"><b>${{ weapon: '武器', wing: 'ウィング', body: 'ボディ', drone: 'ドローン' }[slot]}</b><span class="rarity-mark" data-slot-rarity="${slot}"></span><small data-value="slot-${slot}-rarity"></small></span><strong data-value="slot-${slot}-name"></strong><small class="gear-level" data-value="slot-${slot}-type"></small></span></button>`).join('')}</div><button class="synergy-trigger" data-action="synergies"><span data-value="synergy-hint"></span><small>組み合わせ ${icon('arrow')}</small></button><button class="inventory-trigger" data-action="inventory">${icon('inventory')}<b>装備倉庫・強化</b><kbd>I</kbd><span data-value="inventory-capacity"></span>${icon('arrow')}</button></section><section class="module-section" aria-label="機体モジュール"><h3>機体モジュール <span>MODULE</span><select class="compact-module" data-setting="module" aria-label="機体モジュール">${MODULES.map(item => `<option value="${item.id}">${moduleUI[item.id].name}</option>`).join('')}</select></h3><div class="module-grid">${MODULES.map(item => { const display = moduleUI[item.id]; return `<button class="module-choice" data-action="module" data-id="${item.id}" aria-label="${display.name}モジュールを装備" aria-pressed="false" style="--module-color:${cssColor(item.color)}" title="${item.description}"><span class="module-title">${icon(display.glyph)}<b>${display.name}</b><span data-value="module-${item.id}-status"></span></span><small>${display.effect}</small></button>`; }).join('')}</div></section></div>
          <div class="hangar-panel" id="panel-research" role="tabpanel" aria-labelledby="tab-research" hidden><section class="research-summary"><div class="research-summary-heading"><span>永続スキル</span><b data-value="skill-total">0 / 27</b></div><div class="research-branches">${SKILL_BRANCHES.map(branch => `<button class="research-branch-summary" data-action="open-research-branch" data-id="${branch.id}" style="--branch-color:${branch.color}"><span>${icon(branch.id === 'offense' ? 'crosshair' : branch.id === 'defense' ? 'shield' : 'salvager')}<b>${branch.name}</b><small data-value="branch-${branch.id}-ranks">0 / 9</small></span><span class="branch-summary-track"><span data-value="branch-${branch.id}-bar"></span></span></button>`).join('')}</div><button class="research-tree-trigger" data-action="skill-tree"><span>${icon('core')}<b>CR スキルツリー</b></span>${icon('arrow')}</button><p data-value="research-intro">WAVE 15 から研究可能</p></section><button class="prestige-button" data-action="prestige"><span><b>再出撃する</b><small data-value="prestige-reward">WAVE 15 で解放</small></span>${icon('arrow')}</button></div>
          <div class="hangar-footer"><span>累計撃破 <b data-value="total-kills">0</b></span><span>出撃 <b data-value="runs">01</b></span></div>
        </aside>
        <nav class="mobile-navigation" aria-label="ゲームメニュー"><button data-action="inventory" aria-label="装備倉庫を開く">${icon('inventory')}<span>倉庫</span><i data-value="mobile-loot-count">1</i></button><button data-action="mobile-hangar" aria-label="機体整備を開く" aria-haspopup="dialog">${icon('module')}<span>整備</span></button><button data-action="skill-tree" aria-label="永続研究を開く">${icon('core')}<span>研究</span></button><button data-action="records" aria-label="航行情報・収集記録・任務を開く">${icon('records')}<span>記録</span></button></nav>
      </main>
    </div>
    <div class="toast-region" role="status" aria-live="polite" aria-atomic="true"><div class="toast" hidden><span class="toast-indicator"></span><span data-value="toast"></span></div></div>
    <dialog class="mobile-hangar-dialog" aria-label="機体整備"><div class="mobile-hangar-bar"><span>整備中 · 戦闘は一時停止</span><button data-action="close-mobile-hangar">飛行に戻る <span aria-hidden="true">×</span></button></div></dialog>
    <dialog class="game-dialog" aria-labelledby="dialog-title"><div class="dialog-eyebrow microtype" data-value="dialog-eyebrow"></div><h2 id="dialog-title" tabindex="-1"></h2><div class="dialog-body"></div><div class="dialog-actions"></div><button class="dialog-close icon-button" data-action="close-dialog" aria-label="ダイアログを閉じる">×</button></dialog>`;

  const query = <T extends Element = HTMLElement>(selector: string): T => app.querySelector<T>(selector)!;
  const canFocusButton = (button: HTMLButtonElement | null | undefined): button is HTMLButtonElement => !!button && !button.disabled && button.getClientRects().length > 0;
  const values = new Map<string, HTMLElement>();
  app.querySelectorAll<HTMLElement>('[data-value]').forEach(element => values.set(element.dataset.value!, element));
  const set = (name: string, value: string) => { const element = values.get(name); if (element && element.textContent !== value) element.textContent = value; };
  const bar = (name: string, ratio: number) => { const element = values.get(name); if (element) element.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`; };
  const dialog = query<HTMLDialogElement>('.game-dialog');
  const mobileDock = query<HTMLDialogElement>('.mobile-hangar-dialog');
  const hangar = query<HTMLElement>('.hangar');
  const layout = query<HTMLElement>('.game-layout');
  const mobileLayout = matchMedia('(max-width: 760px), (max-width: 1000px) and (max-height: 500px)');
  let pausedBeforeDock = false;
  let focusBeforeDock: HTMLElement | null = null;
  const toastElement = query<HTMLElement>('.toast');
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let pausedBeforeDialog = false;
  let dialogType = '';
  let resetPending = false;
  let focusBeforeDialog: HTMLElement | null = null;
  let lastBestWave = sim.state.bestWave;
  let destroyed = false;
  let inventoryCategory: InventoryCategory = 'weapon';
  let selectedItemId = sim.state.equippedWeaponId;
  let inventoryFocusId = selectedItemId;
  let inventoryFilter = 'all';
  let inventoryTypeFilter = 'all';
  let inventorySort = 'newest';
  let inventoryOwnership = 'all';
  let inventorySearch = '';
  let inventorySearchTimer: ReturnType<typeof setTimeout> | undefined;
  let inventoryPage = 0;
  let inventoryScrollTop = 0;
  let inventoryExpanded = false;
  let inventorySignature = '';
  let bulkReview = false;
  let showAllSynergies = false;
  let skillBranch: SkillBranch = 'offense';
  let skillSignature = '';
  let recordsTab: RecordsTab = 'navigation';
  let recordsSignature = '';
  const recordsScroll: Record<RecordsTab, number> = { navigation: 0, collection: 0, missions: 0 };
  let missionRosterScroll = 0;
  let missionDetailScroll = 0;
  let renderedRecordsTab: RecordsTab | null = null;
  let selectedMissionId: MissionId = 'kills';
  let missionExpanded = false;
  let requisitionModel: RequisitionModel = 'pulse';
  let missionReceipt: { missionId: MissionId; item: LootItem } | null = null;
  let loadoutTab: 'presets' | 'synergies' = 'presets';
  let loadoutSignature = '';
  const loadoutDraftNames: Partial<Record<LoadoutSlot, string>> = {};
  let pendingLoadout: { slot: LoadoutSlot; kind: 'save' | 'delete'; name?: string } | null = null;
  let pendingReferencedSale: string | null = null;
  let inspectScrollItemId = '';
  let inspectScrollTop = 0;
  const inventoryPageSize = INVENTORY_CAPACITY;

  function resetInventoryListPosition(): void {
    inventoryPage = 0;
    inventoryScrollTop = 0;
    inventoryFocusId = '';
    const list = app!.querySelector<HTMLElement>('.inventory-list');
    if (list) list.scrollTop = 0;
  }

  const categoryLabel = (category: InventoryCategory) => category === 'weapon' ? '武器' : PART_SLOTS.find(slot => slot.id === category)!.label;
  const equippedItem = (category: InventoryCategory): LootItem => category === 'weapon' ? sim.getEquippedWeapon() : sim.getEquippedPart(category);
  const itemGlyph = (item: LootItem) => isWeapon(item) ? item.type : ({ focus: 'crosshair', velocity: 'rate', cascade: 'spread', bastion: 'shield', reactor: 'core', siphon: 'salvager', striker: 'drone', frost: 'frost', mender: 'mender' }[item.model]);
  const itemBase = (item: LootItem) => isWeapon(item) ? WEAPON_BASES[item.type] : PART_BASES[item.model];
  const presetItem = (slot: InventoryCategory, id: string): LootItem | undefined => { const item = ownedItem(id); return item && (slot === 'weapon' ? isWeapon(item) : !isWeapon(item) && item.slot === slot) ? item : undefined; };
  const sellValue = (item: LootItem) => isWeapon(item) ? getSellValue(item) : getPartSellValue(item);
  const protectedItem = (item: LootItem) => item.starter || item.locked || item.id === (isWeapon(item) ? sim.state.equippedWeaponId : sim.state.equippedParts[item.slot]);
  const eligibleItems = (): LootItem[] => sim.state.autoSellRarity === null ? [] : [...sim.state.inventory, ...sim.state.parts].filter(item => !protectedItem(item) && sim.getLoadoutReferences(item.id).length === 0 && rarityInfo(item.rarity).rank <= rarityInfo(sim.state.autoSellRarity!).rank);
  const itemMetric = (item: LootItem) => isWeapon(item) ? sim.getWeaponPreview(item).dps : sim.getPartPreview(item).score;
  const precision = (value: number) => value.toLocaleString('ja-JP', { maximumFractionDigits: 1 });
  function enhancementMarkup(item: LootItem): string {
    const level = enhancementLevel(item);
    const equipped = item.id === equippedItem(isWeapon(item) ? 'weapon' : item.slot).id;
    const maximum = level >= ENHANCEMENT_MAX;
    if (!equipped || maximum) return '';
    let preview = '';
    if (!maximum) {
      if (isWeapon(item)) {
        const current = sim.getWeaponPreview(item);
        const next = sim.getWeaponPreview({ ...item, enhancement: level + 1 });
        preview = `<span>威力 <b>${precision(current.damage)} → ${precision(next.damage)}</b></span><span>期待DPS <b>${format(current.dps)} → ${format(next.dps)}</b></span>`;
      } else {
        const current = sim.getPartPreview(item);
        const next = sim.getPartPreview({ ...item, enhancement: level + 1 });
        preview = next.stats.filter(stat => stat.value !== current.stats.find(value => value.label === stat.label)?.value).slice(0, 3).map(stat => `<span>${escapeHTML(stat.label)} <b>${precision(current.stats.find(value => value.label === stat.label)?.value ?? 0)} → ${precision(stat.value)} ${escapeHTML(stat.unit)}</b></span>`).join('');
      }
    }
    return `<section class="equipment-enhancement" aria-label="次の強化の性能"><div class="enhancement-heading"><b>次の強化 +${level} → +${level + 1}</b><span>基本性能 +${Math.round((enhancementMultiplier(item) - 1) * 100)}% → +${(level + 1) * 5}%</span></div>${preview ? `<div class="enhancement-preview" aria-label="次の強化後の性能">${preview}</div>` : ''}<small class="enhancement-note">拾得Lv・副次効果を維持。再出撃後も有効。</small></section>`;
  }

  function enhancementActionMarkup(item: LootItem): string {
    const level = enhancementLevel(item);
    const cost = sim.getEnhancementCost(item.id);
    const equipped = item.id === equippedItem(isWeapon(item) ? 'weapon' : item.slot).id;
    const maximum = level >= ENHANCEMENT_MAX;
    const reason = !equipped ? '装備すると強化できます' : maximum ? '最大強化 +10' : sim.state.credits < cost ? `${fee(cost - sim.state.credits)} CR 不足` : '';
    return `<div class="inspect-upgrade-action" data-equipped="${equipped}"><span>${equipped ? `装備強化 +${level} / ${ENHANCEMENT_MAX}` : '未装備'}<small>${reason || '性能を確認して強化'}</small></span><button class="enhance-equipment" data-action="enhance-equipment" data-id="${escapeHTML(item.id)}" ${!equipped || maximum || sim.state.credits < cost ? 'disabled' : ''} title="${reason || `+${level + 1}に強化。拾得Lvと副次効果は変わりません`}"><span>${!equipped ? '装備が必要' : maximum ? 'MAX' : `+${level + 1} に強化`}</span>${Number.isFinite(cost) ? `<b>${fee(cost)} CR</b>` : ''}</button></div>`;
  }

  function matchedEnhancementMarkup(item: LootItem): string {
    const current = equippedItem(isWeapon(item) ? 'weapon' : item.slot);
    const targetLevel = enhancementLevel(current);
    if (item.id === current.id || targetLevel <= enhancementLevel(item)) return '';
    const candidate = { ...item, enhancement: targetLevel };
    const additionalCost = getEnhancementInvestment(candidate) - getEnhancementInvestment(item);
    const difference = (value: number, baseline: number): string => {
      if (baseline <= 0) return '現在比 —';
      const percent = (value / baseline - 1) * 100;
      return `現在比 ${Math.abs(percent) < .05 ? '±0' : `${percent > 0 ? '+' : ''}${precision(percent)}`}％`;
    };
    let performance = '';
    if (isWeapon(item)) {
      const preview = sim.getWeaponPreview({ ...item, enhancement: targetLevel });
      const baseline = sim.getWeaponPreview(sim.getEquippedWeapon());
      performance = `<p class="part-fixed-effect">期待 DPS <b>${precision(preview.dps)}</b><br>現在 ${precision(baseline.dps)} · ${difference(preview.dps, baseline.dps)}</p>`;
    } else if (!isWeapon(current) && item.model === current.model) {
      const label = item.slot === 'body' ? '基礎シールド' : item.slot === 'drone' ? '1機の威力' : item.model === 'focus' ? '会心率' : item.model === 'velocity' ? '連射補正' : '効果範囲';
      const preview = sim.getPartPreview({ ...item, enhancement: targetLevel }).stats.find(stat => stat.label === label);
      const baseline = sim.getPartPreview(current).stats.find(stat => stat.label === label);
      if (preview && baseline) performance = `<p class="part-fixed-effect">${escapeHTML(label)} <b>${precision(preview.value)} ${escapeHTML(preview.unit)}</b><br>現在 ${precision(baseline.value)} ${escapeHTML(baseline.unit)} · ${difference(preview.value, baseline.value)}</p>`;
    } else {
      performance = '<p class="enhancement-note">各性能と副次効果で、装備の役割の違いを確認できます。</p>';
    }
    return `<section class="equipment-enhancement" aria-label="同じ強化段階にした場合の比較"><div class="enhancement-heading"><b>同じ強化 +${targetLevel} で比較</b></div><small class="enhancement-note">費用を払って +${targetLevel} に強化した場合の見込み。</small>${performance}<p class="part-fixed-effect">+${enhancementLevel(item)} → +${targetLevel} の累計追加強化費<br><b>${fee(additionalCost)} CR</b></p></section>`;
  }

  const skillTreeMarkup = () => `<div class="skill-wallet"><span>${icon('coin')}<b data-skill="credits"></b> CR</span><small>永続研究 · W15 / W20 / W25 で各段階を解放</small></div><div class="skill-branch-tabs" role="tablist" aria-label="研究系統">${SKILL_BRANCHES.map(branch => `<button data-action="skill-branch" data-id="${branch.id}" role="tab" aria-selected="${branch.id === skillBranch}" style="--branch-color:${branch.color}">${icon(branch.id === 'offense' ? 'crosshair' : branch.id === 'defense' ? 'shield' : 'salvager')}<span>${branch.name}</span></button>`).join('')}</div><div class="skill-tree" data-skill="tree"></div><p class="skill-permanence">CRで習得したスキルは、装備を替えても再出撃しても残ります。</p>`;

  function renderSkillTree(): void {
    if (dialogType !== 'skill-tree') return;
    const signature = JSON.stringify([sim.state.skills, sim.state.credits, sim.state.bestWave, skillBranch]);
    if (signature === skillSignature) return;
    skillSignature = signature;
    query('[data-skill="credits"]').textContent = format(sim.state.credits);
    query('.skill-tree').dataset.branch = skillBranch;
    app!.querySelectorAll<HTMLButtonElement>('[data-action="skill-branch"]').forEach(button => { const active = button.dataset.id === skillBranch; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
    const focused = document.activeElement instanceof HTMLButtonElement && dialog.contains(document.activeElement) ? { action: document.activeElement.dataset.action, id: document.activeElement.dataset.id } : null;
    query('[data-skill="tree"]').innerHTML = SKILL_BRANCHES.map(branch => `<section class="skill-branch ${branch.id === skillBranch ? 'selected' : ''}" style="--branch-color:${branch.color}" aria-label="${branch.name}"><div class="skill-branch-heading">${icon(branch.id === 'offense' ? 'crosshair' : branch.id === 'defense' ? 'shield' : 'salvager')}<b>${branch.name}</b></div><div class="skill-nodes">${SKILL_NODES.filter(node => node.branch === branch.id).map(node => {
      const rank = sim.getSkillRank(node.id);
      const cost = sim.getSkillCost(node.id);
      const maximum = rank >= node.maxRank;
      const prerequisite = node.requires ? SKILL_NODES.find(parent => parent.id === node.requires!.id)! : null;
      const missingPrerequisite = !!node.requires && sim.getSkillRank(node.requires.id) < node.requires.rank;
      const waveLocked = sim.state.bestWave < node.unlockWave;
      const reason = maximum ? '最大ランク' : waveLocked ? `最高 WAVE ${node.unlockWave} が必要` : missingPrerequisite ? `${prerequisite!.name} ランク${node.requires!.rank}が必要` : sim.state.credits < cost ? `${fee(cost - sim.state.credits)} CR 不足` : `ランク ${rank + 1} を習得`;
      return `<article class="skill-node ${waveLocked || missingPrerequisite ? 'locked' : ''} ${maximum ? 'maxed' : ''}"><div class="skill-node-heading"><h3>${node.name}</h3><b>${rank} / ${node.maxRank}</b></div><p>${node.description}</p><div class="skill-prerequisite">W${node.unlockWave}${node.requires ? ` · ${prerequisite!.name} ${node.requires.rank}` : ' · 初期ノード'}</div><button data-action="learn-skill" data-id="${node.id}" ${sim.canLearnSkill(node.id) ? '' : 'disabled'} title="${reason}"><span>${reason}</span>${!maximum && Number.isFinite(cost) ? `<b>${fee(cost)} CR</b>` : ''}</button></article>`;
    }).join('')}</div></section>`).join('');
    if (focused?.action) {
      const button = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-action]')).find(candidate => candidate.dataset.action === focused.action && candidate.dataset.id === focused.id);
      (canFocusButton(button) ? button : query<HTMLButtonElement>('.dialog-primary')).focus({ preventScroll: true });
    }
  }
  const loadoutMarkup = () => `<div class="loadout-tabs" role="tablist" aria-label="構成と装備の相性"><button data-action="loadout-tab" data-id="presets" role="tab" aria-selected="${loadoutTab === 'presets'}">${icon('inventory')}構成</button><button data-action="loadout-tab" data-id="synergies" role="tab" aria-selected="${loadoutTab === 'synergies'}">${icon('module')}装備の相性</button></div><div class="loadout-content" data-loadout="content"></div>`;

  const currentLoadoutMarkup = () => `<div class="loadout-current"><span class="loadout-current-label">現在の装備</span><div>${(['weapon', 'wing', 'body', 'drone'] as InventoryCategory[]).map(slot => { const item = equippedItem(slot); return `<span title="${escapeHTML(item.name)}" style="--gear-color:${cssColor(rarityInfo(item.rarity).color)}"><small>${categoryLabel(slot)}</small><b>${escapeHTML(item.name)}</b><em>+${enhancementLevel(item)}</em></span>`; }).join('')}</div><small>モジュール：${moduleUI[sim.state.module].name} · 保存・呼び出しはCR消費なし</small></div>`;

  function renderLoadouts(): void {
    if (dialogType !== 'synergies') return;
    const summaries = sim.getLoadouts();
    const synergies = sim.getSynergies();
    const signature = JSON.stringify([loadoutTab, summaries, synergies, sim.state.inventory, sim.state.parts, sim.state.equippedWeaponId, sim.state.equippedParts, sim.state.module, pendingLoadout]);
    if (loadoutSignature === signature) return;
    loadoutSignature = signature;
    app!.querySelectorAll<HTMLButtonElement>('[data-action="loadout-tab"]').forEach(button => { const active = button.dataset.id === loadoutTab; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
    const activeElement = document.activeElement;
    const focusedName = activeElement instanceof HTMLInputElement && activeElement.dataset.loadoutName ? { slot: activeElement.dataset.loadoutName, start: activeElement.selectionStart, end: activeElement.selectionEnd } : null;
    const focusedButton = activeElement instanceof HTMLButtonElement && dialog.contains(activeElement) ? { action: activeElement.dataset.action, id: activeElement.dataset.id } : null;
    const content = query('[data-loadout="content"]');
    if (loadoutTab === 'synergies') {
      content.innerHTML = `<p class="loadout-note">装備の相性と、いま発動している条件を確認できます。</p><ul class="synergy-guide live-synergy-guide">${synergies.map(synergy => `<li class="${synergy.active ? 'active' : ''} ${synergy.engaged ? 'engaged' : ''}"><div><b>${escapeHTML(synergy.name)}</b><span>${synergy.engaged ? '発動中' : synergy.active ? '相性成立・待機' : '未成立'}</span></div><p>${escapeHTML(synergy.description)}</p><p class="synergy-live-detail">${escapeHTML(synergy.detail)}</p></li>`).join('')}</ul>`;
    } else if (pendingLoadout) {
      const reviewSlot = pendingLoadout.slot;
      const summary = summaries.find(item => item.slot === reviewSlot)!;
      content.innerHTML = `<section class="loadout-confirmation"><span class="microtype">${pendingLoadout.kind === 'save' ? 'REPLACE LOADOUT' : 'DELETE LOADOUT'}</span><h3>「${escapeHTML(summary.preset?.name ?? summary.label)}」を${pendingLoadout.kind === 'save' ? '上書き' : '削除'}します</h3><p>${pendingLoadout.kind === 'save' ? `現在の4部位とモジュールを「${escapeHTML(pendingLoadout.name ?? summary.label)}」として保存します。` : '保存構成だけを削除します。装備は倉庫に残ります。'}</p>${pendingLoadout.kind === 'save' ? currentLoadoutMarkup() : ''}<div><button data-action="cancel-loadout-review" data-id="${pendingLoadout.slot}">戻る</button><button class="confirm-loadout" data-action="confirm-loadout-review" data-id="${pendingLoadout.slot}">${pendingLoadout.kind === 'save' ? '現在の装備で上書き' : 'この構成を削除'}</button></div></section>`;
    } else {
      content.innerHTML = `${currentLoadoutMarkup()}<div class="loadout-presets">${summaries.map(summary => {
        const preset = summary.preset;
        const name = loadoutDraftNames[summary.slot] ?? preset?.name ?? summary.label;
        const status = !preset ? '未保存' : summary.equipped ? '使用中' : summary.available ? '呼び出し可能' : summary.missingItems.length ? `欠品 ${summary.missingItems.length}部位` : 'モジュール未解放';
        const gear = preset ? (['weapon', 'wing', 'body', 'drone'] as InventoryCategory[]).map(slot => { const id = slot === 'weapon' ? preset.weaponId : preset.parts[slot]; const item = presetItem(slot, id); return `<li class="${item ? '' : 'missing'}" ${item ? `style="--gear-color:${cssColor(rarityInfo(item.rarity).color)}"` : ''}><span>${categoryLabel(slot)}</span><b title="${escapeHTML(item?.name ?? id)}">${item ? escapeHTML(item.name) : '倉庫にありません'}</b>${item ? `<small>+${enhancementLevel(item)}</small>` : ''}</li>`; }).join('') : '';
        return `<article class="loadout-preset ${summary.equipped ? 'equipped' : ''} ${preset && !summary.available ? 'incomplete' : ''}"><div class="loadout-preset-heading"><b>${summary.label}</b><span>${status}</span></div><label class="loadout-name"><span class="sr-only">${summary.label}の名前</span><input type="text" data-loadout-name="${summary.slot}" aria-label="${summary.label}の名前" maxlength="20" value="${escapeHTML(name)}" placeholder="構成の名前" autocomplete="off"></label>${preset ? `<ul class="loadout-gear">${gear}</ul><p class="loadout-module">モジュール：${moduleUI[preset.module].name}${summary.moduleLocked ? '（未解放）' : ''}</p>` : '<div class="loadout-empty">'+icon('inventory')+'<span>現在の装備を保存できます</span></div>'}<div class="loadout-preset-actions"><button class="recall-loadout" data-action="equip-loadout" data-id="${summary.slot}" ${!summary.available || summary.equipped ? 'disabled' : ''} title="${summary.equipped ? 'この構成を使用中です' : !preset ? 'まだ保存されていません' : !summary.available ? `${summary.missingItems.map(item => categoryLabel(item.slot)).join('・')}${summary.moduleLocked ? ' モジュール' : ''}を確認してください` : '4部位とモジュールをまとめて呼び出す'}">${summary.equipped ? '使用中' : 'この構成を呼び出す'}</button><button class="save-loadout" data-action="save-loadout" data-id="${summary.slot}">${preset ? '現在の装備で上書き' : '現在の装備を保存'}</button><button class="delete-loadout" data-action="delete-loadout" data-id="${summary.slot}" ${preset ? '' : 'disabled'}>削除</button></div></article>`;
      }).join('')}</div><p class="loadout-note">保存構成の装備は、一括整理・倉庫満杯時の売却から保護されます。個別に売却すると欠品状態になり、呼び出しを停止します。</p>`;
    }
    if (focusedName) {
      const field = dialog.querySelector<HTMLInputElement>(`[data-loadout-name="${focusedName.slot}"]`);
      if (field) { field.focus({ preventScroll: true }); field.setSelectionRange(focusedName.start, focusedName.end); }
    } else if (focusedButton?.action) {
      const button = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-action]')).find(candidate => candidate.dataset.action === focusedButton.action && candidate.dataset.id === focusedButton.id);
      (canFocusButton(button) ? button : query<HTMLButtonElement>('.dialog-primary')).focus({ preventScroll: true });
    }
  }

  const recordTabs: { id: RecordsTab; name: string; glyph: string }[] = [
    { id: 'navigation', name: '航行情報', glyph: 'records' },
    { id: 'collection', name: '収集記録', glyph: 'inventory' },
    { id: 'missions', name: '任務', glyph: 'crosshair' },
  ];
  const recordsMarkup = () => `<div class="records-tabs" role="tablist" aria-label="航行・収集・任務">${recordTabs.map(tab => `<button id="records-tab-${tab.id}" data-action="records-tab" data-id="${tab.id}" role="tab" aria-controls="records-content" aria-selected="${recordsTab === tab.id}" tabindex="${recordsTab === tab.id ? 0 : -1}">${icon(tab.glyph)}${tab.name}</button>`).join('')}</div><div id="records-content" class="records-content" data-records="content" role="tabpanel" aria-labelledby="records-tab-${recordsTab}"></div>`;
  function selectRecordsTab(tab: RecordsTab): void {
    recordsScroll[recordsTab] = query('[data-records="content"]').scrollTop;
    recordsTab = tab;
    recordsSignature = '';
  }

  function operationsMarkup(): string {
    const selected = sim.getOperation();
    const active = sim.getActiveOperation();
    return `<section class="operation-board" aria-label="航行作戦"><h3 class="records-section-heading">航行作戦 <small>現在：${escapeHTML(active.name)} / 選択：${escapeHTML(selected.name)}</small></h3><p class="operation-note">選択した作戦は次の戦闘開始時に適用（再挑戦・再読込を含む）。数値は宙域補正に加わる作戦の補正です。</p><div class="operation-choices">${OPERATION_NODES.map(operation => {
      const unlocked = sim.state.bestWave >= operation.unlockWave;
      const picked = selected.id === operation.id;
      const applied = active.id === operation.id;
      const status = !unlocked ? `WAVE ${operation.unlockWave}クリアで解放` : picked && applied ? '選択・適用中' : picked ? '次の戦闘から' : applied ? 'このWAVEに適用中' : '選択する';
      return `<button class="operation-choice ${applied ? 'applied' : ''}" data-action="operation" data-id="${operation.id}" aria-pressed="${picked}" ${unlocked ? '' : 'disabled'} style="--operation-color:${cssColor(operation.color)}"><span class="operation-heading"><b>${escapeHTML(operation.name)}</b><small>${status}</small></span><span class="operation-description">${escapeHTML(operation.description)}</span><span class="operation-modifiers"><span>敵HP <b>×${operation.healthMultiplier.toFixed(2)}</b></span><span>精鋭 <b>＋${operation.extraElites}機</b></span><span>敵弾速 <b>×${operation.bulletSpeed.toFixed(2)}</b></span><span>射撃間隔 <b>×${operation.shotInterval.toFixed(2)}</b></span><span>戦闘CR <b>×${operation.creditMultiplier.toFixed(2)}</b></span><span>装備回収率 <b>＋${Math.round(operation.dropBonus * 100)}pt</b></span></span></button>`;
    }).join('')}</div><p class="operation-note">装備回収率の補正は通常敵の武器・パーツそれぞれに適用。弾の間隔が小さい作戦ほど敵の射撃が増えます。</p></section>`;
  }

  function missionsMarkup(missions: MissionSummary[]): string {
    const selected = missions.find(mission => mission.id === selectedMissionId) ?? missions[0];
    selectedMissionId = selected.id;
    const active = missions.find(mission => mission.active);
    const profile = getRequisitionProfile(requisitionModel)!;
    const level = getMissionRewardLevel(sim.state.bestWave, selected.rank);
    const rarity = rarityInfo(selected.rewardRarity);
    const issue = sim.getMissionClaimIssue(selected.id, requisitionModel);
    const count = profile.category === 'weapon' ? sim.state.inventory.length : sim.state.parts.length;
    const capacity = profile.category === 'weapon' ? INVENTORY_CAPACITY : PART_CAPACITY;
    const receipt = missionReceipt?.missionId === selected.id ? missionReceipt.item : null;
    return renderMissionBoard({
      missions, selected, active, profile, requisitionModel, rewardLevel: level,
      rewardRarityLabel: rarity.label, rewardColor: cssColor(rarity.color),
      claimIssue: issue, storageCount: count, storageCapacity: capacity, bestWave: sim.state.bestWave,
      receipt: receipt ? { item: receipt, rarityLabel: rarityInfo(receipt.rarity).label, affixes: isWeapon(receipt) ? receipt.affixes.map(getAffixText) : receipt.affixes.map(getPartAffixText) } : null,
    });
  }

  function renderRecords(): void {
    if (dialogType !== 'records') return;
    const summary = sim.getCollectionSummary();
    const milestones = sim.getCollectionMilestones();
    const missions = sim.getMissions();
    const signature = JSON.stringify([recordsTab, sim.state.wave, sim.state.bestWave, sim.state.collection, milestones, missions, sim.getOperation().id, sim.getActiveOperation().id, selectedMissionId, requisitionModel, sim.state.inventory.length, sim.state.parts.length, missionReceipt, missionExpanded]);
    if (recordsSignature === signature) return;
    recordsSignature = signature;
    const content = query('[data-records="content"]');
    const activeElement = document.activeElement as HTMLElement | null;
    const focus = activeElement && content.contains(activeElement) ? { action: activeElement.dataset.action, id: activeElement.dataset.id, control: activeElement.dataset.missionControl } : null;
    if (renderedRecordsTab === recordsTab) recordsScroll[recordsTab] = content.scrollTop;
    if (renderedRecordsTab === 'missions') {
      missionRosterScroll = content.querySelector<HTMLElement>('.mission-roster')?.scrollTop ?? missionRosterScroll;
      missionDetailScroll = content.querySelector<HTMLElement>('.mission-detail')?.scrollTop ?? missionDetailScroll;
    }
    content.classList.toggle('missions-content', recordsTab === 'missions');
    dialog.classList.toggle('mission-detail-open', recordsTab === 'missions' && missionExpanded);
    content.setAttribute('aria-labelledby', `records-tab-${recordsTab}`);
    app!.querySelectorAll<HTMLButtonElement>('[data-action="records-tab"]').forEach(button => { const active = button.dataset.id === recordsTab; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
    if (recordsTab === 'navigation') {
      const sector = getSector(sim.state.wave);
      const index = SECTORS.findIndex(item => item.id === sector.id);
      const next = SECTORS[index + 1];
      const drops = getOpeningDropMultiplier(sim.state.wave);
      const dropPercent = (chance: number) => (chance * drops * 100).toLocaleString('ja-JP', { maximumFractionDigits: 1 });
      query('[data-records="content"]').innerHTML = `<section class="sector-current" style="--sector-color:${cssColor(sector.color)}"><div><span class="microtype">CURRENT SECTOR / WAVE ${sim.state.wave}</span><h3>${sector.name}</h3><p>${sector.description}</p></div><span class="sector-symbol">${icon('records')}</span></section><div class="sector-modifiers"><div><span>宙域の戦闘CR</span><b>×${sector.creditMultiplier.toFixed(2)}</b></div><div><span>宙域の敵弾速度</span><b>×${sector.enemySpeed.toFixed(2)}</b></div><div><span>宙域の敵射撃間隔</span><b>×${sector.shotInterval.toFixed(2)}</b></div><div><span>通常の装備回収率</span><b>武器 ${dropPercent(sector.weaponDropChance)}% / パーツ ${dropPercent(sector.partDropChance)}%</b></div></div><p class="records-note">${next ? `次の宙域は WAVE ${next.unlockWave}「${next.name}」。` : '最深部の宙域を航行中。'}離席の回収率は最高クリアWAVEの宙域を反映します。</p><h3 class="records-section-heading">航路</h3><div class="sector-route">${SECTORS.map((item, position) => { const reached = sim.state.bestWave >= item.unlockWave; return `<article class="sector-route-stop ${position === index ? 'current' : reached ? 'reached' : ''}" style="--sector-color:${cssColor(item.color)}"><span class="route-number">0${position + 1}</span><div><h4>${item.name}<small>W${item.unlockWave}${SECTORS[position + 1] ? `–${SECTORS[position + 1].unlockWave - 1}` : '＋'}</small></h4><p>${item.description}</p></div><b>${position === index ? '航行中' : reached ? '記録あり' : '未記録'}</b></article>`; }).join('')}</div>`;
      content.insertAdjacentHTML('beforeend', operationsMarkup());
    } else if (recordsTab === 'missions') {
      content.innerHTML = '<button class="mission-pane-switch" data-action="mission-list">← 任務一覧に戻る</button>' + missionsMarkup(missions);
    } else {
      const collection = sim.state.collection;
      const discovered = (count: number | undefined) => (count ?? 0) > 0;
      query('[data-records="content"]').innerHTML = `<div class="collection-summary"><div><span>武器系統</span><b>${summary.weaponsFound}<small> / ${summary.weaponTotal}</small></b></div><div><span>パーツモデル</span><b>${summary.partsFound}<small> / ${summary.partTotal}</small></b></div><div><span>レア度</span><b>${summary.raritiesFound}<small> / ${summary.rarityTotal}</small></b></div><div><span>精鋭 / 旗艦撃破</span><b>${format(summary.elites)}<small> / ${format(summary.bosses)}</small></b></div></div><p class="records-note">拾得した装備を記録。初期装備は対象外、自動売却した装備も発見に含まれます。</p><h3 class="records-section-heading">武器系統</h3><div class="collection-models">${(Object.keys(WEAPON_BASES) as (keyof typeof WEAPON_BASES)[]).map(id => `<div class="collection-model ${discovered(collection.weapons[id]) ? 'found' : ''}" style="--model-color:${cssColor(WEAPON_BASES[id].color)}">${icon(id)}<span>${WEAPON_BASES[id].name}<small>${discovered(collection.weapons[id]) ? `${format(collection.weapons[id]!)} 回収` : '未発見'}</small></span></div>`).join('')}</div><h3 class="records-section-heading">機体パーツ</h3><div class="collection-models">${(Object.keys(PART_BASES) as (keyof typeof PART_BASES)[]).map(id => `<div class="collection-model ${discovered(collection.parts[id]) ? 'found' : ''}" style="--model-color:${cssColor(PART_BASES[id].color)}">${icon(PART_BASES[id].slot)}<span>${PART_BASES[id].name}<small>${discovered(collection.parts[id]) ? `${format(collection.parts[id]!)} 回収` : '未発見'}</small></span></div>`).join('')}</div><div class="collection-rarities">${RARITIES.map(rarity => `<span class="${discovered(collection.rarities[rarity.id]) ? 'found' : ''}" style="--rarity-color:${cssColor(rarity.color)}">${rarity.label}${discovered(collection.rarities[rarity.id]) ? ' ◆' : ''}</span>`).join('')}</div><h3 class="records-section-heading">収集とクリアの報酬 <small>達成時に自動受領・再出撃後も記録</small></h3><div class="collection-milestones">${milestones.map(milestone => `<article class="collection-milestone ${milestone.claimed ? 'claimed' : ''}"><div><h4>${milestone.name}<b>${milestone.current} / ${milestone.target}</b></h4><p>${milestone.description}</p><span class="milestone-track"><span style="width:${Math.min(1, milestone.current / milestone.target) * 100}%"></span></span></div><span><b>＋${fee(milestone.reward)} CR</b><small>${milestone.claimed ? '自動受領済み' : '進行中'}</small></span></article>`).join('')}</div>`;
    }
    content.scrollTop = recordsScroll[recordsTab];
    if (recordsTab === 'missions') {
      if (mobileLayout.matches) query('.mission-detail').prepend(query('.mission-detail-header'));
      query('.mission-roster').scrollTop = missionRosterScroll;
      query('.mission-detail').scrollTop = missionDetailScroll;
    }
    renderedRecordsTab = recordsTab;
    if (focus?.control) {
      content.querySelector<HTMLSelectElement>(`[data-mission-control="${focus.control}"]`)?.focus({ preventScroll: true });
    } else if (focus?.action) {
      const button = Array.from(content.querySelectorAll<HTMLButtonElement>('[data-action]')).find(candidate => candidate.dataset.action === focus.action && candidate.dataset.id === focus.id);
      const fallback = content.querySelector<HTMLButtonElement>(`[data-action="inspect-mission"][data-id="${selectedMissionId}"]`);
      (canFocusButton(button) ? button : canFocusButton(fallback) ? fallback : query<HTMLButtonElement>('.dialog-primary')).focus({ preventScroll: true });
    }
  }
  const inventoryMarkup = () => `
    <div class="inventory-category-tabs" role="tablist" aria-label="装備の種類">${(['weapon', 'wing', 'body', 'drone'] as InventoryCategory[]).map(category => `<button data-action="inventory-category" data-id="${category}" role="tab" aria-selected="${category === inventoryCategory}">${icon(category)}<span>${categoryLabel(category)}</span></button>`).join('')}</div>
    <div class="inventory-commandbar"><label class="inventory-search">${icon('search')}<input type="search" data-inventory-control="search" aria-label="装備名・能力で検索" placeholder="装備名・能力を検索" value="${escapeHTML(inventorySearch)}" autocomplete="off" spellcheck="false"><button class="inventory-search-clear" data-action="clear-inventory-search" aria-label="検索を消去" title="検索を消去" ${inventorySearch ? "" : "hidden"}>×</button></label><label><span class="sr-only">保管状態</span><select data-inventory-control="ownership" aria-label="装備・保護の状態で絞り込み"><option value="all">すべて</option><option value="equipped">装備中</option><option value="protected">保護中</option><option value="sellable">売却可能</option></select></label></div>
    <div class="inventory-tools-row"><details class="inventory-tools"><summary><span>自動売却 <b data-inventory="policy-label">OFF</b></span><small>条件・設定 ${icon('settings')}</small></summary><div class="inventory-tools-content"><h3>取得時の自動売却</h3><div class="inventory-policy"><label><span class="sr-only">自動売却の上限</span><select data-inventory-control="auto-sell" aria-label="自動売却するレア度の上限"><option value="off">OFF — レア度で売却しない</option>${RARITIES.map(item => `<option value="${item.id}">${item.label}以下を売却</option>`).join('')}</select></label><small>全装備共通・今後の取得分だけに適用。装備中・保護中・初期装備は保管します。</small></div><h3>詳細な絞り込み</h3><div class="inventory-filters"><label><span class="sr-only">レア度</span><select data-inventory-control="rarity" aria-label="レア度で絞り込み"><option value="all">全レア度</option>${RARITIES.map(item => `<option value="${item.id}">${item.label}</option>`).join('')}</select></label><label data-inventory="weapon-type-filter"><span class="sr-only">武器系統</span><select data-inventory-control="type" aria-label="武器系統で絞り込み"><option value="all">全系統</option>${Object.entries(WEAPON_BASES).map(([id, base]) => `<option value="${id}">${base.name}</option>`).join('')}</select></label><label><span class="sr-only">並び順</span><select data-inventory-control="sort" aria-label="装備の並び順"><option value="newest">新しい順</option><option value="rarity">レア度順</option><option value="dps">DPS / 評価順</option><option value="level">拾得Lv順</option></select></label></div><p>倉庫内の装備は「一括整理」で対象と金額を確認してから売却。満杯時は未保護の装備をレア度・性能で比べて整理します。</p><button class="inventory-tools-return" data-action="close-inventory-tools">装備の比較に戻る</button></div></details><button class="bulk-review-button" data-action="review-bulk">一括整理</button></div>
    <div class="inventory-active-filters" data-inventory="active-filters" hidden></div>
    <div class="bulk-review" data-inventory="bulk-review" hidden></div><div class="referenced-sale-review" data-inventory="referenced-sale" hidden></div>
    <button class="inventory-pane-switch" data-action="inventory-view" aria-expanded="false">選択装備を詳しく比較</button>
    <div class="inventory-workspace"><section class="inventory-roster" aria-label="保管中の装備"><div class="inventory-list" data-inventory="list"></div><div class="inventory-pagination" hidden><button data-action="inventory-prev" aria-label="前のページ">‹</button><span data-inventory="page"></span><button data-action="inventory-next" aria-label="次のページ">›</button></div></section><section class="inventory-inspect" data-inventory="detail" aria-label="選択した装備の性能"></section></div>
    <div class="inventory-summary" data-inventory="summary" title="武器64枠・機体パーツ共通64枠。装備中・保護中・初期装備は売却されません。"></div>`;

  function renderInventory(): void {
    if (dialogType !== 'inventory') return;
    const signature = JSON.stringify([sim.state.inventory, sim.state.parts, sim.state.loadouts, sim.state.equippedWeaponId, sim.state.equippedParts, sim.state.autoSellRarity, sim.state.lootStats, sim.state.upgrades, sim.state.skills, sim.state.credits, sim.state.module, sim.state.mastery, inventoryCategory, inventoryFilter, inventoryTypeFilter, inventorySort, inventoryOwnership, inventorySearch, inventoryPage, inventoryExpanded, selectedItemId, bulkReview, showAllSynergies, pendingReferencedSale]);
    if (signature === inventorySignature) return;
    inventorySignature = signature;
    const list = query<HTMLElement>('.inventory-list');
    if (list.getClientRects().length) inventoryScrollTop = list.scrollTop;
    const detail = query('[data-inventory="detail"]');
    const previousReadingArea = detail.querySelector<HTMLElement>('.inspect-scroll');
    if (previousReadingArea && previousReadingArea.getClientRects().length > 0) {
      inspectScrollItemId = detail.dataset.itemId ?? '';
      inspectScrollTop = previousReadingArea.scrollTop;
    }
    dialog.classList.toggle('inventory-compare-view', inventoryExpanded);
    const paneSwitch = query<HTMLButtonElement>('.inventory-pane-switch');
    paneSwitch.textContent = inventoryExpanded ? '← 装備一覧に戻る' : '選択装備を詳しく比較';
    paneSwitch.setAttribute('aria-expanded', String(inventoryExpanded));
    const control = (id: string) => query<HTMLSelectElement>(`[data-inventory-control="${id}"]`);
    control('auto-sell').value = sim.state.autoSellRarity ?? 'off';
    control('rarity').value = inventoryFilter;
    control('type').value = inventoryTypeFilter;
    control('sort').value = inventorySort;
    control('ownership').value = inventoryOwnership;
    query('[data-inventory="policy-label"]').textContent = sim.state.autoSellRarity ? `${rarityInfo(sim.state.autoSellRarity).label}以下` : 'OFF';
    app!.querySelectorAll<HTMLButtonElement>('[data-action="inventory-category"]').forEach(button => { const active = button.dataset.id === inventoryCategory; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
    query('[data-inventory="weapon-type-filter"]').hidden = inventoryCategory !== 'weapon';
    query('.inventory-filters').classList.toggle('part-filters', inventoryCategory !== 'weapon');
    const categoryItems: LootItem[] = inventoryCategory === 'weapon' ? sim.state.inventory : sim.state.parts.filter(item => item.slot === inventoryCategory);
    const normalizeSearch = (value: string) => value.normalize('NFKC').toLocaleLowerCase('ja-JP');
    const search = normalizeSearch(inventorySearch.trim());
    const filtered = categoryItems.filter(item => {
      const ownership = inventoryOwnership === 'all' || (inventoryOwnership === 'equipped' ? item.id === equippedItem(inventoryCategory).id : inventoryOwnership === 'protected' ? item.locked || item.starter : !protectedItem(item));
      const effects = isWeapon(item) ? item.affixes.map(getAffixText) : [...sim.getPartPreview(item).effects, ...item.affixes.map(getPartAffixText)];
      const searchable = normalizeSearch([item.name, itemBase(item).name, itemBase(item).description, rarityInfo(item.rarity).label, ...effects, ...sim.getLoadoutReferences(item.id)].join(' '));
      return ownership && (!search || searchable.includes(search)) && (inventoryFilter === 'all' || item.rarity === inventoryFilter) && (!isWeapon(item) || inventoryTypeFilter === 'all' || item.type === inventoryTypeFilter);
    });
    query<HTMLButtonElement>('.inventory-search-clear').hidden = !query<HTMLInputElement>('[data-inventory-control="search"]').value;
    const activeFilters = [search ? `検索「${inventorySearch.trim()}」` : '', inventoryFilter !== 'all' ? rarityInfo(inventoryFilter as WeaponRarity).label : '', inventoryCategory === 'weapon' && inventoryTypeFilter !== 'all' ? WEAPON_BASES[inventoryTypeFilter as keyof typeof WEAPON_BASES].name : '', inventoryOwnership !== 'all' ? ({ equipped: '装備中', protected: '保護・初期装備', sellable: '売却可能' }[inventoryOwnership] ?? '') : ''].filter(Boolean);
    const filterSummary = query('[data-inventory="active-filters"]');
    filterSummary.hidden = activeFilters.length === 0;
    filterSummary.innerHTML = activeFilters.length ? `<span title="${escapeHTML(activeFilters.join(' / '))}">絞り込み中 · ${filtered.length}件 <small>${activeFilters.map(escapeHTML).join(' / ')}</small></span><button data-action="reset-inventory-filters">解除</button>` : '';
    filtered.sort((a, b) => inventorySort === 'rarity' ? rarityInfo(b.rarity).rank - rarityInfo(a.rarity).rank || b.level - a.level : inventorySort === 'dps' ? itemMetric(b) - itemMetric(a) : inventorySort === 'level' ? b.level - a.level : b.acquiredAt - a.acquiredAt);
    if (!filtered.some(item => item.id === inventoryFocusId)) inventoryFocusId = filtered.find(item => item.id === selectedItemId)?.id ?? filtered[0]?.id ?? '';
    const pageCount = Math.max(1, Math.ceil(filtered.length / inventoryPageSize));
    inventoryPage = Math.min(inventoryPage, pageCount - 1);
    if (!categoryItems.some(item => item.id === selectedItemId)) selectedItemId = equippedItem(inventoryCategory).id;
    const focused = document.activeElement instanceof HTMLButtonElement && dialog.contains(document.activeElement) ? { action: document.activeElement.dataset.action, id: document.activeElement.dataset.id } : null;
    query('[data-inventory="list"]').innerHTML = filtered.length ? filtered.slice(inventoryPage * inventoryPageSize, (inventoryPage + 1) * inventoryPageSize).map(item => {
      const rarity = rarityInfo(item.rarity);
      const equipped = item.id === equippedItem(inventoryCategory).id;
      const protectedGear = Boolean(item.starter || item.locked);
      const status = [equipped ? '装備中' : '', protectedGear ? '保護中' : ''].filter(Boolean).join('、');
      const label = `${item.name}、${itemBase(item).name}、${rarity.label}、拾得Lv.${item.level}、強化+${enhancementLevel(item)}${status ? `、${status}` : ''}`;
      return `<button class="loot-card ${item.id === selectedItemId ? 'selected' : ''}" data-action="inspect-weapon" data-id="${escapeHTML(item.id)}" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}" tabindex="${item.id === inventoryFocusId ? 0 : -1}" aria-pressed="${item.id === selectedItemId}" style="--rarity-color:${cssColor(rarity.color)}"><span class="loot-tile-rarity" aria-hidden="true"></span><span class="loot-tile-art" aria-hidden="true">${gearArt(item)}</span><span class="loot-tile-level" aria-hidden="true">Lv.${item.level}</span><span class="loot-tile-enhancement" aria-hidden="true">+${enhancementLevel(item)}</span>${status ? `<span class="loot-tile-state" aria-hidden="true">${equipped ? '<svg class="loot-tile-equipped" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg>' : ''}${protectedGear ? icon('lock') : ''}</span>` : ''}</button>`;
    }).join('') : '<div class="inventory-empty"><p>この条件の装備はありません。</p><button data-action="reset-inventory-filters">絞り込みを解除</button></div>';
    query('[data-inventory="page"]').textContent = `${inventoryPage + 1} / ${pageCount} · ${filtered.length} 件`;
    query<HTMLButtonElement>('[data-action="inventory-prev"]').disabled = inventoryPage <= 0;
    query<HTMLButtonElement>('[data-action="inventory-next"]').disabled = inventoryPage >= pageCount - 1;
    const item = categoryItems.find(owned => owned.id === selectedItemId) ?? equippedItem(inventoryCategory);
    if (inspectScrollItemId !== item.id) { inspectScrollItemId = item.id; inspectScrollTop = 0; }
    detail.dataset.itemId = item.id;
    const rarity = rarityInfo(item.rarity);
    const equipped = item.id === equippedItem(inventoryCategory).id;
    const references = sim.getLoadoutReferences(item.id);
    const referenceMarkup = references.length ? `<div class="loadout-references">${icon('inventory')}<span>保存構成 ${references.length}件：${references.map(escapeHTML).join(' / ')}<small>一括整理・満杯時売却から保護</small></span></div>` : '';
    const delta = (value: number, baseline: number, unit = '%') => {
      const ratio = baseline > 0 ? (value / baseline - 1) * 100 : value;
      return `<small class="${ratio > .05 ? 'comparison-up' : ratio < -.05 ? 'comparison-down' : ''}">${equipped || Math.abs(ratio) < .05 ? '±0' + (baseline > 0 ? '%' : unit) : `${ratio > 0 ? '+' : ''}${precision(ratio)}${baseline > 0 ? '%' : unit}`}</small>`;
    };
    let performance = '';
    let fixedEffects = '';
    let affixes: string[];
    if (isWeapon(item)) {
      const preview = sim.getWeaponPreview(item);
      const current = sim.getWeaponPreview(sim.getEquippedWeapon());
      performance = `<div class="comparison-caption">装備中の武器と比較 <span>主弾・会心の目安</span></div><div class="weapon-comparison"><div><span>一発の威力</span><strong>${precision(preview.damage)}</strong><small class="comparison-baseline">現 ${precision(current.damage)}</small>${delta(preview.damage, current.damage)}</div><div><span>射撃 / 秒</span><strong>${precision(preview.fireRate)}</strong><small class="comparison-baseline">現 ${precision(current.fireRate)}</small>${delta(preview.fireRate, current.fireRate)}</div><div><span>期待 DPS</span><strong>${format(preview.dps)}</strong><small class="comparison-baseline">現 ${format(current.dps)}</small>${delta(preview.dps, current.dps)}</div></div><div class="critical-readout">会心率 ${precision(preview.critChance * 100)}% <span>会心威力 ×${precision(preview.critMultiplier)}</span></div>`;
      const mastery = sim.getMastery(item.type);
      fixedEffects = `<p class="part-fixed-effect">系統熟練 ${mastery.level} · 威力 +${Math.round(mastery.bonus * 100)}%</p>`;
      affixes = item.affixes.map(getAffixText);
    } else {
      const preview = sim.getPartPreview(item);
      const current = sim.getPartPreview(sim.getEquippedPart(item.slot));
      performance = `<div class="comparison-caption">装備中の${categoryLabel(item.slot)}と比較 <span>固有性能</span></div><div class="weapon-comparison part-comparison">${preview.stats.map(stat => { const currentStat = current.stats.find(value => value.label === stat.label); const baseline = currentStat?.value ?? 0; return `<div><span>${escapeHTML(stat.label)}</span><strong>${precision(stat.value)}<em>${escapeHTML(stat.unit)}</em></strong><small class="comparison-baseline">${currentStat ? `現 ${precision(baseline)} ${escapeHTML(stat.unit)}` : "現装備 —"}</small>${currentStat ? delta(stat.value, baseline, stat.unit) : '<small class="comparison-new">新規効果</small>'}</div>`; }).join('')}</div>`;
      fixedEffects = `<div class="part-fixed-effects">${preview.effects.map(effect => `<p class="part-fixed-effect">${escapeHTML(effect)}</p>`).join('')}</div>`;
      affixes = item.affixes.map(getPartAffixText);
    }
    const activeSynergies = sim.getSynergies().filter(synergy => showAllSynergies || synergy.active);
    const synergyText = activeSynergies.length ? activeSynergies.map(synergy => `<li class="${synergy.active ? 'active' : ''}"><b>${escapeHTML(synergy.name)} <small>${synergy.engaged ? '発動中' : synergy.active ? '相性成立・待機' : '相性のヒント'}</small></b><span>${escapeHTML(synergy.description)}</span><span>${escapeHTML(synergy.detail)}</span></li>`).join('') : '<li><span>会心・爆風・減速・シールド回復など、装備同士の効果を重ねよう。</span></li>';
    const sellProtection = equipped ? '装備中は売却不可' : item.starter ? '初期装備は売却不可' : item.locked ? '保護中は売却不可' : `${format(sellValue(item))} CR で売却`;
    const compactSell = equipped ? '装備中' : item.starter ? '初期装備' : item.locked ? '保護中' : `売却 ${format(sellValue(item))} CR`;
    const description = isWeapon(item) ? `<p class="weapon-description">${itemBase(item).description}</p>` : '';
    const refundMarkup = enhancementLevel(item) > 0 && !item.starter ? `<p class="part-fixed-effect">売却額には強化費の50%（${fee(getEnhancementRefund(item))} CR）を含みます。</p>` : '';
    query('[data-inventory="detail"]').innerHTML = `${enhancementActionMarkup(item)}<div class="inspect-scroll"><div class="inspect-header" style="--rarity-color:${cssColor(rarity.color)}"><div class="inspect-art">${gearArt(item)}<span></span></div><div><span class="rarity-label"><span class="rarity-mark" title="${rarity.label}" role="img" aria-label="${rarity.label}"></span>拾得Lv.${item.level} · 強化+${enhancementLevel(item)}</span><h3 title="${escapeHTML(item.name)}">${escapeHTML(item.name)}</h3><small>${itemBase(item).name}${item.starter ? ' · 初期装備' : ''}</small></div></div>${performance}${referenceMarkup}${matchedEnhancementMarkup(item)}${enhancementMarkup(item)}${refundMarkup}${description}${fixedEffects}<h4 class="affix-heading">ランダム副次効果 <span>${affixes.length} AFFIXES</span></h4><ul class="affix-list">${affixes.length ? affixes.map(affix => `<li>${escapeHTML(affix)}</li>`).join('') : '<li class="affix-none">副次効果なし。敵から装備を回収して更新しよう。</li>'}</ul><h4 class="affix-heading">現在の組み合わせ</h4><ul class="synergy-list">${synergyText}</ul><button class="synergy-details" data-action="synergy-details">相性のヒントを見る</button></div><div class="inspect-actions"><button class="equip-weapon" data-action="equip-weapon" data-id="${escapeHTML(item.id)}" ${equipped ? 'disabled' : ''}><span class="action-full">${equipped ? '装備中' : 'この装備を使う'}</span><span class="action-compact">${equipped ? '装備中' : '装備'}</span></button><button class="lock-weapon ${item.locked ? 'locked' : ''}" data-action="lock-weapon" data-id="${escapeHTML(item.id)}" aria-pressed="${item.locked}" ${item.starter ? 'disabled' : ''}>${icon('lock')}<span class="action-full">${item.locked ? '保護中' : '保護する'}</span><span class="action-compact">${item.locked ? '保護中' : '保護'}</span></button><button class="sell-weapon" data-action="sell-weapon" data-id="${escapeHTML(item.id)}" title="${sellProtection}" aria-label="${sellProtection}" ${protectedItem(item) ? 'disabled' : ''}><span class="action-full">${sellProtection}</span><span class="action-compact">${compactSell}</span></button></div>`;
    query<HTMLButtonElement>('.synergy-details').textContent = showAllSynergies ? '現在の組み合わせに戻る' : '相性のヒントを見る';
    const eligible = eligibleItems();
    const bulkButton = query<HTMLButtonElement>('[data-action="review-bulk"]');
    bulkButton.disabled = eligible.length === 0;
    bulkButton.title = sim.state.autoSellRarity === null ? '自動売却のレア度を設定すると、武器・機体パーツの対象を確認して整理できます' : eligible.length ? `全カテゴリーの売却対象 ${eligible.length} 件を確認` : '対象装備はありません。装備中・保護中・初期装備・保存構成の装備は残ります';
    const review = query('[data-inventory="bulk-review"]');
    review.hidden = !bulkReview;
    dialog.classList.toggle('bulk-review-active', bulkReview);
    if (bulkReview) review.innerHTML = `<div><b>${sim.state.autoSellRarity ? rarityInfo(sim.state.autoSellRarity).label : ''}以下 ${eligible.length} 件を売却</b><span>武器 ${eligible.filter(isWeapon).length} / 機体パーツ ${eligible.filter(item => !isWeapon(item)).length}<br>＋${format(eligible.reduce((sum, item) => sum + sellValue(item), 0))} CR<br>装備中・保護中・初期装備・保存構成は保管</span></div><button data-action="cancel-bulk">戻る</button><button class="confirm-bulk" data-action="confirm-bulk" ${eligible.length ? '' : 'disabled'}>確認して売却</button>`;
    const saleReview = query('[data-inventory="referenced-sale"]');
    const saleItem = pendingReferencedSale ? ownedItem(pendingReferencedSale) : undefined;
    saleReview.hidden = !saleItem;
    dialog.classList.toggle('referenced-sale-active', !!saleItem);
    if (saleItem) saleReview.innerHTML = `<section><span class="microtype">REFERENCED EQUIPMENT</span><h3>「${escapeHTML(saleItem.name)}」を売却します</h3><p>次の保存構成は欠品状態になり、呼び出せなくなります。</p><ul>${sim.getLoadoutReferences(saleItem.id).map(name => `<li>${escapeHTML(name)}</li>`).join('')}</ul><strong>＋${fee(sellValue(saleItem))} CR</strong><div><button data-action="cancel-referenced-sale">装備を残す</button><button class="confirm-referenced-sale" data-action="confirm-referenced-sale" data-id="${escapeHTML(saleItem.id)}" ${protectedItem(saleItem) ? 'disabled' : ''}>欠品になることを確認して売却</button></div></section>`;
    query<HTMLElement>('.inspect-scroll').scrollTop = inspectScrollTop;
    if (list.getClientRects().length) list.scrollTop = inventoryScrollTop;
    query('[data-inventory="summary"]').textContent = `武器 ${sim.state.inventory.length}/${INVENTORY_CAPACITY} · パーツ ${sim.state.parts.length}/${PART_CAPACITY} · 回収 ${sim.state.lootStats.found} · 売却 ${sim.state.lootStats.sold} 件 / ${format(sim.state.lootStats.soldCredits)} CR`;
    if (focused?.action) {
      const button = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-action]')).find(candidate => candidate.dataset.action === focused.action && candidate.dataset.id === focused.id);
      (canFocusButton(button) ? button : query<HTMLButtonElement>('.dialog-primary')).focus({ preventScroll: true });
    }
  }
  function toast(message: string, tone = 'info'): void {
    if (destroyed) return;
    if (toastTimer) clearTimeout(toastTimer);
    set('toast', message);
    toastElement.dataset.tone = tone;
    toastElement.hidden = false;
    toastTimer = setTimeout(() => { toastElement.hidden = true; }, 4000);
  }

  function closeDialog(): void {
    if (!dialog.open || resetPending) return;
    if (dialogType === 'inventory') {
      const search = query<HTMLInputElement>('[data-inventory-control="search"]').value;
      if (search !== inventorySearch) resetInventoryListPosition();
      inventorySearch = search;
      if (inventorySearchTimer) clearTimeout(inventorySearchTimer);
      inventorySearchTimer = undefined;
    }
    if (dialogType === 'records') recordsScroll[recordsTab] = query('[data-records="content"]').scrollTop;
    if (dialogType === 'records' && recordsTab === 'missions') {
      missionRosterScroll = query('.mission-roster').scrollTop;
      missionDetailScroll = query('.mission-detail').scrollTop;
    }
    if (dialogType === 'offline') sim.offlineReward = null;
    dialog.close();
    dialog.classList.remove('inventory-dialog', 'bulk-review-active', 'skill-dialog', 'inventory-settings-open', 'records-dialog', 'loadout-dialog', 'referenced-sale-active', 'progress-reset-dialog');
    bulkReview = false;
    pendingLoadout = null;
    pendingReferencedSale = null;
    sim.paused = pausedBeforeDialog;
    dialogType = '';
    focusBeforeDialog?.focus({ preventScroll: true });
    render();
  }

  function closeMobileDock(): void {
    if (!mobileDock.open) return;
    mobileDock.close();
    sim.paused = pausedBeforeDock;
    const returnTarget = focusBeforeDock?.getClientRects().length ? focusBeforeDock : query<HTMLElement>('[data-action="mobile-hangar"]');
    returnTarget.focus({ preventScroll: true });
    render();
  }

  function openMobileDock(): void {
    if (!mobileLayout.matches || dialog.open || mobileDock.open) return;
    pausedBeforeDock = sim.paused;
    focusBeforeDock = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sim.paused = true;
    mobileDock.showModal();
    query<HTMLButtonElement>('[data-action="close-mobile-hangar"]').focus({ preventScroll: true });
    render();
  }

  const adaptMobileLayout = (): void => {
    if (mobileLayout.matches) mobileDock.append(hangar);
    else {
      closeMobileDock();
      layout.insertBefore(hangar, query('.mobile-navigation'));
    }
    if (dialogType === 'records') { recordsSignature = ''; render(); }
  };
  const cancelMobileDock = (event: Event): void => { event.preventDefault(); closeMobileDock(); };
  const mobileDockBackdrop = (event: MouseEvent): void => {
    if (event.target !== mobileDock) return;
    const bounds = mobileDock.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeMobileDock();
  };

  function pwaSettingsMarkup(): string {
    return '<section class="pwa-settings"><h3>ホーム画面で遊ぶ</h3><p>アプリとして追加すると、ブラウザの枠を外して起動できます。</p><button class="pwa-install-button" data-action="install-pwa">追加方法を見る</button><p class="pwa-install-guide" data-pwa="guide" hidden></p><p class="pwa-offline-status" data-pwa="offline" role="status"></p><p class="pwa-update-status" data-pwa="update" hidden>更新を準備しました。ゲームをすべて閉じ、次に開いたときに反映します。</p></section>';
  }

  function renderPwaSettings(): void {
    if (dialogType !== 'settings') return;
    const state = getPwaState();
    const button = query<HTMLButtonElement>('[data-action="install-pwa"]');
    button.hidden = state.installed;
    button.textContent = state.canInstall ? 'ホーム画面にインストール' : 'ホーム画面への追加方法';
    query('[data-pwa="guide"]').textContent = state.installMethod === 'ios'
      ? '共有メニューから「ホーム画面に追加」を選び、「追加」を押してください。見つからない場合はSafariで開いてください。'
      : 'Chrome・Edgeなどのブラウザで開き、メニューから「アプリをインストール」または「ホーム画面に追加」を選んでください。';
    query('[data-pwa="offline"]').textContent = state.offlineStatus === 'ready'
      ? `${state.installed ? 'インストール済み · ' : ''}オフラインで起動できます。進捗はこの端末に保存します。`
      : state.offlineStatus === 'preparing'
        ? 'オフライン起動の準備中です。初回は通信したままお待ちください。'
        : 'オフライン起動の準備は未完了です。通信がある状態で再度開いてください。';
    query<HTMLElement>('[data-pwa="update"]').hidden = !state.updateReady;
  }

  function openDialog(kind: string): void {
    if (dialog.open) return;
    if (mobileDock.open) closeMobileDock();
    pausedBeforeDialog = sim.paused;
    focusBeforeDialog = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sim.paused = true;
    dialogType = kind;
    const body = query('.dialog-body');
    const actions = query('.dialog-actions');
    const title = query('#dialog-title');
    let eyebrow = '';
    let heading = '';
    let content = '';
    let buttons = '<button class="dialog-primary" data-action="close-dialog">飛行に戻る</button>';
    dialog.classList.toggle('inventory-dialog', kind === 'inventory');
    dialog.classList.toggle('skill-dialog', kind === 'skill-tree');
    dialog.classList.toggle('records-dialog', kind === 'records');
    dialog.classList.toggle('loadout-dialog', kind === 'synergies');
    dialog.classList.toggle('progress-reset-dialog', kind === 'reset-progress');
    if (kind === 'inventory') {
      eyebrow = 'ARSENAL / LOOT & LOADOUT'; heading = '装備倉庫';
      content = inventoryMarkup();
      buttons = '<span class="inventory-return-hint">戦闘は一時停止中</span><button class="dialog-primary" data-action="close-dialog">飛行に戻る</button>';
      inventorySignature = ''; inventoryExpanded = false;
    } else if (kind === 'records') {
      eyebrow = 'FLIGHT LOG / DISCOVERY & MISSIONS'; heading = '航行・収集・任務';
      content = recordsMarkup();
      recordsSignature = '';
      renderedRecordsTab = null;
    } else if (kind === 'skill-tree') {
      eyebrow = 'PERMANENT RESEARCH'; heading = '永続スキルツリー';
      content = skillTreeMarkup();
      buttons = '<button class="dialog-primary" data-action="close-dialog">飛行に戻る</button>';
      skillSignature = '';
    } else if (kind === 'synergies') {
      eyebrow = 'LOADOUT / BUILD SYNERGIES'; heading = '装備の組み合わせ';
      content = loadoutMarkup();
      loadoutSignature = '';
    } else if (kind === 'pause') {
      eyebrow = 'FLIGHT PAUSED'; heading = '少し、ひと休み。';
      content = '<p>戦闘は一時停止しています。ひと息ついて、好きなタイミングで続きをどうぞ。</p><p class="dialog-detail">進行状況はブラウザに自動保存されます。</p>';
    } else if (kind === 'help') {
      eyebrow = 'PILOT MANUAL'; heading = '気軽に、深い宇宙へ。';
      content = '<p>機体は自動で射撃。敵を倒して集めた装備を回収・交換し、さらに奥の WAVE を目指しましょう。</p><div class="manual-row"><span>自動操縦</span><p>ON なら移動も自動。眺めながら強化を選ぶだけでも遊べます。</p></div><div class="manual-row"><span>移動</span><p><kbd>W A S D</kbd> / 矢印キー<br>画面のドラッグでも操縦できます。自動操縦中も、操作している間は手動移動を優先します。</p></div><div class="manual-row"><span>必殺技</span><p><kbd>SPACE</kbd> / オーバードライブボタン<br>短時間の火力アップで一気に突破。</p></div><div class="manual-row"><span>メニュー</span><p><kbd>I</kbd> 装備倉庫 / <kbd>M</kbd> 任務 / <kbd>P</kbd> 一時停止<br><kbd>ESC</kbd> で閉じて飛行に戻ります。</p></div><div class="manual-row"><span>装備回収</span><p>敵から武器・ウイング・ボディ・ドローンと副次効果を回収。「装備倉庫」で性能を比べ、好きな装備で機体と戦い方を組み立てられます。保護した装備は売却対象から外れます。取得時の自動売却は最初から設定可能です。</p></div><div class="manual-row"><span>レア度の色</span><p>灰：コモン / 緑：アンコモン / 青：レア / 紫：エピック / 金：レジェンダリー。装備の枠と光の色で見分けられます。</p></div><div class="manual-row"><span>長く楽しむ</span><p>5 WAVE ごとにボス。先の宙域ほど多彩な武器が出現し、WAVE 15 からCRで永続スキルを研究できます。装備中の4部位は倉庫で+10まで強化できます。手持ちCR・装備強化・永続スキル・熟練度は再出撃後も保管されます。</p></div><p class="dialog-detail">離席中も資源を回収します（上限8時間）。保存はこのブラウザ内です。</p>';
    } else if (kind === 'settings') {
      eyebrow = 'SYSTEM PREFERENCES'; heading = '自分のペースで。';
      content = `<label class="setting-row"><span><b>サウンド</b><small>射撃・撃破・報酬の効果音</small></span><input type="checkbox" data-setting="sound" ${sim.state.sound ? 'checked' : ''}><span class="setting-switch" aria-hidden="true"></span></label><label class="setting-row"><span><b>エフェクト</b><small>画面の揺れ・発光・パーティクル</small></span><input type="checkbox" data-setting="effects" ${sim.state.effects ? 'checked' : ''}><span class="setting-switch" aria-hidden="true"></span></label><p class="dialog-detail">設定は次回の出撃にも引き継がれます。</p>${pwaSettingsMarkup()}${options.onResetProgress ? '<section class="progress-reset-setting"><h3>進捗のリセット</h3><p>装備・育成・記録を初期化し、最初から遊び直します。</p><button class="progress-reset-trigger" data-action="request-reset-progress">リセット内容を確認</button></section>' : ''}`;
    } else if (kind === 'reset-progress') {
      resetPending = false;
      eyebrow = 'START A NEW FLIGHT'; heading = '進捗をリセット';
      content = `<p>WAVE 1・初期装備・90 CRから始め直します。現在の進捗はゲーム内で元に戻せません。</p><dl class="progress-reset-details"><div><dt>初期化する内容</dt><dd>クレジット、全装備と強化、補助調整、永続研究、熟練度、最高記録、収集記録、任務、保存構成、自動売却設定</dd></div><div><dt>引き継ぐ設定</dt><dd>サウンド・エフェクト</dd></div></dl><label class="progress-reset-confirm"><span>確認のため「リセット」と入力</span><input type="text" data-reset-confirm aria-label="リセットの確認入力" autocomplete="off" spellcheck="false" placeholder="リセット"></label><p class="progress-reset-feedback" role="status" aria-live="polite"></p>`;
      buttons = '<button class="dialog-secondary" data-action="cancel-reset-progress">設定に戻る</button><button class="dialog-primary progress-reset-confirm-button" data-action="confirm-reset-progress" disabled>進捗をリセットして開始</button>';
    } else if (kind === 'prestige') {
      eyebrow = 'RELAUNCH PROTOCOL'; heading = '次の旅を、もっと強く。';
      content = `<p>今回の到達記録から <strong class="amber-text">＋${format(sim.getPrestigeReward())} CR</strong>を獲得して再出撃します。装備強化と永続スキルで、次の出撃をもっと強く。</p><div class="reset-summary"><div><span>リセット</span><p>現在の WAVE・補助調整</p></div><div><span>引き継ぎ</span><p>手持ちCR・装備と強化レベル・永続スキル・倉庫と保護・自動売却設定・熟練度・最高記録</p></div></div>`;
      buttons = '<button class="dialog-secondary" data-action="close-dialog">続けて飛ぶ</button><button class="dialog-primary" data-action="confirm-prestige">CRを獲得して再出撃</button>';
    } else if (kind === 'offline') {
      eyebrow = 'SALVAGE REPORT'; heading = 'おかえりなさい、パイロット。';
      const reward = sim.offlineReward;
      content = `<p>離席中もサルベージ部隊が活動していました。</p><div class="offline-amount"><span class="microtype">${duration(reward?.seconds ?? 0)}の回収成果</span><strong>＋${format(reward?.credits ?? 0)}<small>CR</small></strong></div><p class="dialog-detail">クレジットは機体に反映済みです。</p>`;
      buttons = '<button class="dialog-primary" data-action="close-dialog">飛行を再開する</button>';
    }
    set('dialog-eyebrow', eyebrow);
    title.textContent = heading;
    body.innerHTML = content;
    actions.innerHTML = buttons;
    dialog.showModal();
    if (kind === 'reset-progress') query<HTMLInputElement>('[data-reset-confirm]').focus({ preventScroll: true }); else query<HTMLElement>('#dialog-title').focus({ preventScroll: true });
    render();
  }

  function selectTab(id: string): void {
    for (const name of ['upgrades', 'weapons', 'research']) {
      const tab = query<HTMLButtonElement>(`#tab-${name}`);
      const active = id === name;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      query<HTMLElement>(`#panel-${name}`).hidden = !active;
    }
    render();
  }

  function selectInventoryCategory(category: InventoryCategory): void {
    inventoryExpanded = false;
    inventoryCategory = category;
    selectedItemId = equippedItem(category).id;
    resetInventoryListPosition();
    bulkReview = false;
    pendingReferencedSale = null;
    showAllSynergies = false;
  }

  function openMissions(): void {
    const missions = sim.getMissions();
    selectedMissionId = (missions.find(mission => mission.ready) ?? missions.find(mission => mission.active))?.id ?? selectedMissionId;
    recordsTab = 'missions';
    missionExpanded = true;
    openDialog('records');
  }

  function resetFailed(): void {
    resetPending = false;
    query<HTMLInputElement>('[data-reset-confirm]').disabled = false;
    const submit = query<HTMLButtonElement>('[data-action="confirm-reset-progress"]');
    submit.disabled = query<HTMLInputElement>('[data-reset-confirm]').value.trim() !== 'リセット';
    submit.textContent = '進捗をリセットして開始';
    query<HTMLButtonElement>('[data-action="cancel-reset-progress"]').disabled = false;
    query('.progress-reset-feedback').textContent = '保存できなかったため、リセットを実行できませんでした。現在の進捗は保持されています。';
  }

  const ownedItem = (id: string): LootItem | undefined => sim.state.inventory.find(item => item.id === id) ?? sim.state.parts.find(item => item.id === id);

  const click = (event: MouseEvent): void => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-action]');
    if (!button || button.disabled) return;
    const { action, id } = button.dataset;
    if (action === 'mobile-hangar') { openMobileDock(); return; }
    if (action === 'close-mobile-hangar') { closeMobileDock(); return; }
    if (action === 'install-pwa') {
      query<HTMLElement>('[data-pwa="guide"]').hidden = false;
      button.disabled = true;
      void installPwa().finally(() => { if (!destroyed && dialogType === 'settings') { button.disabled = false; renderPwaSettings(); } });
      return;
    }
    if (action === 'request-reset-progress') { closeDialog(); openDialog('reset-progress'); return; }
    if (action === 'cancel-reset-progress' && !resetPending) { closeDialog(); openDialog('settings'); return; }
    if (action === 'confirm-reset-progress') {
      const field = query<HTMLInputElement>('[data-reset-confirm]');
      if (dialogType !== 'reset-progress' || resetPending || field.value.trim() !== 'リセット' || !options.onResetProgress) return;
      resetPending = true;
      button.disabled = true; button.textContent = '初期化しています';
      field.disabled = true;
      query<HTMLButtonElement>('[data-action="cancel-reset-progress"]').disabled = true;
      query('.progress-reset-feedback').textContent = '';
      void Promise.resolve().then(() => options.onResetProgress!()).then(success => {
        if (destroyed) return;
        if (success) { closeDialog(); return; }
        resetFailed();
      }).catch(() => { if (!destroyed) resetFailed(); });
      return;
    }
    if (action === 'tab') selectTab(id!);
    if (action === 'help' || action === 'settings' || action === 'pause' || action === 'inventory' || action === 'synergies' || action === 'skill-tree' || action === 'records') openDialog(action);
    if (action === 'missions') openMissions();
    if (action === 'records-tab') { missionExpanded = false; selectRecordsTab(id as RecordsTab); }
    if (action === 'mission-list') { missionExpanded = false; render(); query<HTMLButtonElement>(`[data-action="inspect-mission"][data-id="${selectedMissionId}"]`).focus({ preventScroll: true }); return; }
    if (action === 'inspect-mission') {
      selectedMissionId = id as MissionId;
      missionExpanded = true;
      missionDetailScroll = 0;
      query('.mission-detail').scrollTop = 0;
    }
    if (action === 'accept-mission') {
      if (sim.acceptMission(id as MissionId)) toast(`「${sim.getMissions().find(mission => mission.id === id)!.name}」を受注しました。前の任務の進捗も保管されています`);
    }
    if (action === 'claim-mission') {
      const issue = sim.getMissionClaimIssue(id as MissionId, requisitionModel);
      if (issue) toast(issue, 'warning');
      else {
        const before = new Set([...sim.state.inventory, ...sim.state.parts].map(item => item.id));
        if (sim.claimMission(id as MissionId, requisitionModel)) {
          const item = [...sim.state.inventory, ...sim.state.parts].find(candidate => !before.has(candidate.id));
          if (item) {
            missionReceipt = { missionId: id as MissionId, item };
            toast(`「${item.name}」を保護状態で倉庫に保管しました`, 'loot');
          }
        } else toast(sim.getMissionClaimIssue(id as MissionId, requisitionModel) ?? '報酬を受領できませんでした。進捗は保管されています', 'warning');
      }
    }
    if (action === 'operation') {
      if (sim.setOperation(id as OperationId)) toast(`次の戦闘開始から「${sim.getOperation().name}」を適用します`);
    }
    if (action === 'loadout-tab') { loadoutTab = id as 'presets' | 'synergies'; pendingLoadout = null; query('[data-loadout="content"]').scrollTop = 0; }
    if (action === 'save-loadout') {
      const slot = id as LoadoutSlot;
      const summary = sim.getLoadouts().find(item => item.slot === slot)!;
      const name = query<HTMLInputElement>(`[data-loadout-name="${slot}"]`).value.trim() || summary.label;
      loadoutDraftNames[slot] = name;
      if (summary.preset) pendingLoadout = { slot, kind: 'save', name };
      else if (sim.saveLoadout(slot, name)) { delete loadoutDraftNames[slot]; toast(`「${name}」に現在の装備を保存しました`); }
    }
    if (action === 'delete-loadout') pendingLoadout = { slot: id as LoadoutSlot, kind: 'delete' };
    if (action === 'cancel-loadout-review') pendingLoadout = null;
    if (action === 'confirm-loadout-review' && pendingLoadout) {
      const pending = pendingLoadout;
      const name = sim.getLoadouts().find(item => item.slot === pending.slot)?.preset?.name;
      if (pending.kind === 'save' ? sim.saveLoadout(pending.slot, pending.name) : sim.deleteLoadout(pending.slot)) {
        delete loadoutDraftNames[pending.slot];
        toast(pending.kind === 'save' ? `「${pending.name}」を現在の装備で上書きしました` : `保存構成「${name}」を削除しました`);
      }
      pendingLoadout = null;
    }
    if (action === 'equip-loadout') {
      const name = sim.getLoadouts().find(item => item.slot === id)?.preset?.name;
      if (sim.equipLoadout(id as LoadoutSlot)) toast(`「${name}」を呼び出しました`, 'power');
    }
    if (action === 'open-research-branch') { skillBranch = id as SkillBranch; openDialog('skill-tree'); }
    if (action === 'skill-branch') skillBranch = id as SkillBranch;
    if (action === 'learn-skill' && sim.learnSkill(id as SkillId)) toast(`${SKILL_NODES.find(node => node.id === id)?.name}を習得しました。再出撃後も有効です`, 'power');
    if (action === 'open-slot') { selectInventoryCategory(id as InventoryCategory); openDialog('inventory'); }
    if (action === 'inventory-category') selectInventoryCategory(id as InventoryCategory);
    if (action === 'close-inventory-tools') query<HTMLDetailsElement>('.inventory-tools').open = false;
    if (action === 'clear-inventory-search') {
      if (inventorySearchTimer) clearTimeout(inventorySearchTimer);
      inventorySearchTimer = undefined;
      inventorySearch = ''; resetInventoryListPosition(); inventoryExpanded = false;
      query<HTMLInputElement>('[data-inventory-control="search"]').value = '';
    }
    if (action === 'reset-inventory-filters') {
      inventoryFilter = inventoryTypeFilter = inventoryOwnership = 'all'; inventorySearch = ''; resetInventoryListPosition(); inventoryExpanded = false;
      if (inventorySearchTimer) clearTimeout(inventorySearchTimer);
      inventorySearchTimer = undefined;
      query<HTMLInputElement>('[data-inventory-control="search"]').value = '';
    }
    if (action === 'synergy-details') showAllSynergies = !showAllSynergies;
    if (action === 'close-dialog') closeDialog();
    if (action === 'autopilot') { sim.toggleAutopilot(); toast(sim.state.autopilot ? '自動操縦を開始しました' : '手動操縦に切り替えました'); }
    if (action === 'overdrive') { if (sim.activateOverdrive() !== false) toast('オーバードライブ発動！', 'power'); }
    if (action === 'upgrade' && sim.buyUpgrade(id as UpgradeId) !== false) toast(`${upgrades.find(item => item.id === id)?.name}を強化しました`);
    if (action === 'enhance-equipment' && sim.enhanceEquipment(id!)) toast(`${ownedItem(id!)?.name}を +${enhancementLevel(ownedItem(id!)!)} に強化しました`, 'power');
    if (action === 'inspect-weapon') { selectedItemId = inventoryFocusId = id!; bulkReview = false; inventoryExpanded = true; }
    if (action === 'inventory-view') inventoryExpanded = !inventoryExpanded;
    if (action === 'inventory-prev') inventoryPage = Math.max(0, inventoryPage - 1);
    if (action === 'inventory-next') inventoryPage += 1;
    if (action === 'equip-weapon') { const item = ownedItem(id!); if (item && (isWeapon(item) ? sim.equipWeapon(id!) : sim.equipPart(id!))) toast(`${item.name}を装備しました`, 'power'); }
    if (action === 'lock-weapon') { const item = ownedItem(id!); if (item && (isWeapon(item) ? sim.toggleWeaponLock(id!) : sim.togglePartLock(id!))) toast(item.locked ? '装備を保護しました。売却対象から外れます' : '装備の保護を解除しました'); }
    if (action === 'sell-weapon') {
      const item = ownedItem(id!);
      if (item && sim.getLoadoutReferences(item.id).length) pendingReferencedSale = item.id;
      else { const sold = item ? isWeapon(item) ? sim.sellWeapon(id!) : sim.sellPart(id!) : 0; if (sold > 0) toast(`装備を売却 · ＋${format(sold)} CR`); }
    }
    if (action === 'cancel-referenced-sale') pendingReferencedSale = null;
    if (action === 'confirm-referenced-sale' && pendingReferencedSale) {
      const item = ownedItem(pendingReferencedSale);
      const sold = item ? isWeapon(item) ? sim.sellWeapon(item.id) : sim.sellPart(item.id) : 0;
      if (sold > 0) toast(`装備を売却 · ＋${fee(sold)} CR。保存構成は欠品状態です`);
      pendingReferencedSale = null;
    }
    if (action === 'review-bulk') bulkReview = true;
    if (action === 'cancel-bulk') bulkReview = false;
    if (action === 'confirm-bulk') { const sold = sim.sellEligibleWeapons(); bulkReview = false; toast(`${sold.count} 件を売却 · ＋${format(sold.credits)} CR`); }
    if (action === 'module' && sim.setModule(id as ModuleId) !== false) toast(`${moduleUI[id as ModuleId].name}モジュールに換装しました`);
    if (action === 'prestige' && sim.getPrestigeReward() > 0) openDialog('prestige');
    if (action === 'confirm-prestige') { closeDialog(); if (sim.prestige() !== false) toast('再出撃しました。装備強化とスキルで、さらに先へ。', 'power'); }
    render();
    if (action === 'clear-inventory-search' || action === 'reset-inventory-filters') query<HTMLInputElement>('[data-inventory-control="search"]').focus({ preventScroll: true });
    if (action === 'inspect-weapon' && canFocusButton(query<HTMLButtonElement>('.inventory-pane-switch'))) query<HTMLButtonElement>('.inventory-pane-switch').focus({ preventScroll: true });
    if (action === 'inventory-view' && !inventoryExpanded) {
      const card = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-action="inspect-weapon"]')).find(candidate => candidate.dataset.id === selectedItemId);
      card?.focus({ preventScroll: true });
    }
    if (action === 'inspect-mission' && canFocusButton(query<HTMLButtonElement>('.mission-pane-switch'))) query<HTMLButtonElement>('.mission-pane-switch').focus({ preventScroll: true });
    if ((action === 'save-loadout' || action === 'delete-loadout') && pendingLoadout) query<HTMLButtonElement>('[data-action="confirm-loadout-review"]').focus({ preventScroll: true });
    if (action === 'sell-weapon' && pendingReferencedSale) query<HTMLButtonElement>('[data-action="confirm-referenced-sale"]').focus({ preventScroll: true });
    if (action === 'cancel-referenced-sale' || action === 'confirm-referenced-sale') {
      const selectedCard = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-action="inspect-weapon"]')).find(candidate => candidate.dataset.id === selectedItemId);
      const sellButton = query<HTMLButtonElement>('[data-action="sell-weapon"]');
      const target = action === 'cancel-referenced-sale' && canFocusButton(sellButton) ? sellButton : canFocusButton(selectedCard) ? selectedCard : query<HTMLButtonElement>('.dialog-primary');
      target.focus({ preventScroll: true });
    }
    if (action === 'synergy-details') {
      const readingArea = query<HTMLElement>('.inspect-scroll');
      const list = query<HTMLElement>('.synergy-list');
      const target = (showAllSynergies ? list.querySelector<HTMLElement>('li:not(.active)') : null) ?? list.previousElementSibling as HTMLElement;
      readingArea.scrollTop += target.getBoundingClientRect().top - readingArea.getBoundingClientRect().top - 6;
      inspectScrollTop = readingArea.scrollTop;
    }
    if (action === 'claim-mission' && missionReceipt?.missionId === id) {
      const receipt = dialog.querySelector<HTMLElement>('.mission-receipt');
      const detail = dialog.querySelector<HTMLElement>('.mission-detail');
      if (receipt && detail) {
        const overlap = receipt.getBoundingClientRect().bottom - detail.getBoundingClientRect().bottom;
        if (overlap > 0) detail.scrollTop += overlap + 8;
      }
    }
    if (action === 'review-bulk') query<HTMLButtonElement>('[data-action="confirm-bulk"]').focus({ preventScroll: true });
    if (action === 'cancel-bulk' || action === 'confirm-bulk') {
      const reviewButton = query<HTMLButtonElement>('[data-action="review-bulk"]');
      (reviewButton.disabled ? query<HTMLButtonElement>('.dialog-primary') : reviewButton).focus({ preventScroll: true });
    }
  };
  const change = (event: Event): void => {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    if (input.dataset.missionControl === 'reward-model' && isRequisitionModel(input.value)) requisitionModel = input.value;
    if (input.dataset.inventoryControl === 'auto-sell') { sim.setAutoSellRarity(input.value === 'off' ? null : input.value as WeaponRarity); bulkReview = false; toast(input.value === 'off' ? 'レア度による自動売却を OFF にしました' : `${rarityInfo(input.value as WeaponRarity).label}以下の取得装備を自動売却します`); }
    if (input.dataset.inventoryControl === 'rarity') { inventoryFilter = input.value; resetInventoryListPosition(); }
    if (input.dataset.inventoryControl === 'type') { inventoryTypeFilter = input.value; resetInventoryListPosition(); }
    if (['rarity', 'type', 'sort', 'ownership'].includes(input.dataset.inventoryControl ?? '')) inventoryExpanded = false;
    if (input.dataset.inventoryControl === 'sort') { inventorySort = input.value; resetInventoryListPosition(); }
    if (input.dataset.inventoryControl === 'ownership') { inventoryOwnership = input.value; resetInventoryListPosition(); }
    if (input.dataset.setting === 'module' && sim.setModule(input.value as ModuleId)) toast(`${moduleUI[input.value as ModuleId].name}モジュールに換装しました`);
    if (input instanceof HTMLInputElement && input.dataset.setting === 'sound') sim.state.sound = input.checked;
    if (input instanceof HTMLInputElement && input.dataset.setting === 'effects') sim.state.effects = input.checked;
    render();
  };
  const input = (event: Event): void => {
    const field = event.target as HTMLInputElement;
    if (field.hasAttribute('data-reset-confirm')) {
      query<HTMLButtonElement>('[data-action="confirm-reset-progress"]').disabled = resetPending || (event as InputEvent).isComposing || field.value.trim() !== 'リセット';
      return;
    }
    if (field.dataset.loadoutName) { loadoutDraftNames[field.dataset.loadoutName as LoadoutSlot] = field.value; return; }
    if (field.dataset.inventoryControl !== 'search' || (event as InputEvent).isComposing) return;
    if (inventorySearchTimer) clearTimeout(inventorySearchTimer);
    query<HTMLButtonElement>('.inventory-search-clear').hidden = !field.value;
    const search = field.value;
    inventorySearchTimer = setTimeout(() => { inventorySearch = search; resetInventoryListPosition(); inventoryExpanded = false; render(); }, 160);
  };
  const toggleTools = (event: Event): void => {
    if (!(event.target instanceof HTMLDetailsElement) || !event.target.classList.contains('inventory-tools')) return;
    dialog.classList.toggle('inventory-settings-open', event.target.open);
    sizeInventoryTools();
  };
  const compositionEnd = (event: CompositionEvent): void => {
    const field = event.target;
    if (field instanceof HTMLInputElement && field.hasAttribute('data-reset-confirm')) {
      query<HTMLButtonElement>('[data-action="confirm-reset-progress"]').disabled = resetPending || field.value.trim() !== 'リセット';
    }
  };
  function sizeInventoryTools(): void {
    if (dialogType !== 'inventory') return;
    const tools = query<HTMLDetailsElement>('.inventory-tools');
    if (!tools.open) return;
    const content = query('.inventory-tools-content');
    const height = query('.inventory-tools-row').clientHeight - query('.inventory-tools > summary').getBoundingClientRect().height - 2;
    content.style.maxHeight = `${Math.max(70, height)}px`;
  }
  const keyboard = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    if (event.key === 'Escape' && dialog.open) { event.preventDefault(); closeDialog(); return; }
    if (event.key === 'Escape' && mobileDock.open) { event.preventDefault(); closeMobileDock(); return; }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
    if (!dialog.open && !event.ctrlKey && !event.metaKey && !event.altKey && ['i', 'm'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      if (event.key.toLowerCase() === 'i') openDialog('inventory'); else openMissions();
      return;
    }
    if (event.key.toLowerCase() === 'p' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (dialog.open && dialogType === 'pause') closeDialog();
      else if (!dialog.open) openDialog('pause');
    }
    const target = event.target as HTMLElement;
    if (target.dataset.action === 'inspect-weapon' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      const cards = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-action="inspect-weapon"]')).filter(card => card.getClientRects().length);
      const current = cards.indexOf(target as HTMLButtonElement);
      if (current < 0 || !cards.length) return;
      event.preventDefault();
      const columns = cards.filter(card => Math.abs(card.offsetTop - cards[0].offsetTop) < 1).length || 1;
      const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key];
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : Math.max(0, Math.min(cards.length - 1, current + (offset ?? 0)));
      inventoryFocusId = cards[next].dataset.id!;
      cards.forEach((card, index) => { card.tabIndex = index === next ? 0 : -1; });
      cards[next].focus({ preventScroll: true });
      cards[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return;
    }
    if (target.getAttribute('role') === 'tab' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (target.dataset.action === 'records-tab') {
        const tabs = recordTabs.map(tab => tab.id);
        const current = tabs.indexOf(recordsTab);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
        selectRecordsTab(tabs[next]);
        render();
        query<HTMLButtonElement>(`[data-action="records-tab"][data-id="${recordsTab}"]`).focus();
        return;
      }
      if (target.dataset.action === 'loadout-tab') {
        loadoutTab = event.key === 'Home' ? 'presets' : event.key === 'End' ? 'synergies' : loadoutTab === 'presets' ? 'synergies' : 'presets';
        pendingLoadout = null;
        query('[data-loadout="content"]').scrollTop = 0;
        render();
        query<HTMLButtonElement>(`[data-action="loadout-tab"][data-id="${loadoutTab}"]`).focus();
        return;
      }
      if (target.dataset.action === 'skill-branch') {
        const branches = SKILL_BRANCHES.map(branch => branch.id);
        const current = branches.indexOf(target.dataset.id as SkillBranch);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? branches.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : branches.length - 1)) % branches.length;
        skillBranch = branches[next];
        render();
        query<HTMLButtonElement>(`[data-action="skill-branch"][data-id="${skillBranch}"]`).focus();
        return;
      }
      if (target.dataset.action === 'inventory-category') {
        const categories: InventoryCategory[] = ['weapon', 'wing', 'body', 'drone'];
        const current = categories.indexOf(target.dataset.id as InventoryCategory);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (current + (event.key === 'ArrowRight' ? 1 : 3)) % 4;
        selectInventoryCategory(categories[next]);
        render();
        query<HTMLButtonElement>(`[data-action="inventory-category"][data-id="${categories[next]}"]`).focus();
        return;
      }
      const names = ['weapons', 'upgrades', 'research'];
      const current = names.indexOf(target.dataset.id!);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (current + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
      selectTab(names[next]);
      query<HTMLButtonElement>(`#tab-${names[next]}`).focus();
    }
  };
  const cancel = (event: Event): void => { event.preventDefault(); closeDialog(); };
  const backdrop = (event: MouseEvent): void => { if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDialog(); } };
  app.addEventListener('click', click);
  app.addEventListener('change', change);
  app.addEventListener('input', input);
  app.addEventListener('compositionend', compositionEnd);
  app.addEventListener('toggle', toggleTools, true);
  window.addEventListener('resize', sizeInventoryTools);
  document.addEventListener('keydown', keyboard);
  dialog.addEventListener('cancel', cancel);
  dialog.addEventListener('click', backdrop);

  function render(): void {
    if (destroyed) return;
    const state = sim.state;
    const stats = sim.getStats();
    set('credits', format(state.credits));
    set('mobile-credits', format(state.credits));
    set('mobile-dps', format(stats.dps));
    set('mobile-loot-count', `${state.inventory.length + state.parts.length}`);
    renderPwaSettings();
    set('wave', state.wave.toString().padStart(2, '0'));
    set('best-wave', state.bestWave.toString().padStart(2, '0'));
    const currentSector = getSector(state.wave);
    set('wave-name', `${currentSector.name}${state.wave % 5 === 0 ? ' / 旗艦' : ''}`);
    set('sector', `SECTOR ${(SECTORS.findIndex(sector => sector.id === currentSector.id) + 1).toString().padStart(2, '0')}`);
    set('ship-mark', (1 + Math.floor(Object.values(state.upgrades).reduce((sum, n) => sum + n, 0) / 5)).toString().padStart(2, '0'));
    const activeModule = MODULES.find(item => item.id === state.module)!;
    set('module-name', moduleUI[state.module].name);
    query('.hangar').style.setProperty('--active-module-color', cssColor(activeModule.color));
    query('.active-module').title = activeModule.description;
    set('dps', format(stats.dps));
    set('max-hp', format(stats.maxHp));
    set('weapon-name', { pulse: 'パルス', spread: '拡散', lance: '貫通', missile: 'ミサイル', arc: 'アーク', orbit: 'オービット' }[state.weapon]);
    set('drone-count', `${stats.droneCount} 機`);
    set('offline-rate', `離席回収 ${format(stats.offlineRate * 60)} CR / 分`);
    set('total-kills', format(state.totalKills));
    set('runs', (state.runs + 1).toString().padStart(2, '0'));
    set('shield-number', `${Math.max(0, Math.ceil(sim.player.hp))} / ${Math.ceil(stats.maxHp)}`);
    query('.shield-hud').title = `自然再生 ${precision(stats.regen)} HP/秒 · 吸収の上限 ${precision(stats.leechCapPerSecond)} HP/秒`;
    bar('shield-bar', sim.player.hp / stats.maxHp);
    query('.shield-hud').classList.toggle('danger', sim.player.hp < stats.maxHp * .25);
    bar('wave-progress-bar', sim.waveKills / Math.max(1, sim.waveTarget));
    const boss = sim.enemies.find(enemy => enemy.kind === 'boss');
    query<HTMLElement>('.boss-hud').hidden = !boss;
    if (boss) { set('boss-hp', `${Math.ceil(boss.hp)} / ${Math.ceil(boss.maxHp)}`); bar('boss-health-bar', boss.hp / boss.maxHp); }
    const autoButton = query<HTMLButtonElement>('[data-action="autopilot"]');
    autoButton.setAttribute('aria-pressed', String(state.autopilot));
    set('auto-label', `自動操縦 ${state.autopilot ? 'ON' : 'OFF'}`);
    set('flight-mode', state.autopilot ? 'AUTO PILOT' : 'MANUAL PILOT');
    autoButton.title = state.autopilot ? '移動も射撃も自動。WASD・矢印・ドラッグで手動操作' : '射撃は自動。WASD・矢印・ドラッグで移動';
    const overdrive = query<HTMLButtonElement>('[data-action="overdrive"]');
    const ready = sim.overdriveCooldown <= 0 && sim.overdriveLeft <= 0;
    overdrive.disabled = sim.paused || !ready || sim.status !== 'fighting';
    overdrive.classList.toggle('active', sim.overdriveLeft > 0);
    set('overdrive-status', sim.overdriveLeft > 0 ? `発動中 · ${Math.ceil(sim.overdriveLeft)}秒` : ready ? '必殺技、準備完了' : `充填中 · あと ${Math.ceil(sim.overdriveCooldown)}秒`);
    bar('overdrive-bar', ready ? 1 : sim.overdriveLeft > 0 ? sim.overdriveLeft / sim.getOverdriveDuration() : 1 - sim.overdriveCooldown / stats.cooldownSeconds);
    const notice = query<HTMLElement>('.field-notice');
    notice.hidden = !(sim.status === 'recovering' || (sim.paused && !dialog.open && !mobileDock.open));
    if (sim.status === 'recovering') { set('notice-label', 'REPAIRING SHIP'); set('notice-text', `修復中 · あと ${Math.ceil(sim.recoveryLeft)}秒`); }
    else if (sim.paused) { set('notice-label', 'FLIGHT PAUSED'); set('notice-text', '一時停止中'); }
    set('flight-state', sim.paused ? 'FLIGHT PAUSED' : sim.status === 'recovering' ? 'REPAIRING SYSTEM' : sim.overdriveLeft > 0 ? 'OVERDRIVE ACTIVE' : 'SYSTEM ONLINE');
    query('.flight-topline').classList.toggle('paused', sim.paused);
    query('#cockpit').classList.toggle('effects-reduced', !state.effects);
    let goal = 3;
    let objective = 'WAVE 03 突破で、強襲型モジュールを解放';
    if (state.bestWave >= 3) { goal = 5; objective = 'WAVE 05 突破で、新しい武器が回収候補に'; }
    if (state.bestWave >= 5) { goal = 10; objective = '敵を倒して武器を回収。WAVE 10 で貫通系統が追加'; }
    if (state.bestWave >= 5 && state.bestWave < 6) { goal = 6; objective = 'WAVE 06 突破で、防衛型モジュールを解放'; }
    if (state.bestWave >= 6 && state.bestWave < 8) { goal = 8; objective = 'WAVE 08 突破で、回収型モジュールを解放'; }
    if (state.bestWave >= 10) { goal = 15; objective = 'WAVE 15 突破で、研究と再出撃を解放'; }
    if (state.bestWave >= 15) { goal = Math.ceil(state.wave / 5) * 5; objective = state.wave === goal ? `WAVE ${goal.toString().padStart(2, '0')} ボス戦。必殺技で突破しよう。` : `次のボスは WAVE ${goal.toString().padStart(2, '0')}。さらに先へ。`; }
    const missionList = sim.getMissions();
    const activeMission = missionList.find(mission => mission.active);
    const readyMission = missionList.find(mission => mission.ready);
    const shortcutMission = readyMission ?? activeMission;
    set('objective', shortcutMission ? `${shortcutMission.name} R${shortcutMission.rank} · ${format(shortcutMission.progress)} / ${format(shortcutMission.target)}` : '任務を選ぶ → 特注装備を獲得');
    set('mission-badge', readyMission ? '報酬待ち' : activeMission ? '受注中' : '任務');
    set('next-wave-objective', objective);
    const missionShortcut = query<HTMLButtonElement>('.mission-shortcut');
    missionShortcut.classList.toggle('ready', !!readyMission);
    missionShortcut.title = shortcutMission ? `${shortcutMission.description}。クリックで任務を開く。` : '任務を選んで受注すると、特注装備の報酬を目指せます';
    missionShortcut.setAttribute('aria-label', shortcutMission ? `任務を開く：${shortcutMission.name}、${format(shortcutMission.progress)} / ${format(shortcutMission.target)}${readyMission ? '、受領できる報酬あり' : ''}` : '任務を選ぶ：特注装備を獲得');
    bar('objective-bar', shortcutMission ? shortcutMission.progress / shortcutMission.target : 0);
    for (const upgrade of upgrades) {
      const cost = sim.getUpgradeCost(upgrade.id);
      set(`upgrade-${upgrade.id}-level`, `Lv.${state.upgrades[upgrade.id]}/10`);
      set(`upgrade-${upgrade.id}-cost`, Number.isFinite(cost) ? `${format(cost)} CR` : 'MAX');
      const detail = { damage: `出力 +${state.upgrades.damage * 3}% · 最大 +30%`, rate: `連射 +${state.upgrades.rate * 2}% · 最大 +20%`, shield: `耐久 +${state.upgrades.shield * 2}% · 最大 +20%`, drone: '' }[upgrade.id];
      set(`upgrade-${upgrade.id}-stat`, detail);
      const button = query<HTMLButtonElement>(`[data-action="upgrade"][data-id="${upgrade.id}"]`);
      button.disabled = state.credits < cost || !Number.isFinite(cost);
      button.title = !Number.isFinite(cost) ? '最大レベルです' : button.disabled ? `${format(cost)} CR 必要です` : `${upgrade.name}を強化`;
      button.setAttribute('aria-label', Number.isFinite(cost) ? `${upgrade.name}を強化、${format(cost)}クレジット` : `${upgrade.name}、最大レベル`);
    }
    for (const slot of ['weapon', 'wing', 'body', 'drone'] as InventoryCategory[]) {
      const item = equippedItem(slot);
      const rarity = rarityInfo(item.rarity);
      const button = query<HTMLButtonElement>(`[data-action="open-slot"][data-id="${slot}"]`);
      button.style.setProperty('--gear-color', cssColor(rarity.color));
      set(`slot-${slot}-rarity`, `+${enhancementLevel(item)}`);
      const rarityMark = query(`[data-slot-rarity="${slot}"]`);
      rarityMark.setAttribute('title', rarity.label);
      rarityMark.setAttribute('role', 'img');
      rarityMark.setAttribute('aria-label', rarity.label);
      button.setAttribute('aria-label', `${categoryLabel(slot)}の装備倉庫を開く：${item.name}、${rarity.label}、拾得Lv.${item.level}、強化+${enhancementLevel(item)}`);
      set(`slot-${slot}-name`, item.name);
      const glyph = gearArtModel(item);
      const emblem = query(`[data-value="slot-${slot}-icon"]`);
      if (emblem.dataset.glyph !== glyph) { emblem.innerHTML = gearArt(item); emblem.dataset.glyph = glyph; }
      let effects: string;
      if (isWeapon(item)) {
        const mastery = sim.getMastery(item.type);
        set(`slot-${slot}-type`, `Lv.${item.level} · 熟練 ${mastery.level}`);
        effects = item.affixes.map(getAffixText).join(' / ') || `DPS ${format(sim.getWeaponPreview(item).dps)} · 熟練威力 +${Math.round(mastery.bonus * 100)}%`;
      } else {
        set(`slot-${slot}-type`, `Lv.${item.level}${item.slot === 'drone' ? ` · 支援 ${item.units}機` : ''}`);
        effects = [...sim.getPartPreview(item).effects, ...item.affixes.map(getPartAffixText)].join(' / ');
      }
      button.title = `${rarity.label} / ${categoryLabel(slot)}: ${item.name}。拾得Lv.${item.level} / 強化+${enhancementLevel(item)}。${effects}。クリックして装備を比較・変更・強化`;
    }
    const activeSynergies = sim.getSynergies().filter(synergy => synergy.active);
    set('synergy-hint', activeSynergies.length ? `相性 ${activeSynergies.length}件成立 · 発動 ${activeSynergies.filter(synergy => synergy.engaged).length}件` : '構成を保存・呼び出し');
    query('.synergy-trigger').classList.toggle('active', activeSynergies.length > 0);
    query('.synergy-trigger').title = ['構成の保存・呼び出し / 装備の相性', ...sim.getSynergies().map(synergy => `${synergy.engaged ? '発動中' : synergy.active ? '相性成立・待機' : '未成立'}: ${synergy.name} — ${synergy.detail}`)].join('\n');
    set('inventory-capacity', `武 ${state.inventory.length}/64 · 機 ${state.parts.length}/64`);
    renderInventory();
    for (const module of MODULES) {
      const button = query<HTMLButtonElement>(`[data-action="module"][data-id="${module.id}"]`);
      const equipped = module.id === state.module;
      const unlocked = state.bestWave >= module.unlock;
      button.disabled = !unlocked;
      button.classList.toggle('equipped', equipped);
      button.setAttribute('aria-pressed', String(equipped));
      set(`module-${module.id}-status`, equipped ? '装備中' : unlocked ? '' : `W${module.unlock}`);
      button.title = unlocked ? module.description : `WAVE ${module.unlock} 突破で解放。${module.description}`;
      button.setAttribute('aria-label', `${moduleUI[module.id].name}モジュール${equipped ? '、装備中' : unlocked ? 'を装備' : `、WAVE ${module.unlock}で解放`}。${module.description}`);
    }
    const compactModule = query<HTMLSelectElement>('.compact-module');
    compactModule.value = state.module;
    for (const option of Array.from(compactModule.options)) { const module = MODULES.find(item => item.id === option.value)!; option.disabled = state.bestWave < module.unlock; option.textContent = `${moduleUI[module.id].name}${option.disabled ? ` (W${module.unlock})` : ''}`; }
    const skillTotal = SKILL_NODES.reduce((sum, node) => sum + sim.getSkillRank(node.id), 0);
    set('skill-total', `${skillTotal} / ${SKILL_NODES.reduce((sum, node) => sum + node.maxRank, 0)}`);
    for (const branch of SKILL_BRANCHES) {
      const nodes = SKILL_NODES.filter(node => node.branch === branch.id);
      const rank = nodes.reduce((sum, node) => sum + sim.getSkillRank(node.id), 0);
      const maximum = nodes.reduce((sum, node) => sum + node.maxRank, 0);
      set(`branch-${branch.id}-ranks`, `${rank} / ${maximum}`);
      bar(`branch-${branch.id}-bar`, rank / maximum);
      query<HTMLButtonElement>(`[data-action="open-research-branch"][data-id="${branch.id}"]`).title = nodes.map(node => `${node.name} ${sim.getSkillRank(node.id)}/${node.maxRank}: ${node.description}`).join('\n');
    }
    set('research-intro', state.bestWave < 15 ? 'WAVE 15 からCRで研究。再出撃後も有効。' : 'CRで研究。W20 / W25 で次の段階を解放。');
    renderSkillTree();
    renderRecords();
    renderLoadouts();
    const prestigeReward = sim.getPrestigeReward();
    query<HTMLButtonElement>('[data-action="prestige"]').disabled = state.bestWave < 15 || prestigeReward <= 0;
    set('prestige-reward', state.bestWave < 15 ? 'WAVE 15 突破で解放' : prestigeReward <= 0 ? '今回の出撃で WAVE 15 を突破' : `＋${format(prestigeReward)} CRを獲得`);
    if (state.bestWave > lastBestWave) {
      if (state.bestWave === 3) toast('WAVE 03 突破！強襲型モジュールを解放しました', 'power');
      if (state.bestWave === 6) toast('WAVE 06 突破！防衛型モジュールを解放しました', 'power');
      if (state.bestWave === 8) toast('WAVE 08 突破！回収型モジュールを解放しました', 'power');
      if (state.bestWave === 5) toast('WAVE 05 到達！拡散ショットが回収候補に加わりました', 'power');
      if (state.bestWave === 10) toast('WAVE 10 到達！貫通ランスが回収候補に加わりました', 'power');
      if (state.bestWave === 15) toast('WAVE 15 到達！研究と再出撃を解放しました', 'power');
      lastBestWave = state.bestWave;
    }
    if (!dialog.open && !mobileDock.open && sim.offlineReward && sim.offlineReward.credits > 0) openDialog('offline');
  }

  adaptMobileLayout();
  mobileLayout.addEventListener('change', adaptMobileLayout);
  mobileDock.addEventListener('cancel', cancelMobileDock);
  mobileDock.addEventListener('click', mobileDockBackdrop);
  const unsubscribePwa = subscribePwaState(() => { if (!destroyed) renderPwaSettings(); });
  render();
  return {
    render,
    toast,
    destroy(): void {
      resetPending = false;
      destroyed = true;
      if (dialog.open) closeDialog();
      if (mobileDock.open) closeMobileDock();
      mobileLayout.removeEventListener('change', adaptMobileLayout);
      mobileDock.removeEventListener('cancel', cancelMobileDock);
      mobileDock.removeEventListener('click', mobileDockBackdrop);
      unsubscribePwa();
      if (toastTimer) clearTimeout(toastTimer);
      if (inventorySearchTimer) clearTimeout(inventorySearchTimer);
      app.removeEventListener('click', click);
      app.removeEventListener('change', change);
      app.removeEventListener('input', input);
      app.removeEventListener('compositionend', compositionEnd);
      app.removeEventListener('toggle', toggleTools, true);
      window.removeEventListener('resize', sizeInventoryTools);
      document.removeEventListener('keydown', keyboard);
      dialog.removeEventListener('cancel', cancel);
      dialog.removeEventListener('click', backdrop);
    },
  };
}
