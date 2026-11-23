import type { AudioManager } from '../../audio/audioManager';
import {
  assignCrewRole,
  executeShipboardCooking,
  purchaseTrainingUpgrade
} from '../../core/rpg/crewAndBountyEngine';
import type {
  CrewRoleId,
  RpgCampaignState,
  RpgDataRegistry
} from '../../core/types/rpgSchemas';

export interface CrewCampModalContext {
  campModalEl: HTMLElement;
  campaign: RpgCampaignState;
  rpgRegistry: RpgDataRegistry;
  audio: AudioManager;
  triggerAutoSave: (reason: string) => Promise<void>;
  refreshSideDrawer: () => void;
  onPartyOrCrewChanged?: () => void;
}

export function createCrewCampModalElement(): HTMLElement {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.id = 'crew-camp-modal';
  return modal;
}

export function renderCrewCampModal(ctx: CrewCampModalContext): void {
  const { campModalEl, campaign, rpgRegistry, audio, triggerAutoSave, refreshSideDrawer } = ctx;

  const rolesHtml = Object.values(rpgRegistry.crewRoles)
    .map((r) => {
      const holder = campaign.assignedCrewRoles[r.roleId] ?? '미배치';
      return `<div class="field-row" style="border-bottom:1px solid #1e293b;padding:4px 0;">
        <div>
          <strong style="color:#fde047;">[${r.name}]</strong> <span style="color:#38bdf8;">(${holder})</span>
          <div style="font-size:10px;color:#94a3b8;">${r.description}</div>
        </div>
        <button data-assign-role="${r.roleId}">직책 활성화</button>
      </div>`;
    })
    .join('');

  const trainingHtml = rpgRegistry.trainingRules
    .map((tr) => {
      return `<div class="field-row" style="border-bottom:1px solid #1e293b;padding:4px 0;">
        <div>
          <strong style="color:#4ade80;">${tr.name}</strong>
          <div style="font-size:10px;color:#94a3b8;">비용: ฿${tr.costBerries} / ${tr.costTrainingPoints} TP — ${tr.description}</div>
        </div>
        <button data-train-id="${tr.id}">수련</button>
      </div>`;
    })
    .join('');

  const cookUnlocked =
    campaign.unlockedCrewRoles.includes('COOK') &&
    Boolean(campaign.assignedCrewRoles.COOK);
  const cookCd = Math.ceil(campaign.shipboardCookingCooldownSec ?? 0);

  const strawHatTen: { id: string; label: string }[] = [
    { id: 'luffy', label: '루피(선장)' },
    { id: 'zoro', label: '조로(검사)' },
    { id: 'nami', label: '나미(항해사)' },
    { id: 'usopp', label: '우솝(저격수)' },
    { id: 'sanji', label: '상디(요리사)' },
    { id: 'chopper', label: '쵸파(선의)' },
    { id: 'robin', label: '로빈(고고학자)' },
    { id: 'franky', label: '프랑키(조선공)' },
    { id: 'brook', label: '브룩(음악가)' },
    { id: 'jinbe', label: '징베(조타수)' }
  ];
  const joinedStrawHats = strawHatTen.filter((m) =>
    campaign.recruitedUnitIds.includes(m.id)
  );
  const strawHatBadgesHtml = strawHatTen
    .map((m) => {
      const has = campaign.recruitedUnitIds.includes(m.id);
      const inParty = campaign.activePartyUnitIds.includes(m.id);
      const actionAttr = has ? `data-toggle-party-unit="${m.id}"` : 'disabled';
      const statusLabel = !has ? '미영입' : inParty ? '✓ 출전 중' : '+ 대기';
      return `<button type="button" ${actionAttr} style="padding:3px 7px;border-radius:4px;font-size:10px;border:1px solid ${
        inParty ? '#38bdf8' : has ? '#4ade80' : '#334155'
      };background:${
        inParty ? 'rgba(14,165,233,0.28)' : has ? 'rgba(22,163,74,0.18)' : '#0f172a'
      };color:${inParty ? '#bae6fd' : has ? '#86efac' : '#64748b'};cursor:${
        has ? 'pointer' : 'default'
      };">${m.label} [${statusLabel}]</button>`;
    })
    .join('');

  const poneglyphItems = [
    {
      label: '토트랜드 로드 포네그리프 (빅 맘 · 카타쿠리)',
      done: campaign.completedEpisodes.includes('ep_totto_land')
    },
    {
      label: '와노쿠니 로드 포네그리프 (카이도)',
      done: campaign.completedEpisodes.includes('ep_wano')
    },
    {
      label: '어인섬 바다의 숲 석비 (징베 합류)',
      done: campaign.completedEpisodes.includes('ep_fishman_island')
    },
    {
      label: '엘바프 최종장 마지막 단서 (로키)',
      done: campaign.completedEpisodes.includes('ep_elbaf')
    }
  ];
  const poneglyphHtml = poneglyphItems
    .map(
      (p) =>
        `<div style="font-size:10px;color:${p.done ? '#fca5a5' : '#64748b'};">${
          p.done ? '🟥 [확보 완료]' : '⬜ [미확보]'
        } ${p.label}</div>`
    )
    .join('');

  campModalEl.innerHTML = `
    <div class="modal-box" role="dialog" aria-label="선원 직책 및 패기 수련 캠프">
      <div class="field-row">
        <h3 style="color:#fde047;font-size:15px;">🏕 동료 관리 & 패기 수련</h3>
        <button id="btn-close-camp-top">닫기</button>
      </div>
      <div style="font-size:12px;color:#38bdf8;background:#162032;padding:6px 10px;border-radius:6px;">
        💰 베리: <strong>฿ ${campaign.berries.toLocaleString()}</strong> &nbsp;|&nbsp;
        ⚡ 수련 포인트: <strong>${campaign.trainingPoints} TP</strong> &nbsp;|&nbsp;
        🏆 콜로세움: <strong style="color:#facc15;">${campaign.endgame.colosseum.cp} CP</strong>
      </div>

      <div class="slot-card" style="background:#1e293b;border-color:#f97316;">
        <div class="field-row">
          <div>
            <strong style="color:#fb923c;">🍳 상디의 선상 요리</strong>
            <div style="font-size:11px;color:#cbd5e1;">파티 전원 HP +50% 회복 & 다음 전투 공격력 +10% 상승 (무료 · 쿨타임 30초)</div>
          </div>
          <button id="btn-shipboard-cook" class="btn-tab-active" ${!cookUnlocked || cookCd > 0 ? 'disabled' : ''}>
            ${!cookUnlocked ? '상디 합류 후 해금' : cookCd > 0 ? `준비 중 (${cookCd}초)` : '🍳 요리하기'}
          </button>
        </div>
      </div>

      <div class="slot-card" style="background:#0f172a;border-color:#38bdf8;">
        <h4 style="color:#38bdf8;font-size:13px;">⚔ 패기 & 악마의 열매 각성 수련</h4>
        ${trainingHtml}
      </div>

      <div class="slot-card" style="background:#0f172a;border-color:#4ade80;">
        <div class="field-row" style="margin-bottom:4px;">
          <strong style="color:#4ade80;font-size:12px;">🏴‍☠️ 출전 파티 편성 (${campaign.activePartyUnitIds.length} / 4명 · 영입 ${joinedStrawHats.length}명)</strong>
          <span style="font-size:10px;color:#94a3b8;">클릭 시 동적 GPU 번들 즉시 동기화</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">${strawHatBadgesHtml}</div>
      </div>

      <details class="slot-card">
        <summary style="cursor:pointer;color:#fde047;font-size:12px;font-weight:700;">
          🧭 선원 직책 효과 (${Object.keys(campaign.assignedCrewRoles).length}종 배치 중) & 로드 포네그리프 (${campaign.roadPoneglyphCount}/4) 보기
        </summary>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
          <div id="camp-wanted-poster-frame-card" style="padding:6px 8px;border-radius:4px;background:#1c1917;border:1.5px solid ${
            campaign.endgame.colosseum.posterFrameTier === 'diamond'
              ? '#38bdf8'
              : campaign.endgame.colosseum.posterFrameTier === 'platinum'
                ? '#cbd5e1'
                : campaign.endgame.colosseum.posterFrameTier === 'gold'
                  ? '#eab308'
                  : '#78350f'
          };">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
              <strong style="color:#fde047;font-size:11px;">📜 수배서 테두리: [${campaign.endgame.colosseum.posterFrameTier.toUpperCase()}]</strong>
              <span style="font-size:10px;color:#cbd5e1;">총 현상금: ฿ ${campaign.totalCrewBounty.toLocaleString()} | 임펠 다운 최고: Level ${campaign.endgame.impelDown.highestFloor}</span>
            </div>
          </div>
          <div>
            <strong style="color:#f87171;font-size:12px;">🟥 로드 포네그리프 수집 (${campaign.roadPoneglyphCount} / 4)</strong>
            <div style="margin-top:4px;">${poneglyphHtml}</div>
          </div>
          <div>
            <strong style="color:#38bdf8;font-size:12px;">⚓ 선원 직책 패시브 설정</strong>
            <div style="margin-top:4px;">${rolesHtml}</div>
          </div>
        </div>
      </details>

      <div style="display:flex;justify-content:flex-end;margin-top:4px;">
        <button id="btn-close-camp" class="btn-tab-active">닫기</button>
      </div>
    </div>
  `;

  campModalEl.classList.add('open');

  const closeCamp = () => {
    campModalEl.classList.remove('open');
  };
  campModalEl.querySelector('#btn-close-camp')?.addEventListener('click', closeCamp);
  campModalEl.querySelector('#btn-close-camp-top')?.addEventListener('click', closeCamp);

  campModalEl.querySelector('#btn-shipboard-cook')?.addEventListener('click', () => {
    const res = executeShipboardCooking(campaign);
    if (res.success) {
      audio.playSfx('FORM_SHIFT');
      void triggerAutoSave('선상 요리');
    }
    renderCrewCampModal(ctx);
    refreshSideDrawer();
  });

  campModalEl
    .querySelectorAll<HTMLButtonElement>('[data-assign-role]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const rId = btn.dataset.assignRole as CrewRoleId;
        const rDef = rpgRegistry.crewRoles[rId];
        assignCrewRole(
          campaign,
          rId,
          rDef?.defaultHolderName ?? rId,
          rpgRegistry
        );
        void triggerAutoSave('직책 변경');
        ctx.onPartyOrCrewChanged?.();
        renderCrewCampModal(ctx);
        refreshSideDrawer();
      });
    });

  campModalEl
    .querySelectorAll<HTMLButtonElement>('[data-train-id]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const tId = btn.dataset.trainId!;
        const leaderId = campaign.activePartyUnitIds[0] ?? 'luffy';
        const res = purchaseTrainingUpgrade(
          campaign,
          leaderId,
          tId,
          rpgRegistry
        );
        if (res.success) {
          void triggerAutoSave('패기/각성 수련');
        }
        renderCrewCampModal(ctx);
        refreshSideDrawer();
      });
    });

  campModalEl
    .querySelectorAll<HTMLButtonElement>('[data-toggle-party-unit]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const unitId = btn.dataset.togglePartyUnit;
        if (!unitId) return;
        const idx = campaign.activePartyUnitIds.indexOf(unitId);
        if (idx >= 0) {
          if (campaign.activePartyUnitIds.length <= 1) return;
          campaign.activePartyUnitIds.splice(idx, 1);
        } else {
          if (campaign.activePartyUnitIds.length >= 4) {
            campaign.activePartyUnitIds.pop();
          }
          campaign.activePartyUnitIds.push(unitId);
        }
        audio.playSfx('UI_CLICK');
        void triggerAutoSave('파티 편성 변경');
        ctx.onPartyOrCrewChanged?.();
        renderCrewCampModal(ctx);
        refreshSideDrawer();
      });
    });
}
