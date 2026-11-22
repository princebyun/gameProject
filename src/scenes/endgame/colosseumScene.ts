import { getActivePlayerColosseumMatch } from '../../core/endgame/colosseum';
import type {
  ColosseumTierId,
  ColosseumTournamentState,
  EndgameDataRegistry
} from '../../core/endgame/types';
import type { GameDataRegistry } from '../../core/types/dataSchemas';
import type { RpgCampaignState } from '../../core/types/rpgSchemas';
import { renderColosseumBracketCanvas } from '../../render/colosseumBracketRenderer';

export interface ColosseumSceneCallbacks {
  onCreateTournament: (
    tierId: ColosseumTierId,
    playerUnitId: string,
    ringOutEnabled: boolean
  ) => void;
  onStartNextMatch: (tournament: ColosseumTournamentState) => void;
  onResetTournament: () => void;
  onPurchaseTutorMove: (unitId: string, moveId: string, slotIndex: number) => void;
  onClose: () => void;
}

export function renderColosseumModal(
  container: HTMLElement,
  activeTournament: ColosseumTournamentState | null,
  activeTab: 'TOURNAMENT' | 'TUTOR',
  selectedTutorUnitId: string,
  noticeText: string | null,
  campaign: RpgCampaignState,
  gameReg: GameDataRegistry,
  endgameReg: EndgameDataRegistry,
  callbacks: ColosseumSceneCallbacks,
  onSwitchTab: (tab: 'TOURNAMENT' | 'TUTOR', unitId?: string) => void
): void {
  const colo = campaign.endgame.colosseum;
  const recruited =
    campaign.recruitedUnitIds.length > 0 ? campaign.recruitedUnitIds : ['luffy'];
  const currentUnitId = recruited.includes(selectedTutorUnitId)
    ? selectedTutorUnitId
    : (recruited[0] ?? 'luffy');

  let mainSectionHtml = '';

  if (activeTab === 'TUTOR') {
    const unitOptions = recruited
      .map((uid) => {
        const u = gameReg.units[uid];
        return `<option value="${uid}" ${uid === currentUnitId ? 'selected' : ''}>${u?.name ?? uid}</option>`;
      })
      .join('');

    const learned = colo.tutoredMovesMap[currentUnitId] ?? [];
    const currentDef = gameReg.units[currentUnitId];
    const currentMoves =
      campaign.unitEquippedMovesOverrides?.[currentUnitId] ??
      currentDef?.defaultMoves ??
      [];
    const slotOptions = currentMoves
      .slice(0, 4)
      .map((mId: string, idx: number) => {
        const m = gameReg.moves[mId];
        return `<option value="${idx}">슬롯 ${idx + 1}: ${m?.name ?? mId}</option>`;
      })
      .join('');

    const tutorCards = Object.values(endgameReg.tutorMoves)
      .map((tm) => {
        const isLearned = learned.includes(tm.moveId);
        const canAfford = colo.cp >= tm.costCp;
        const tierCol =
          tm.tier === 'HIGH' ? '#f43f5e' : tm.tier === 'MID' ? '#facc15' : '#38bdf8';
        return `
          <div style="background:#0f172a;border:1px solid ${isLearned ? '#22c55e' : '#334155'};border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:4px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
              <strong style="font-size:12px;color:#f8fafc;">${tm.name}</strong>
              <span style="font-size:10px;color:${tierCol};font-weight:bold;">${tm.tier} · ${tm.costCp} CP</span>
            </div>
            <div style="font-size:10px;color:#94a3b8;flex:1;">${tm.description}</div>
            <button class="btn-buy-tutor-move ${isLearned || canAfford ? 'btn-tab-active' : ''}" data-move-id="${tm.moveId}" ${!isLearned && !canAfford ? 'disabled' : ''}>
              ${isLearned ? '✅ 습득됨 — 선택 슬롯에 장착' : `📘 전수받기 (${tm.costCp} CP)`}
            </button>
          </div>
        `;
      })
      .join('');

    mainSectionHtml = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px;font-size:11px;">
        <label>대상 캐릭터: <select id="sel-tutor-unit">${unitOptions}</select></label>
        <label>장착 슬롯: <select id="sel-tutor-slot">${slotOptions}</select></label>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;max-height:290px;overflow-y:auto;">
        ${tutorCards}
      </div>
    `;
  } else if (!activeTournament) {
    const leagueCards = endgameReg.colosseum.leagues
      .map((l) => {
        const cleared = colo.clearedTiers.includes(l.tierId);
        const cpReward = Math.round(l.baseCpReward * l.rewardMultiplier);
        return `
          <div style="background:#0f172a;border:1px solid ${cleared ? '#eab308' : '#334155'};border-radius:6px;padding:8px;">
            <div style="font-weight:bold;color:#fde047;font-size:13px;">${l.name} ${cleared ? '🏆' : ''}</div>
            <div style="font-size:10px;color:#cbd5e1;margin:3px 0;">${l.subtitle}</div>
            <div style="font-size:10px;color:#94a3b8;margin-bottom:6px;">
              AI Lv.${l.aiLevel} | 배율 ×${l.rewardMultiplier} | 우승 보상: <strong style="color:#4ade80;">+${cpReward} CP</strong>
            </div>
            <button class="btn-start-colo-league btn-tab-active" data-tier="${l.tierId}">⚔ ${l.tierId}급 8강 출전</button>
          </div>
        `;
      })
      .join('');

    const fighterOptions = recruited
      .map((uid) => {
        const u = gameReg.units[uid];
        return `<option value="${uid}" ${uid === currentUnitId ? 'selected' : ''}>${u?.name ?? uid}</option>`;
      })
      .join('');

    mainSectionHtml = `
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px;font-size:11px;">
        <label>출전 선수: <select id="sel-colo-fighter">${fighterOptions}</select></label>
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:#7dd3fc;">
          <input type="checkbox" id="chk-colo-ringout" checked />
          🌊 콜로세움 링아웃 규칙 (외곽 해자 2초 초과 탈락)
        </label>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(195px,1fr));gap:8px;">
        ${leagueCards}
      </div>
    `;
  } else {
    const nextMatch = getActivePlayerColosseumMatch(activeTournament);
    const opponent = nextMatch
      ? nextMatch.participantA?.isPlayer
        ? nextMatch.participantB
        : nextMatch.participantA
      : null;

    mainSectionHtml = `
      <div style="display:flex;justify-content:center;margin-bottom:8px;overflow-x:auto;">
        <canvas id="colosseum-bracket-canvas" width="600" height="290" style="width:100%;max-width:600px;height:auto;border-radius:6px;"></canvas>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
        <div style="font-size:11px;color:#e2e8f0;">
          ${
            activeTournament.currentRound === 'COMPLETE'
              ? activeTournament.champion?.isPlayer
                ? `🏆 <strong>${activeTournament.tierId}급 토너먼트 최종 우승!!</strong> (보상 지급 완료)`
                : `💀 탈락했습니다. 최종 우승: ${activeTournament.champion?.displayName ?? 'CPU'}`
              : `다음 경기 [${activeTournament.currentRound}]: <strong>${opponent?.displayName ?? '상대'}</strong>`
          }
        </div>
        <div style="display:flex;gap:8px;">
          ${
            nextMatch
              ? `<button id="btn-colo-next-match" class="btn-tab-active">⚔ ${activeTournament.currentRound} 경기 출전!</button>`
              : `<button id="btn-colo-new-bracket" class="btn-tab-active">🔄 새 리그 선택</button>`
          }
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="modal-box endgame-modal-box" role="dialog" aria-label="코리다 콜로세움">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
        <h2 style="margin:0;color:#fde047;font-size:16px;">🏟 코리다 콜로세움 — 토너먼트 &amp; 기술 전수 교관</h2>
        <button id="btn-colo-close">닫기</button>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;font-size:11px;background:#0f172a;padding:6px 10px;border-radius:6px;border:1px solid #334155;">
        <div>
          보유 CP: <strong style="color:#facc15;">${colo.cp} CP</strong> |
          수배서 프레임: <strong style="color:#38bdf8;">${colo.posterFrameTier.toUpperCase()}</strong> |
          제패 리그: <strong>${colo.clearedTiers.length > 0 ? colo.clearedTiers.join(', ') : '없음'}</strong>
        </div>
        <div style="display:flex;gap:6px;">
          <button id="btn-colo-tab-tourney" class="${activeTab === 'TOURNAMENT' ? 'btn-tab-active' : ''}">🏆 8강 토너먼트</button>
          <button id="btn-colo-tab-tutor" class="${activeTab === 'TUTOR' ? 'btn-tab-active' : ''}">📘 기술 전수 교관</button>
        </div>
      </div>
      ${noticeText ? `<div style="font-size:11px;color:#4ade80;margin-bottom:6px;padding:5px 8px;background:rgba(22,163,74,0.18);border:1px solid #22c55e;border-radius:4px;">${noticeText}</div>` : ''}
      ${mainSectionHtml}
    </div>
  `;

  container.classList.add('open');

  const bracketCanvas = container.querySelector<HTMLCanvasElement>(
    '#colosseum-bracket-canvas'
  );
  if (bracketCanvas && activeTournament) {
    renderColosseumBracketCanvas(bracketCanvas, activeTournament);
  }

  container
    .querySelector('#btn-colo-close')
    ?.addEventListener('click', () => callbacks.onClose());
  container
    .querySelector('#btn-colo-tab-tourney')
    ?.addEventListener('click', () => onSwitchTab('TOURNAMENT', currentUnitId));
  container
    .querySelector('#btn-colo-tab-tutor')
    ?.addEventListener('click', () => onSwitchTab('TUTOR', currentUnitId));

  container
    .querySelector('#sel-tutor-unit')
    ?.addEventListener('change', (ev) => {
      const nextUid = (ev.target as HTMLSelectElement).value;
      onSwitchTab('TUTOR', nextUid);
    });

  container.querySelectorAll<HTMLButtonElement>('.btn-buy-tutor-move').forEach((btn) => {
    btn.addEventListener('click', () => {
      const moveId = btn.dataset.moveId;
      const slotSel = container.querySelector<HTMLSelectElement>('#sel-tutor-slot');
      const slotIdx = slotSel ? Number(slotSel.value) : 3;
      if (moveId) {
        callbacks.onPurchaseTutorMove(currentUnitId, moveId, slotIdx);
      }
    });
  });

  container.querySelectorAll<HTMLButtonElement>('.btn-start-colo-league').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tier = btn.dataset.tier as ColosseumTierId;
      const fighterSel = container.querySelector<HTMLSelectElement>('#sel-colo-fighter');
      const ringChk = container.querySelector<HTMLInputElement>('#chk-colo-ringout');
      callbacks.onCreateTournament(
        tier,
        fighterSel?.value ?? currentUnitId,
        Boolean(ringChk?.checked)
      );
    });
  });

  container
    .querySelector('#btn-colo-next-match')
    ?.addEventListener('click', () => {
      if (activeTournament) callbacks.onStartNextMatch(activeTournament);
    });
  container
    .querySelector('#btn-colo-new-bracket')
    ?.addEventListener('click', () => callbacks.onResetTournament());
}
