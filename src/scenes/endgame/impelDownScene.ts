import {
  getFloorDefinitionForRun,
  resumeImpelDownRun
} from '../../core/endgame/impelDown';
import type {
  EndgameDataRegistry,
  ImpelDownRunState
} from '../../core/endgame/types';
import type { GameDataRegistry } from '../../core/types/dataSchemas';
import type { RpgCampaignState } from '../../core/types/rpgSchemas';

export interface ImpelDownSceneCallbacks {
  onStartNewRun: (partyUnitIds: string[]) => void;
  onStartFloorBattle: (run: ImpelDownRunState) => void;
  onPickBuff: (run: ImpelDownRunState, buffId: string) => void;
  onContinueEndless: (run: ImpelDownRunState) => void;
  onFinishRun: () => void;
  onSuspendAndClose: (run: ImpelDownRunState) => void;
  onClose: () => void;
}

export function renderImpelDownModal(
  container: HTMLElement,
  activeRun: ImpelDownRunState | null,
  campaign: RpgCampaignState,
  gameReg: GameDataRegistry,
  endgameReg: EndgameDataRegistry,
  callbacks: ImpelDownSceneCallbacks
): void {
  const run = activeRun ?? resumeImpelDownRun(campaign);

  if (!run || run.status === 'FAILED') {
    const defaultParty = campaign.activePartyUnitIds.slice(0, 3);
    const candidates = campaign.recruitedUnitIds.length > 0
      ? campaign.recruitedUnitIds
      : ['luffy', 'zoro', 'sanji'];

    const unitCheckboxes = candidates
      .map((uid) => {
        const u = gameReg.units[uid];
        if (!u) return '';
        const checked = defaultParty.includes(uid) ? 'checked' : '';
        return `
          <label style="display:flex;align-items:center;gap:6px;padding:6px 8px;border:1px solid #334155;border-radius:6px;background:#0f172a;font-size:11px;cursor:pointer;">
            <input type="checkbox" class="impel-party-chk" value="${uid}" ${checked} />
            <span>${u.name} <small style="color:#94a3b8;">(Lv.${campaign.unitLevelOverrides[uid] ?? 55})</small></span>
          </label>
        `;
      })
      .join('');

    container.innerHTML = `
      <div class="modal-box endgame-modal-box" role="dialog" aria-label="임펠 다운 6층 로그라이트 서바이벌">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h2 style="margin:0;color:#d8b4fe;font-size:16px;">⛓️ 대감옥 임펠 다운 — 6층 로그라이트 서바이벌</h2>
          <button id="btn-impel-close">닫기</button>
        </div>
        <div style="font-size:11px;color:#cbd5e1;background:#1e1b4b;border:1px solid #7e22ce;padding:8px 10px;border-radius:6px;margin-bottom:10px;">
          • 최대 3인 파티 출격 — <strong>HP·PP·상태가 다음 층으로 그대로 계승</strong>되며 일반 가방 회복 아이템은 사용 불가합니다.<br/>
          • Level 1 홍련지옥 → Level 4 초열지옥(<strong>서장 마젤란</strong>) → Level 6 무한지옥(시드 엘리트 2연전) → 무한 심층(7층+)<br/>
          • 최고 돌파 기록: <strong style="color:#facc15;">Level ${campaign.endgame.impelDown.highestFloor}</strong>
        </div>
        <div style="font-size:12px;font-weight:bold;color:#fde047;margin-bottom:6px;">출격 파티 선택 (최대 3명):</div>
        <div id="impel-party-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;margin-bottom:12px;">
          ${unitCheckboxes}
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="btn-impel-start-run" class="btn-tab-active">🔥 Level 1 홍련지옥 도전 시작!</button>
        </div>
      </div>
    `;
    container.classList.add('open');

    container
      .querySelector('#btn-impel-close')
      ?.addEventListener('click', () => callbacks.onClose());
    container
      .querySelector('#btn-impel-start-run')
      ?.addEventListener('click', () => {
        const checked = Array.from(
          container.querySelectorAll<HTMLInputElement>('.impel-party-chk:checked')
        )
          .map((el) => el.value)
          .slice(0, 3);
        callbacks.onStartNewRun(checked.length > 0 ? checked : defaultParty);
      });
    return;
  }

  // Active Run Screen (IN_FLOOR, DRAFTING, or FLOOR6_CLEAR_CHOICE)
  const floorDef = getFloorDefinitionForRun(run.currentFloor, run.seed, endgameReg);
  const partyStatusHtml = run.partyUnitIds
    .map((uid) => {
      const u = gameReg.units[uid];
      const co = run.carryoverMap[uid];
      const pct = Math.round((co?.hpRatio ?? 0) * 100);
      const barColor = pct > 50 ? '#22c55e' : pct > 20 ? '#eab308' : '#ef4444';
      return `
        <div style="background:#0f172a;border:1px solid #334155;border-radius:6px;padding:6px 8px;font-size:11px;">
          <div style="display:flex;justify-content:space-between;">
            <strong>${u?.name ?? uid}</strong>
            <span style="color:${barColor};">${pct > 0 ? `HP ${pct}%` : '전투불능'}</span>
          </div>
          <div style="height:6px;background:#1e293b;border-radius:3px;overflow:hidden;margin-top:4px;">
            <div style="width:${pct}%;height:100%;background:${barColor};"></div>
          </div>
        </div>
      `;
    })
    .join('');

  const selectedBuffBadges = run.selectedBuffIds
    .map((bId) => {
      const b = endgameReg.impelDown.buffs.find((x) => x.id === bId);
      return b
        ? `<span style="font-size:10px;padding:3px 6px;border-radius:4px;background:#3b0764;border:1px solid #a855f7;color:#f3e8ff;">${b.icon} ${b.name}</span>`
        : '';
    })
    .join('');

  let bodyHtml = '';
  if (run.status === 'DRAFTING' && run.pendingDraftBuffIds) {
    const cardsHtml = run.pendingDraftBuffIds
      .map((bId) => {
        const b = endgameReg.impelDown.buffs.find((x) => x.id === bId);
        if (!b) return '';
        const borderCol =
          b.rarity === 'LEGENDARY'
            ? '#facc15'
            : b.rarity === 'RARE'
              ? '#38bdf8'
              : '#94a3b8';
        return `
          <div class="impel-draft-card" data-buff-id="${b.id}" style="border-color:${borderCol};">
            <div style="font-size:18px;margin-bottom:4px;">${b.icon}</div>
            <div style="font-weight:bold;color:#f8fafc;font-size:12px;">${b.name}</div>
            <div style="font-size:10px;color:${borderCol};margin:2px 0 6px;">[${b.rarity}]</div>
            <div style="font-size:11px;color:#cbd5e1;flex:1;margin-bottom:8px;">${b.description}</div>
            <button class="btn-pick-impel-buff btn-tab-active" data-buff-id="${b.id}">이 유물 선택</button>
          </div>
        `;
      })
      .join('');

    bodyHtml = `
      <div style="margin:10px 0 6px;font-size:13px;font-weight:bold;color:#4ade80;">
        🎉 Level ${run.currentFloor} 돌파 성공! 3택 로그라이트 유물 버프를 1개 선택하세요:
      </div>
      <div class="impel-draft-grid">${cardsHtml}</div>
    `;
  } else if (run.status === 'FLOOR6_CLEAR_CHOICE') {
    bodyHtml = `
      <div style="background:rgba(22,163,74,0.18);border:1px solid #22c55e;border-radius:8px;padding:12px;margin:10px 0;text-align:center;">
        <div style="font-size:15px;font-weight:bold;color:#fde047;margin-bottom:6px;">
          🏆 임펠 다운 Level 6 무한지옥 정복 완료!!
        </div>
        <div style="font-size:11px;color:#e2e8f0;margin-bottom:10px;">
          누적 획득 보상: ${run.totalBerriesEarned.toLocaleString()} 베리 / ${run.totalTpEarned} TP
        </div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
          <button id="btn-impel-endless" class="btn-tab-active" style="background:#7e22ce;border-color:#d8b4fe;">🔥 무한 심층 (Level 7+) 계속 도전!</button>
          <button id="btn-impel-finish">⚓ 6층 완주 귀환</button>
        </div>
      </div>
    `;
  } else {
    bodyHtml = `
      <div style="background:#111827;border:1px solid #ef4444;border-radius:8px;padding:10px;margin:10px 0;">
        <div style="font-size:14px;font-weight:bold;color:#fca5a5;">${floorDef.name} — ${floorDef.subtitle}</div>
        <div style="font-size:11px;color:#fde047;margin-top:4px;">⚠ 층 기믹: ${floorDef.hazardDescription}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px;">
          클리어 보상: ${floorDef.berryReward.toLocaleString()} 베리 / ${floorDef.trainingPointReward} TP
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
        <button id="btn-impel-suspend">💾 중단 저장 (이어하기 보관)</button>
        <button id="btn-impel-battle" class="btn-tab-active">⚔ ${floorDef.name} 전투 돌입!</button>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="modal-box endgame-modal-box" role="dialog" aria-label="임펠 다운 진행">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h2 style="margin:0;color:#d8b4fe;font-size:15px;">⛓️ 임펠 다운 진행 중 — Level ${run.currentFloor}${run.isEndlessMode ? ' (무한 심층)' : '/6'}</h2>
        <button id="btn-impel-close">닫기</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:6px;margin-bottom:8px;">
        ${partyStatusHtml}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">
        ${selectedBuffBadges || '<span style="font-size:10px;color:#64748b;">획득한 런 버프 없음</span>'}
      </div>
      ${bodyHtml}
    </div>
  `;

  container.classList.add('open');

  container
    .querySelector('#btn-impel-close')
    ?.addEventListener('click', () => callbacks.onClose());
  container
    .querySelector('#btn-impel-suspend')
    ?.addEventListener('click', () => callbacks.onSuspendAndClose(run));
  container
    .querySelector('#btn-impel-battle')
    ?.addEventListener('click', () => callbacks.onStartFloorBattle(run));
  container
    .querySelector('#btn-impel-endless')
    ?.addEventListener('click', () => callbacks.onContinueEndless(run));
  container
    .querySelector('#btn-impel-finish')
    ?.addEventListener('click', () => callbacks.onFinishRun());
  container.querySelectorAll<HTMLButtonElement>('.btn-pick-impel-buff').forEach((btn) => {
    btn.addEventListener('click', () => {
      const bId = btn.dataset.buffId;
      if (bId) callbacks.onPickBuff(run, bId);
    });
  });
}
