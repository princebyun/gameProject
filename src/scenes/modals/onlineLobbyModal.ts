import { BATTLE_CALC_VERSION } from '../../core/constants';
import type { EndgameDataRegistry } from '../../core/endgame/types';
import type {
  OnlineRosterPayload,
  PartyRuleMode,
  RoomStateSnapshot
} from '../../core/net/protocol';
import type { NetworkTransport } from '../../core/net/transport';
import { canEnterOnlineBattle } from '../../core/save/antiCheat';
import type { SaveEnvelope, SaveSlotId } from '../../core/save/schema';
import type { GameDataRegistry } from '../../core/types/dataSchemas';
import type { RpgCampaignState, RpgDataRegistry } from '../../core/types/rpgSchemas';

export interface OnlineLobbyModalContext {
  onlineModalEl: HTMLElement;
  campaign: RpgCampaignState;
  rpgRegistry: RpgDataRegistry;
  gameRegistry: GameDataRegistry;
  endgameRegistry: EndgameDataRegistry;
  getCurrentRoomState: () => RoomStateSnapshot | null;
  setCurrentRoomState: (room: RoomStateSnapshot | null) => void;
  getOnlineAssignedRole: () => 'PLAYER' | 'SPECTATOR';
  setOnlineAssignedRole: (role: 'PLAYER' | 'SPECTATOR') => void;
  getOnlineErrorNotice: () => string | null;
  setOnlineErrorNotice: (msg: string | null) => void;
  getIsTerminalOnlineMatch: () => boolean;
  getOnlineLobbyDefaultMode: () => '1V1' | '2V2' | 'COOP_RAID';
  getSelectedRaidId: () => string;
  getActiveTransport: () => NetworkTransport | null;
  ensureOnlineTransportConnected: (preferWebSocket?: boolean) => Promise<NetworkTransport>;
  buildCurrentSaveEnvelope: (slotId: SaveSlotId) => SaveEnvelope;
  buildOnlineRosterPayload: (partyRule: PartyRuleMode) => OnlineRosterPayload;
}

export function createOnlineLobbyModalElement(): HTMLElement {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.id = 'online-lobby-modal';
  return modal;
}

export function renderOnlineLobbyModalContents(ctx: OnlineLobbyModalContext): void {
  const {
    onlineModalEl,
    campaign,
    rpgRegistry,
    gameRegistry,
    endgameRegistry
  } = ctx;

  const currentSaveEnv = ctx.buildCurrentSaveEnvelope('auto');
  const onlineEligibility = canEnterOnlineBattle(
    currentSaveEnv,
    rpgRegistry,
    gameRegistry
  );
  const activeTransport = ctx.getActiveTransport();
  const rttMs = activeTransport?.getRttMs() ?? 12;
  const currentRoomState = ctx.getCurrentRoomState();
  const assignedRole = ctx.getOnlineAssignedRole();
  const errorNotice = ctx.getOnlineErrorNotice();
  const defaultMode = ctx.getOnlineLobbyDefaultMode();
  const selectedRaidId = ctx.getSelectedRaidId();

  const unitSelectOptions = Object.keys(gameRegistry.units)
    .map((id) => {
      const u = gameRegistry.units[id];
      return `<option value="${id}">${u?.name ?? id}</option>`;
    })
    .join('');

  const waitingRoomHtml = currentRoomState
    ? `<div class="slot-card" style="border:2px solid #38bdf8;background:#0f172a;">
        <div class="field-row">
          <h4 style="color:#fde047;font-size:14px;">
            방 코드: <span id="lbl-room-code" style="color:#38bdf8;letter-spacing:2px;">${currentRoomState.roomCode}</span>
            (${currentRoomState.mode} / ${currentRoomState.partyRule === 'rpg_save' ? '내 세이브전' : '표준 프리셋전'})
          </h4>
          <div style="display:flex;gap:6px;">
            <button id="btn-copy-room-code" class="btn-showcase">📋 방 코드 복사</button>
            <button id="btn-leave-room" class="btn-danger">방 나가기</button>
          </div>
        </div>
        <div style="font-size:11px;color:#94a3b8;">
          내 역할: <strong style="color:#4ade80;">${assignedRole}</strong> |
          배틀 계산 버전: <strong>v${currentRoomState.battleCalcVersion}</strong> |
          Ping: <strong style="color:#38bdf8;">${rttMs} ms</strong>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px;">
          ${currentRoomState.slots
            .map((s) => {
              const isCpuOrEmpty = s.occupantType !== 'HUMAN';
              return `<div class="field-row" style="background:#162032;padding:6px;border-radius:4px;">
                <div>
                  <strong style="color:${s.team === 'ALPHA' ? '#38bdf8' : '#f43f5e'};">[P${s.slotIndex + 1}/${s.team}]</strong>
                  <span>${s.playerName}</span>
                  <span style="color:#4ade80;font-size:10px;">(${s.occupantType}${s.ready ? ' / READY' : ''})</span>
                </div>
                ${
                  isCpuOrEmpty
                    ? `<div style="display:flex;gap:4px;align-items:center;">
                        <select data-cpu-species="${s.slotIndex}">${unitSelectOptions}</select>
                        <select data-cpu-lv="${s.slotIndex}">
                          <option value="1">CPU Lv.1</option>
                          <option value="2">CPU Lv.2</option>
                          <option value="3">CPU Lv.3</option>
                          <option value="4" selected>CPU Lv.4</option>
                          <option value="5">CPU Lv.5</option>
                        </select>
                        <button data-toggle-cpu="${s.slotIndex}" class="btn-showcase">
                          ${s.occupantType === 'CPU' ? 'CPU 해제' : '🤖 CPU 채우기'}
                        </button>
                      </div>`
                    : `<span style="font-size:11px;color:#38bdf8;">Ping: ${s.pingMs}ms</span>`
                }
              </div>`;
            })
            .join('')}
        </div>

        <div style="font-size:11px;color:#e9d5ff;margin-top:4px;">
          🎥 관전자 (${currentRoomState.spectators.length}/4명): ${
            currentRoomState.spectators.map((sp) => sp.playerName).join(', ') || '없음'
          }
        </div>

        <div style="display:flex;justify-content:space-between;margin-top:8px;">
          <div style="display:flex;gap:6px;">
            <button id="btn-sim-add-spec" class="btn-showcase">👁 로컬 관전자 슬롯 전환</button>
          </div>
          <button id="btn-start-online-match" class="btn-tab-active">▶ 실시간 통신 대전 시작!</button>
        </div>
      </div>`
    : '';

  onlineModalEl.innerHTML = `
    <div class="modal-box" role="dialog" aria-label="실시간 통신 대전 로비">
      <div class="field-row">
        <h3 style="color:#c084fc;font-size:15px;">
          🌐 실시간 통신 대전 로비 ${
            ctx.getIsTerminalOnlineMatch()
              ? '(항구 대전 단말기 모드 — 회복 아이템 금지 & HP/PP 무손실)'
              : ''
          }
        </h3>
        <button id="btn-close-online-modal">닫기</button>
      </div>

      <div class="field-row" style="font-size:11px;background:#162032;padding:6px 10px;border-radius:4px;">
        <span>배틀 계산 버전: <strong style="color:#fde047;">v${BATTLE_CALC_VERSION}</strong></span>
        <span>통산 온라인 전적: <strong style="color:#4ade80;">${campaign.onlineStats.wins}승 ${campaign.onlineStats.losses}패 ${campaign.onlineStats.draws}무</strong></span>
        <span>Ping: <strong style="color:#38bdf8;">${rttMs} ms</strong></span>
      </div>

      <div style="font-size:11px;padding:6px 8px;border-radius:4px;background:${
        onlineEligibility.allowed ? 'rgba(22,163,74,0.18)' : 'rgba(185,28,28,0.28)'
      };color:${onlineEligibility.allowed ? '#4ade80' : '#fca5a5'};border:1px solid ${
        onlineEligibility.allowed ? '#22c55e' : '#ef4444'
      };">
        ${
          onlineEligibility.allowed
            ? '✓ 안티치트 검증 통과: [내 RPG 세이브 파티전 (rpg_save)] 및 [표준 프리셋 평등전] 모두 참가 가능합니다.'
            : `⚠ 안티치트 차단됨: ${onlineEligibility.reasons.join(' / ')} — [내 세이브 파티전] 생성 및 참가가 비활성화되었습니다.`
        }
      </div>

      ${
        errorNotice
          ? `<div style="background:#7f1d1d;border:1px solid #ef4444;color:#fecaca;padding:8px;border-radius:4px;font-size:11px;">
              ❌ ${errorNotice}
            </div>`
          : ''
      }

      ${waitingRoomHtml}

      <div class="slot-card">
        <h4 style="color:#38bdf8;font-size:12px;">1. 새로운 통신 대전 / 협동 레이드 방 만들기</h4>
        <div class="field-row">
          <label>대전 모드:</label>
          <select id="sel-online-mode">
            <option value="2V2" ${defaultMode === '2V2' ? 'selected' : ''}>2:2 팀 대전 (빈자리 AI 지원)</option>
            <option value="1V1" ${defaultMode === '1V1' ? 'selected' : ''}>1:1 정면 결투</option>
            <option value="COOP_RAID" ${defaultMode === 'COOP_RAID' ? 'selected' : ''}>🤝 3인 협동 거대 보스 레이드</option>
          </select>
          <label>레이드 보스:</label>
          <select id="sel-online-raid-id">
            ${Object.values(endgameRegistry.raids)
              .map(
                (r) =>
                  `<option value="${r.raidId}" ${r.raidId === selectedRaidId ? 'selected' : ''}>${r.name}</option>`
              )
              .join('')}
          </select>
        </div>
        <div class="field-row">
          <label>파티 규칙:</label>
          <select id="sel-online-rule">
            <option value="standard_preset">표준 밸런스 평등전</option>
            <option value="rpg_save" ${!onlineEligibility.allowed ? 'disabled' : ''}>
              내 모험 성장 파티전${!onlineEligibility.allowed ? ' [차단됨]' : ''}
            </option>
          </select>
          <label>전장 크기:</label>
          <select id="sel-online-arena">
            <option value="medium">표준 전장</option>
            <option value="large" selected>대형 전장</option>
            <option value="small">소형 전장</option>
          </select>
          <button id="btn-create-online-room" class="btn-tab-active">➕ 방 만들기</button>
        </div>
      </div>

      <div class="slot-card">
        <h4 style="color:#38bdf8;font-size:12px;">2. 6자리 방 코드로 참가 / 관전하기</h4>
        <div class="field-row">
          <input type="text" id="inp-join-room-code" maxlength="6" placeholder="방 코드 6자리 입력" style="width:180px;text-transform:uppercase;font-family:monospace;font-weight:bold;" value="${
            currentRoomState?.roomCode ?? ''
          }" />
          <button id="btn-join-as-player" class="btn-tab-active">⚔ 대전 참가</button>
          <button id="btn-join-as-spectator" style="background:#581c87;border-color:#c084fc;">👁 관전하기</button>
        </div>
      </div>

      <details class="slot-card">
        <summary style="cursor:pointer;color:#94a3b8;font-size:11px;font-weight:700;">
          🛠 개발자용 네트워크 · 보안 검증 도구 열기
        </summary>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
          <button id="btn-test-version-mismatch" class="btn-showcase">🧪 구버전 불일치 참가 거부 테스트</button>
          <button id="btn-test-server-anticheat" class="btn-danger">🧪 서버 이중 안티치트 차단 테스트</button>
        </div>
      </details>
    </div>
  `;

  onlineModalEl
    .querySelector('#btn-close-online-modal')
    ?.addEventListener('click', () => {
      onlineModalEl.classList.remove('open');
    });

  onlineModalEl
    .querySelector('#btn-create-online-room')
    ?.addEventListener('click', async () => {
      const mode = (
        onlineModalEl.querySelector('#sel-online-mode') as HTMLSelectElement
      ).value as '1V1' | '2V2' | 'COOP_RAID';
      const raidId =
        (
          onlineModalEl.querySelector(
            '#sel-online-raid-id'
          ) as HTMLSelectElement | null
        )?.value ?? selectedRaidId;
      const partyRule = (
        onlineModalEl.querySelector('#sel-online-rule') as HTMLSelectElement
      ).value as PartyRuleMode;
      const arenaSizeKey = (
        onlineModalEl.querySelector('#sel-online-arena') as HTMLSelectElement
      ).value as 'small' | 'medium' | 'large';

      if (partyRule === 'rpg_save' && !onlineEligibility.allowed) {
        ctx.setOnlineErrorNotice(
          '현재 세이브에 안티치트 위반이 감지되어 내 세이브 파티전(rpg_save) 방을 생성할 수 없습니다.'
        );
        renderOnlineLobbyModalContents(ctx);
        return;
      }

      const transport = await ctx.ensureOnlineTransportConnected();
      transport.send({
        type: 'CREATE_ROOM',
        clientId: transport.clientId,
        playerName: '몽키 D. 루피(P1)',
        battleCalcVersion: BATTLE_CALC_VERSION,
        mode,
        raidId: mode === 'COOP_RAID' ? raidId : undefined,
        partyRule,
        arenaSizeKey,
        awakeningAllowed: true,
        roster: ctx.buildOnlineRosterPayload(partyRule)
      });
    });

  onlineModalEl
    .querySelector('#btn-join-as-player')
    ?.addEventListener('click', async () => {
      const code = (
        onlineModalEl.querySelector('#inp-join-room-code') as HTMLInputElement
      ).value
        .trim()
        .toUpperCase();
      if (!code) {
        ctx.setOnlineErrorNotice('6자리 방 코드를 입력해 주세요.');
        renderOnlineLobbyModalContents(ctx);
        return;
      }
      const rule = ctx.getCurrentRoomState()?.partyRule ?? 'standard_preset';
      if (rule === 'rpg_save' && !onlineEligibility.allowed) {
        ctx.setOnlineErrorNotice(
          '비공식 수정 데이터 세이브로는 내 세이브 파티전(rpg_save)에 참가할 수 없습니다.'
        );
        renderOnlineLobbyModalContents(ctx);
        return;
      }

      const transport = await ctx.ensureOnlineTransportConnected();
      transport.send({
        type: 'JOIN_ROOM',
        roomCode: code,
        clientId: transport.clientId,
        playerName: '도전자(Guest)',
        battleCalcVersion: BATTLE_CALC_VERSION,
        asSpectator: false,
        roster: ctx.buildOnlineRosterPayload(rule)
      });
    });

  onlineModalEl
    .querySelector('#btn-join-as-spectator')
    ?.addEventListener('click', async () => {
      const code = (
        onlineModalEl.querySelector('#inp-join-room-code') as HTMLInputElement
      ).value
        .trim()
        .toUpperCase();
      if (!code) {
        ctx.setOnlineErrorNotice('관전할 6자리 방 코드를 입력해 주세요.');
        renderOnlineLobbyModalContents(ctx);
        return;
      }
      const transport = await ctx.ensureOnlineTransportConnected();
      transport.send({
        type: 'JOIN_ROOM',
        roomCode: code,
        clientId: transport.clientId,
        playerName: '관전자(Spectator)',
        battleCalcVersion: BATTLE_CALC_VERSION,
        asSpectator: true
      });
    });

  onlineModalEl
    .querySelector('#btn-copy-room-code')
    ?.addEventListener('click', () => {
      const room = ctx.getCurrentRoomState();
      if (room && navigator.clipboard) {
        navigator.clipboard.writeText(room.roomCode).catch(() => {});
      }
    });

  onlineModalEl
    .querySelector('#btn-leave-room')
    ?.addEventListener('click', () => {
      const room = ctx.getCurrentRoomState();
      const transport = ctx.getActiveTransport();
      if (room && transport) {
        transport.send({
          type: 'LEAVE_ROOM',
          roomCode: room.roomCode
        });
      }
      ctx.setCurrentRoomState(null);
      renderOnlineLobbyModalContents(ctx);
    });

  onlineModalEl
    .querySelectorAll<HTMLButtonElement>('[data-toggle-cpu]')
    .forEach((btn) => {
      btn.addEventListener('click', async () => {
        const room = ctx.getCurrentRoomState();
        if (!room) return;
        const slotIdx = Number(btn.dataset.toggleCpu);
        const slot = room.slots[slotIdx];
        const lvSel = onlineModalEl.querySelector(
          `[data-cpu-lv="${slotIdx}"]`
        ) as HTMLSelectElement | null;
        const spSel = onlineModalEl.querySelector(
          `[data-cpu-species="${slotIdx}"]`
        ) as HTMLSelectElement | null;

        const transport = await ctx.ensureOnlineTransportConnected();
        transport.send({
          type: 'CONFIGURE_CPU_SLOT',
          roomCode: room.roomCode,
          slotIndex: slotIdx,
          enabled: slot?.occupantType !== 'CPU',
          aiLevel: Number(lvSel?.value ?? 4),
          speciesId: spSel?.value ?? slot?.speciesId
        });
      });
    });

  onlineModalEl
    .querySelector('#btn-sim-add-spec')
    ?.addEventListener('click', () => {
      ctx.setOnlineAssignedRole(
        ctx.getOnlineAssignedRole() === 'SPECTATOR' ? 'PLAYER' : 'SPECTATOR'
      );
      renderOnlineLobbyModalContents(ctx);
    });

  onlineModalEl
    .querySelector('#btn-start-online-match')
    ?.addEventListener('click', async () => {
      const room = ctx.getCurrentRoomState();
      if (!room) return;
      const transport = await ctx.ensureOnlineTransportConnected();
      transport.send({
        type: 'START_MATCH',
        roomCode: room.roomCode
      });
    });

  onlineModalEl
    .querySelector('#btn-test-version-mismatch')
    ?.addEventListener('click', async () => {
      const transport = await ctx.ensureOnlineTransportConnected();
      transport.send({
        type: 'CREATE_ROOM',
        clientId: transport.clientId,
        playerName: 'OutdatedClient',
        battleCalcVersion: '0.1.0',
        mode: '1V1',
        partyRule: 'standard_preset',
        arenaSizeKey: 'medium',
        awakeningAllowed: true,
        roster: ctx.buildOnlineRosterPayload('standard_preset')
      });
    });

  onlineModalEl
    .querySelector('#btn-test-server-anticheat')
    ?.addEventListener('click', async () => {
      const transport = await ctx.ensureOnlineTransportConnected();
      const forgedRoster = ctx.buildOnlineRosterPayload('rpg_save');
      if (forgedRoster.saveEnvelope) {
        forgedRoster.saveEnvelope.payload.crew.unitProgressMap[
          'luffy'
        ].haki.conqueror = 4 as unknown as 3;
      }
      transport.send({
        type: 'CREATE_ROOM',
        clientId: transport.clientId,
        playerName: 'BypassCheater',
        battleCalcVersion: BATTLE_CALC_VERSION,
        mode: '1V1',
        partyRule: 'rpg_save',
        arenaSizeKey: 'medium',
        awakeningAllowed: true,
        roster: forgedRoster
      });
    });
}
