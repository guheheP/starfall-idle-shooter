import type { MissionSummary } from '../game/missions';
import { REQUISITION_PROFILES, type RequisitionModel, type RequisitionProfile } from '../game/requisition';
import type { PartItem, WeaponItem } from '../game/types';
import { RARITIES } from '../game/loot';
import { gearArt } from './gear-art';

export interface MissionBoardViewModel {
  missions: readonly MissionSummary[];
  selected: MissionSummary;
  active: MissionSummary | undefined;
  profile: RequisitionProfile;
  requisitionModel: RequisitionModel;
  rewardLevel: number;
  rewardRarityLabel: string;
  rewardColor: string;
  claimIssue: string | null;
  storageCount: number;
  storageCapacity: number;
  bestWave: number;
  receipt: { item: WeaponItem | PartItem; rarityLabel: string; affixes: readonly string[] } | null;
}

const escape = (value: string): string => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const number = (value: number): string => value.toLocaleString('ja-JP');
const ratio = (mission: MissionSummary): number => Math.max(0, Math.min(1, mission.progress / mission.target)) * 100;
const status = (mission: MissionSummary): string => !mission.unlocked ? `W${mission.unlockWave}で解放` : mission.ready ? '報酬待ち' : mission.active ? '受注中' : '待機';
const categories = [
  { id: 'weapon', label: '主武装' }, { id: 'wing', label: 'ウィング' },
  { id: 'body', label: 'ボディ' }, { id: 'drone', label: '支援ドローン' },
] as const;

/** Pure view: UI owns selection, storage checks, focus restoration and action handling. */
export function renderMissionBoard(view: MissionBoardViewModel): string {
  const { selected, active, profile, receipt } = view;
  const acceptLabel = !selected.unlocked ? `W${selected.unlockWave}で解放` : selected.active ? 'この任務を受注中' : active ? 'この任務に切り替え' : 'この任務を受注';
  const canAccept = selected.unlocked && !selected.active;
  const primary = selected.ready ? 'claim' : 'accept';
  const claimLabel = selected.ready ? `${profile.name}を受領` : '達成後に受領';
  const issue = view.claimIssue === '任務の目標が未達成です' ? '達成後に報酬を受領できます' : view.claimIssue;
  const color = /^#[\da-f]{3,8}$/i.test(view.rewardColor) ? view.rewardColor : '#c1a2e8';
  const roster = view.missions.map((mission, index) => `<button class="mission-card ${mission.ready ? 'ready' : ''} ${mission.active ? 'active' : ''}" data-action="inspect-mission" data-id="${mission.id}" aria-pressed="${mission.id === selected.id}" title="${escape(mission.name)} · ${status(mission)}">
    <span class="mission-card-number">${String(index + 1).padStart(2, '0')}</span>
    <span class="mission-card-copy"><strong><span class="mission-card-name">${escape(mission.name)}</span><small>R${mission.rank}</small></strong><span>${status(mission)}<b>${number(mission.progress)} / ${number(mission.target)}</b></span><span class="mission-track"><span style="width:${ratio(mission)}%"></span></span></span>
  </button>`).join('');
  const options = categories.map(category => `<optgroup label="${category.label}">${REQUISITION_PROFILES.filter(option => option.category === category.id).map(option => `<option value="${option.model}" ${option.model === view.requisitionModel ? 'selected' : ''} ${view.bestWave < option.unlockWave ? 'disabled' : ''}>${escape(option.name)}${view.bestWave < option.unlockWave ? `（W${option.unlockWave}で解放）` : ''}</option>`).join('')}</optgroup>`).join('');
  const receiptColor = receipt ? `#${RARITIES.find(rarity => rarity.id === receipt.item.rarity)!.color.toString(16).padStart(6, '0')}` : color;
  const received = receipt ? `<section class="mission-receipt" style="--rarity-color:${receiptColor}" aria-label="受領した装備"><div class="mission-receipt-art">${gearArt(receipt.item)}</div><div><small>RECEIVED / 倉庫へ保管・保護済み</small><strong>${escape(receipt.item.name)}</strong><span class="mission-reward-meta"><span class="rarity-mark" role="img" title="${escape(receipt.rarityLabel)}" aria-label="${escape(receipt.rarityLabel)}"></span><span>拾得Lv.${receipt.item.level}</span></span><p>${receipt.affixes.map(escape).join(' / ')}</p></div></section>` : '';
  return `<div class="mission-banner"><span>${active ? `受注中：${escape(active.name)}` : '任務を選んで受注'}</span><small>${active ? `${number(active.progress)} / ${number(active.target)}${active.ready ? ' · 達成' : ''}` : '12種の実戦任務'}</small></div>
    <div class="mission-workspace">
      <section class="mission-roster" aria-label="任務一覧">${roster}</section>
      <section class="mission-panel" style="--reward-color:${color}" aria-label="選択した任務">
        <header class="mission-detail-header">
          <div class="mission-detail-heading"><span class="microtype">MISSION / RANK ${selected.rank}</span><span class="mission-state ${selected.ready ? 'ready' : ''}">${status(selected)}</span></div>
          <div class="mission-title-row"><h3>${escape(selected.name)}</h3><b>${number(selected.progress)}<small> / ${number(selected.target)}</small></b></div>
          <span class="mission-track"><span style="width:${ratio(selected)}%"></span></span>
          <p class="mission-description">${escape(selected.description)}</p>
        </header>
        <div class="mission-detail" aria-label="報酬と任務の詳細">
          <section class="requisition-plan">
            <div class="requisition-heading"><h4>特注装備</h4><b class="mission-reward-meta"><span class="rarity-mark" role="img" title="${escape(view.rewardRarityLabel)}" aria-label="${escape(view.rewardRarityLabel)}"></span><span>拾得Lv.${view.rewardLevel}</span></b></div>
            <label class="requisition-select"><span>受け取るモデル</span><select data-mission-control="reward-model" aria-label="任務報酬の装備モデル">${options}</select></label>
            <div class="requisition-guarantee"><small>保証効果</small><b>${escape(profile.guaranteedAffix)}</b><span>＋ランダム${selected.rewardRarity === 'legendary' ? 3 : 2}枠</span></div>
          </section>
          <details class="mission-notes"><summary>装備の特徴・任務のしくみ <span>完了 ${number(selected.completions)}回</span></summary><p class="requisition-profile">${escape(profile.description)}</p><p>進むのは受注中の1件だけ。切り替えても進捗を保管し、受領後は同じ任務を次ランクで継続します。</p><p class="requisition-policy">報酬は保護状態で倉庫へ保管し、換装は手動です。空き枠がなくても達成記録は消えません。5回完了後、次の報酬からレジェンダリーになります。</p></details>
          ${received}
        </div>
        <footer class="mission-actions" data-primary="${primary}">
          <div class="mission-claim-status"><span>${profile.category === 'weapon' ? '武器' : 'パーツ'}倉庫 ${view.storageCount} / ${view.storageCapacity}</span><small id="mission-claim-issue" class="${view.claimIssue && selected.ready ? 'blocked' : ''}" role="status">${issue ? escape(issue) : '空き枠あり・受領できます'}</small></div>
          <div class="mission-action-buttons"><button class="mission-accept" data-action="accept-mission" data-id="${selected.id}" ${canAccept ? '' : 'disabled'}>${acceptLabel}</button><button class="mission-claim" data-action="claim-mission" data-id="${selected.id}" aria-describedby="mission-claim-issue" ${view.claimIssue ? 'disabled' : ''}>${escape(claimLabel)}</button></div>
        </footer>
      </section>
    </div>`;
}
