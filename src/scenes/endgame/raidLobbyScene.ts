import { isRaidUnlocked } from '../../core/endgame/raid';
import type { EndgameDataRegistry } from '../../core/endgame/types';
import type { GameDataRegistry } from '../../core/types/dataSchemas';
import type { RpgCampaignState } from '../../core/types/rpgSchemas';

export interface RaidLobbySceneCallbacks {
  onStartOfflineRaid: (raidId: string, squadUnitIds: string[]) => void;
  onOpenOnlineCoopRaid: (raidId: string) => void;
  onEquipRelic: (unitId: string, relicId: string | null) => void;
  onClose: () => void;
}

export function renderRaidLobbyModal(
  container: HTMLElement,
  selectedRaidId: string,
  selectedRelicUnitId: string,
  noticeText: string | null,
  campaign: RpgCampaignState,
  gameReg: GameDataRegistry,
  endgameReg: EndgameDataRegistry,
  callbacks: RaidLobbySceneCallbacks,
  onSelectState: (raidId: string, relicUnitId: string) => void
): void {
  const raidsList = Object.values(endgameReg.raids);
  const activeRaid = endgameReg.raids[selectedRaidId] ?? raidsList[0];
  const recruited =
    campaign.recruitedUnitIds.length > 0 ? campaign.recruitedUnitIds : ['luffy'];
  const currentRelicUnit = recruited.includes(selectedRelicUnitId)
    ? selectedRelicUnitId
    : recruited[0];
  const raidsProgress = campaign.endgame.raids;

  const bossCardsHtml = raidsList
    .map((r) => {
      const unlocked = isRaidUnlocked(r.raidId, campaign, endgameReg);
      const cleared = raidsProgress.clearedRaidIds.includes(r.raidId);
      const bestSec = raidsProgress.bestClearTimeSecMap[r.raidId];
      const relic = endgameReg.raidRelics[r.rewardRelicId];
      const selected = r.raidId === activeRaid.raidId;
      return `
        <div class="raid-boss-card" data-raid-id="${r.raidId}" style="cursor:pointer;background:${
          selected ? 'rgba(185,28,28,0.25)' : '#0f172a'
        };border:1.5px solid ${selected ? '#facc15' : cleared ? '#22c55e' : '#334155'};border-radius:8px;padding:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
            <strong style="font-size:13px;color:#fca5a5;">${r.name}</strong>
            <span style="font-size:10px;color:#fde047;">Scale ${r.entityScale}x</span>
          </div>
          <div style="font-size:10px;color:#cbd5e1;margin:3px 0;">${r.subtitle}</div>
          <div style="font-size:10px;color:#94a3b8;">
            브레이크: ${r.breakGaugeMax} | 부활: ${r.teamRevivesMax}회 | 보상 유물: <strong>${relic?.icon ?? ''} ${relic?.name ?? r.rewardRelicId}</strong>
          </div>
          <div style="font-size:10px;margin-top:4px;color:${cleared ? '#4ade80' : unlocked ? '#38bdf8' : '#f43f5e'};">
            ${
              cleared
                ? `✅ 토벌 완료 (최고 ${bestSec ?? '-'}s)`
                : unlocked
                  ? '🟢 출격 가능'
                  : `🔒 ${r.requiredEpisodeId} 완료 필요`
            }
          </div>
        </div>
      `;
    })
    .join('');

  const defaultSquad = campaign.activePartyUnitIds.slice(0, 3);
  const squadChecks = recruited
    .map((uid) => {
      const u = gameReg.units[uid];
      const checked = defaultSquad.includes(uid) ? 'checked' : '';
      return `
        <label style="display:flex;align-items:center;gap:5px;padding:4px 7px;background:#0f172a;border:1px solid #334155;border-radius:5px;font-size:11px;cursor:pointer;">
          <input type="checkbox" class="raid-squad-chk" value="${uid}" ${checked} />
          <span>${u?.name ?? uid}</span>
        </label>
      `;
    })
    .join('');

  const unitOptions = recruited
    .map((uid) => {
      const u = gameReg.units[uid];
      const eqRelic = raidsProgress.equippedRelicMap[uid];
      const eqName = eqRelic ? endgameReg.raidRelics[eqRelic]?.name : null;
      return `<option value="${uid}" ${uid === currentRelicUnit ? 'selected' : ''}>${u?.name ?? uid}${eqName ? ` [${eqName}]` : ''}</option>`;
    })
    .join('');

  const equippedRelicId = raidsProgress.equippedRelicMap[currentRelicUnit] ?? '';
  const relicCardsHtml = Object.values(endgameReg.raidRelics)
    .map((rel) => {
      const unlocked = raidsProgress.unlockedRelicIds.includes(rel.relicId);
      const isEquipped = equippedRelicId === rel.relicId;
      return `
        <div style="background:#0f172a;border:1px solid ${isEquipped ? '#facc15' : unlocked ? '#38bdf8' : '#334155'};border-radius:6px;padding:7px;font-size:10px;">
          <div style="font-weight:bold;color:#f8fafc;font-size:11px;">${rel.icon} ${rel.name}</div>
          <div style="color:#94a3b8;margin:3px 0;">${rel.description}</div>
          <button class="btn-equip-raid-relic ${unlocked ? 'btn-tab-active' : ''}" data-relic-id="${rel.relicId}" ${unlocked ? '' : 'disabled'}>
            ${isEquipped ? '✅ 장착 해제' : unlocked ? '장착하기' : '🔒 레이드 토벌 해금'}
          </button>
        </div>
      `;
    })
    .join('');

  const activeUnlocked = isRaidUnlocked(activeRaid.raidId, campaign, endgameReg);

  container.innerHTML = `
    <div class="modal-box endgame-modal-box" role="dialog" aria-label="거대 보스 협동 레이드">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h2 style="margin:0;color:#fca5a5;font-size:16px;">🐉 오로성·사황 거대 보스 협동 레이드</h2>
        <button id="btn-raid-close">닫기</button>
      </div>
      ${noticeText ? `<div style="font-size:11px;color:#4ade80;margin-bottom:6px;padding:5px 8px;background:rgba(22,163,74,0.18);border:1px solid #22c55e;border-radius:4px;">${noticeText}</div>` : ''}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-bottom:10px;">
        ${bossCardsHtml}
      </div>

      <div style="background:#111827;border:1px solid #334155;border-radius:6px;padding:8px;margin-bottom:10px;">
        <div style="font-size:11px;font-weight:bold;color:#fde047;margin-bottom:5px;">오프라인 3인 협동 스쿼드 선택 (빈자리는 동료 AI 자동 충원 / 전투 중 태그 전환):</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;">${squadChecks}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
          <button id="btn-start-offline-raid" class="btn-tab-active" ${activeUnlocked ? '' : 'disabled'}>
            ⚔ 오프라인 3인 레이드 출격 (${activeRaid.name})
          </button>
          <button id="btn-open-online-raid" style="background:#581c87;border-color:#c084fc;color:#f3e8ff;" ${activeUnlocked ? '' : 'disabled'}>
            🌐 온라인 2~3인 협동 레이드 (Co-op Raid)
          </button>
        </div>
      </div>

      <div style="background:#111827;border:1px solid #334155;border-radius:6px;padding:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
          <strong style="font-size:12px;color:#38bdf8;">🧿 장착형 레이드 유물 (캐릭터당 1개)</strong>
          <label style="font-size:11px;">캐릭터: <select id="sel-raid-relic-unit">${unitOptions}</select></label>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:6px;">
          ${relicCardsHtml}
        </div>
      </div>
    </div>
  `;

  container.classList.add('open');

  container
    .querySelector('#btn-raid-close')
    ?.addEventListener('click', () => callbacks.onClose());

  container.querySelectorAll<HTMLElement>('.raid-boss-card').forEach((card) => {
    card.addEventListener('click', () => {
      const rId = card.dataset.raidId;
      if (rId) onSelectState(rId, currentRelicUnit);
    });
  });

  container
    .querySelector('#sel-raid-relic-unit')
    ?.addEventListener('change', (ev) => {
      onSelectState(activeRaid.raidId, (ev.target as HTMLSelectElement).value);
    });

  container
    .querySelector('#btn-start-offline-raid')
    ?.addEventListener('click', () => {
      const checked = Array.from(
        container.querySelectorAll<HTMLInputElement>('.raid-squad-chk:checked')
      )
        .map((el) => el.value)
        .slice(0, 3);
      callbacks.onStartOfflineRaid(activeRaid.raidId, checked);
    });

  container
    .querySelector('#btn-open-online-raid')
    ?.addEventListener('click', () => {
      callbacks.onOpenOnlineCoopRaid(activeRaid.raidId);
    });

  container.querySelectorAll<HTMLButtonElement>('.btn-equip-raid-relic').forEach((btn) => {
    btn.addEventListener('click', () => {
      const relId = btn.dataset.relicId;
      if (!relId) return;
      callbacks.onEquipRelic(
        currentRelicUnit,
        equippedRelicId === relId ? null : relId
      );
    });
  });
}
