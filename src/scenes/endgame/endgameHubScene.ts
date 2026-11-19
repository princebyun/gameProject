import { isColosseumUnlocked } from '../../core/endgame/colosseum';
import { isImpelDownUnlocked } from '../../core/endgame/impelDown';
import type { EndgameDataRegistry } from '../../core/endgame/types';
import type { RpgCampaignState } from '../../core/types/rpgSchemas';

export interface EndgameHubCallbacks {
  onOpenImpelDown: () => void;
  onOpenColosseum: () => void;
  onOpenRaidLobby: () => void;
  onToggleDebugUnlock: (enabled: boolean) => void;
  onClose: () => void;
}

export function renderEndgameHubModal(
  container: HTMLElement,
  campaign: RpgCampaignState,
  endgameReg: EndgameDataRegistry,
  callbacks: EndgameHubCallbacks
): void {
  const impelUnlocked = isImpelDownUnlocked(campaign, endgameReg);
  const coloUnlocked = isColosseumUnlocked(campaign, endgameReg);
  const raidUnlocked =
    Boolean(campaign.debugUnlockEndgame) ||
    campaign.completedEpisodes.includes('ep_egghead');

  const eg = campaign.endgame;
  const frameColors: Record<string, string> = {
    default: '#92400e',
    gold: '#eab308',
    platinum: '#cbd5e1',
    diamond: '#38bdf8'
  };

  container.innerHTML = `
    <div class="modal-box endgame-modal-box" role="dialog" aria-label="엔드게임 허브">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
        <h2 style="margin:0;color:#facc15;font-size:17px;">🏆 엔드게임 허브 (Stage 3 반복 콘텐츠)</h2>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:#fda4af;cursor:pointer;background:rgba(190,18,60,0.2);padding:4px 8px;border-radius:4px;border:1px solid #f43f5e;">
            <input type="checkbox" id="chk-endgame-debug-unlock" ${campaign.debugUnlockEndgame ? 'checked' : ''} />
            Debug 즉시 해금
          </label>
          <button id="btn-close-endgame-hub">닫기</button>
        </div>
      </div>

      <div class="endgame-card-grid">
        <div class="endgame-mode-card" style="border-color:#a855f7;">
          <div style="font-weight:bold;color:#d8b4fe;font-size:14px;">⛓️ 임펠 다운 6층 로그라이트 서바이벌</div>
          <div style="font-size:11px;color:#cbd5e1;margin:6px 0;">
            1~6층 지옥 환경 기믹 · HP/PP 계승 · 3택 유물 버프 드래프트 · 서장 마젤란 &amp; 무한 심층(7층+)
          </div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:8px;">
            최고 도달: <strong style="color:#fde047;">Level ${eg.impelDown.highestFloor}</strong>
            ${eg.impelDown.activeRun ? ` | <span style="color:#4ade80;">중단 런 보유 (L${eg.impelDown.activeRun.currentFloor})</span>` : ''}
          </div>
          <button id="btn-enter-impel-down" class="${impelUnlocked ? 'btn-tab-active' : ''}" ${impelUnlocked ? '' : 'disabled'}>
            ${impelUnlocked ? '🔥 임펠 다운 입장' : '🔒 ep_marineford 완료 필요'}
          </button>
        </div>

        <div class="endgame-mode-card" style="border-color:#eab308;">
          <div style="font-weight:bold;color:#fde047;font-size:14px;">🏟 코리다 콜로세움 8강 토너먼트</div>
          <div style="font-size:11px;color:#cbd5e1;margin:6px 0;">
            C~S급 8강 대진표 · 링아웃 해자 결투 · CP 기술 전수 교관 · 수배서 테두리 승급
          </div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:8px;">
            보유 CP: <strong style="color:#facc15;">${eg.colosseum.cp} CP</strong> |
            수배서 프레임: <strong style="color:${frameColors[eg.colosseum.posterFrameTier] ?? '#fff'};">${eg.colosseum.posterFrameTier.toUpperCase()}</strong>
          </div>
          <button id="btn-enter-colosseum" class="${coloUnlocked ? 'btn-tab-active' : ''}" ${coloUnlocked ? '' : 'disabled'}>
            ${coloUnlocked ? '⚔ 콜로세움 & 전수 교관 입장' : '🔒 ep_dressrosa 완료 필요'}
          </button>
        </div>

        <div class="endgame-mode-card" style="border-color:#ef4444;">
          <div style="font-weight:bold;color:#fca5a5;font-size:14px;">🐉 오로성·사황 거대 보스 협동 레이드</div>
          <div style="font-size:11px;color:#cbd5e1;margin:6px 0;">
            오프라인 3인 / 온라인 2~3인 협동 · 브레이크 게이지 · 예고선 · DPS 체크 · 팀 구조 부활 · 레이드 유물
          </div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:8px;">
            토벌 보스: <strong style="color:#4ade80;">${eg.raids.clearedRaidIds.length}/3</strong> |
            해금 유물: <strong style="color:#38bdf8;">${eg.raids.unlockedRelicIds.length}종</strong>
          </div>
          <button id="btn-enter-raid-lobby" class="${raidUnlocked ? 'btn-tab-active' : ''}" ${raidUnlocked ? '' : 'disabled'}>
            ${raidUnlocked ? '🤝 거대 보스 레이드 입장' : '🔒 ep_egghead 완료 필요'}
          </button>
        </div>
      </div>
    </div>
  `;

  container.classList.add('open');

  container
    .querySelector('#btn-close-endgame-hub')
    ?.addEventListener('click', () => callbacks.onClose());
  container
    .querySelector('#chk-endgame-debug-unlock')
    ?.addEventListener('change', (ev) => {
      const checked = (ev.target as HTMLInputElement).checked;
      callbacks.onToggleDebugUnlock(checked);
    });
  container
    .querySelector('#btn-enter-impel-down')
    ?.addEventListener('click', () => callbacks.onOpenImpelDown());
  container
    .querySelector('#btn-enter-colosseum')
    ?.addEventListener('click', () => callbacks.onOpenColosseum());
  container
    .querySelector('#btn-enter-raid-lobby')
    ?.addEventListener('click', () => callbacks.onOpenRaidLobby());
}
