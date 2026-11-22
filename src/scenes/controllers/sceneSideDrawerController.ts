import { createBattleWorld } from '../../core/combat/battleWorld';
import { SeededPRNG } from '../../core/math/prng';
import { computeBountyTier } from '../../core/rpg/crewAndBountyEngine';
import type { Disposable } from '../sceneTypes';
import type { SceneManagerHost } from './controllerContracts';

export class SceneSideDrawerController implements Disposable {
  private lastVoyageLogLen = 0;
  private lastCombatLogLen = 0;

  constructor(private readonly host: SceneManagerHost) {}

  public dispose(): void {
    this.lastVoyageLogLen = 0;
    this.lastCombatLogLen = 0;
  }

  public refreshSideDrawer(): void {
    if (!this.host.sideDrawerEl) return;

    if (this.host.activeScene === 'SANDBOX') {
      this.renderSandboxDrawer();
      return;
    }

    const zone = this.host.rpgRegistry.seaZones[this.host.campaign.currentZoneId];
    const shipDef = this.host.rpgRegistry.ships[this.host.campaign.ship.shipId];
    const tierInfo = computeBountyTier(this.host.campaign.totalCrewBounty);

    const tamperBanner = this.host.isCurrentSaveTampered
      ? `<div style="background:#7f1d1d;border:1px solid #ef4444;color:#fecaca;padding:6px;border-radius:4px;font-size:11px;font-weight:bold;">
          ⚠ 비공식 수정 데이터 (통신 대전 제한)<br/>
          위반 코드: ${this.host.currentViolationCodes.join(', ')}
        </div>`
      : '';

    const episodeItemsHtml = Object.values(this.host.rpgRegistry.seaZones)
      .flatMap((z) =>
        z.islands
          .filter((i) => i.playableInVerticalSlice)
          .map((i) => {
            const done = this.host.campaign.completedEpisodes.includes(i.episodeId);
            return `<div style="display:flex;justify-content:space-between;font-size:11px;color:${
              done ? '#4ade80' : '#fde047'
            };">
              <span>${done ? '✓' : '●'} [${z.id}] ${i.name}</span>
              <span>${done ? '완료' : i.requiredForNextZone ? '필수' : '선택'}</span>
            </div>`;
          })
      )
      .join('');

    const partyHtml = this.host.campaign.recruitedUnitIds
      .map((uid) => {
        const u = this.host.gameRegistry.units[uid];
        const haki = this.host.campaign.unitHakiOverrides[uid] ?? u?.haki;
        return `<div style="font-size:11px;color:#e2e8f0;display:flex;justify-content:space-between;">
          <span>🏴‍☠️ ${u?.name ?? uid} (Lv.${this.host.campaign.unitLevelOverrides[uid] ?? 50})</span>
          <span style="color:#38bdf8;">무${haki?.armament ?? 1}/견${haki?.observation ?? 1}/패${haki?.conqueror ?? 0}</span>
        </div>`;
      })
      .join('');

    this.host.sideDrawerEl.innerHTML = `
      ${tamperBanner}
      <div class="config-card">
        <h4>🧭 현재 항해 & 해적단 현황</h4>
        <div class="field-row"><label>현재 위치:</label><span>${
          this.host.activeScene === 'ISLAND_EPISODE' && this.host.islandRuntime
            ? `🏝 ${this.host.rpgRegistry.islands[this.host.islandRuntime.islandId]?.name}`
            : `⚓ ${zone.name}`
        }</span></div>
        <div class="field-row"><label>탑승 선박:</label><span style="color:#fde047;">${shipDef?.name}</span></div>
        <div class="field-row"><label>보유 자금:</label><span style="color:#4ade80;">฿ ${this.host.campaign.berries.toLocaleString()} | 수련Pt: ${this.host.campaign.trainingPoints}</span></div>
        <div class="field-row"><label>총 현상금:</label><span style="color:#f97316;">฿ ${this.host.campaign.totalCrewBounty.toLocaleString()}</span></div>
        <div class="field-row"><label>해적단 위상:</label><span>${tierInfo.rankLabel} (해군AI Lv.${tierInfo.patrolAiLevel})</span></div>
        <div class="field-row"><label>로드 포네그리프:</label><span style="color:#f43f5e;">${this.host.campaign.roadPoneglyphCount} / 4 확보</span></div>
        <div class="field-row"><label>통신 대전 전적:</label><span style="color:#c084fc;">${this.host.campaign.onlineStats.wins}승 ${this.host.campaign.onlineStats.losses}패 ${this.host.campaign.onlineStats.draws}무</span></div>
      </div>

      <div class="config-card">
        <h4>🗺 해역별 에피소드 클리어 현황</h4>
        ${episodeItemsHtml}
      </div>

      <div class="config-card">
        <h4>👥 영입된 동료 파티 (${this.host.campaign.recruitedUnitIds.length}명)</h4>
        ${partyHtml}
      </div>

      <div class="config-card">
        <h4>📜 항해 일지 (Voyage Log)</h4>
        <div id="combat-log-box" class="combat-log-box"></div>
      </div>
    `;

    this.lastVoyageLogLen = 0;
    this.syncLogsDom();
  }

  private renderSandboxDrawer(): void {
    const unitOptions = Object.values(this.host.gameRegistry.units)
      .map(
        (u) =>
          `<option value="${u.id}">${u.name} [${u.fruitType ?? u.element}]</option>`
      )
      .join('');
    const formOptions = Object.values(this.host.gameRegistry.forms)
      .map((f) => `<option value="${f.id}">${f.name}</option>`)
      .join('');

    const alphaLead = this.host.sandboxConfig.teamAlpha[0];
    const omegaLead = this.host.sandboxConfig.teamOmega[0];
    if (!alphaLead || !omegaLead) return;

    this.host.sideDrawerEl.innerHTML = `
      <div class="config-card">
        <h4>⚔ 배틀 샌드박스 설정</h4>
        <div class="field-row">
          <label>전투 모드:</label>
          <select id="sel-mode">
            <option value="1V1">1:1 (Player vs AI)</option>
            <option value="2V2">2:2 (Player+AI vs 2 AI)</option>
            <option value="AI_VS_AI">AI vs AI (관전 모드)</option>
          </select>
        </div>
        <div class="field-row">
          <label>ALPHA 리더:</label>
          <select id="alpha-unit">${unitOptions}</select>
        </div>
        <div class="field-row">
          <label>ALPHA 각성폼:</label>
          <select id="alpha-form">${formOptions}</select>
        </div>
        <div class="field-row">
          <label>OMEGA 리더:</label>
          <select id="omega-unit">${unitOptions}</select>
        </div>
        <div class="field-row">
          <label>OMEGA 각성폼:</label>
          <select id="omega-form">${formOptions}</select>
        </div>
        <button id="btn-sandbox-restart" class="btn-tab-active" style="margin-top:4px;">▶ 샌드박스 전투 재시작</button>
      </div>
      <div class="config-card">
        <h4>📜 실시간 맞대결 전투 로그</h4>
        <div id="combat-log-box" class="combat-log-box"></div>
      </div>
    `;

    const selMode = this.host.sideDrawerEl.querySelector('#sel-mode') as HTMLSelectElement;
    const selAlpha = this.host.sideDrawerEl.querySelector('#alpha-unit') as HTMLSelectElement;
    const selAlphaForm = this.host.sideDrawerEl.querySelector('#alpha-form') as HTMLSelectElement;
    const selOmega = this.host.sideDrawerEl.querySelector('#omega-unit') as HTMLSelectElement;
    const selOmegaForm = this.host.sideDrawerEl.querySelector('#omega-form') as HTMLSelectElement;

    selMode.value = this.host.sandboxConfig.mode;
    selAlpha.value = alphaLead.speciesId;
    selAlphaForm.value = alphaLead.formId;
    selOmega.value = omegaLead.speciesId;
    selOmegaForm.value = omegaLead.formId;

    const applyChanges = () => {
      this.host.sandboxConfig.mode = selMode.value as '1V1' | '2V2' | 'AI_VS_AI';
      alphaLead.speciesId = selAlpha.value;
      alphaLead.formId = selAlphaForm.value;
      alphaLead.moveIds = [
        ...(this.host.gameRegistry.units[alphaLead.speciesId]?.defaultMoves ??
          alphaLead.moveIds)
      ];
      alphaLead.isPlayerControlled = this.host.sandboxConfig.mode !== 'AI_VS_AI';

      omegaLead.speciesId = selOmega.value;
      omegaLead.formId = selOmegaForm.value;
      omegaLead.moveIds = [
        ...(this.host.gameRegistry.units[omegaLead.speciesId]?.defaultMoves ??
          omegaLead.moveIds)
      ];
      this.host.prng = new SeededPRNG(this.host.sandboxConfig.seed);
      this.host.battleWorld = createBattleWorld(this.host.sandboxConfig, this.host.gameRegistry);
      void this.host.storage.saveTeamPreset('sandbox_default', this.host.sandboxConfig);
    };

    selMode.addEventListener('change', applyChanges);
    selAlpha.addEventListener('change', () => {
      const u = this.host.gameRegistry.units[selAlpha.value];
      if (u) selAlphaForm.value = u.defaultFormId;
      applyChanges();
    });
    selAlphaForm.addEventListener('change', applyChanges);
    selOmega.addEventListener('change', () => {
      const u = this.host.gameRegistry.units[selOmega.value];
      if (u) selOmegaForm.value = u.defaultFormId;
      applyChanges();
    });
    selOmegaForm.addEventListener('change', applyChanges);
    this.host.sideDrawerEl
      .querySelector('#btn-sandbox-restart')
      ?.addEventListener('click', applyChanges);
  }

  public syncLogsDom(): void {
    const logBox = this.host.sideDrawerEl?.querySelector('#combat-log-box');
    if (!logBox) return;

    const currentBattle =
      this.host.activeScene === 'ONLINE_BATTLE' && this.host.activeLockstep
        ? this.host.activeLockstep.world
        : this.host.battleWorld;

    if (
      this.host.activeScene === 'SANDBOX' ||
      this.host.activeScene === 'STORY_BATTLE' ||
      this.host.activeScene === 'ONLINE_BATTLE'
    ) {
      if (currentBattle.combatLog.length === this.lastCombatLogLen) return;
      this.lastCombatLogLen = currentBattle.combatLog.length;
      const recent = currentBattle.combatLog.slice(-18);
      logBox.innerHTML = recent.map((l) => `<div>${l}</div>`).join('');
      logBox.scrollTop = logBox.scrollHeight;
    } else {
      if (this.host.campaign.voyageLog.length === this.lastVoyageLogLen) return;
      this.lastVoyageLogLen = this.host.campaign.voyageLog.length;
      const recent = this.host.campaign.voyageLog.slice(-18);
      logBox.innerHTML = recent.map((l) => `<div>${l}</div>`).join('');
      logBox.scrollTop = logBox.scrollHeight;
    }
  }
}
