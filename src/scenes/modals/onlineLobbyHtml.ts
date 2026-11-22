import { BATTLE_CALC_VERSION } from '../../core/constants';
import type { EndgameDataRegistry } from '../../core/endgame/types';
import type { RoomStateSnapshot } from '../../core/net/protocol';
import type { GameDataRegistry } from '../../core/types/dataSchemas';
import type { RpgCampaignState } from '../../core/types/rpgSchemas';

export interface OnlineLobbyHtmlParams {
  gameRegistry: GameDataRegistry;
  endgameRegistry: EndgameDataRegistry;
  campaign: RpgCampaignState;
  currentRoomState: RoomStateSnapshot | null;
  assignedRole: 'PLAYER' | 'SPECTATOR';
  errorNotice: string | null;
  rttMs: number;
  isTerminalOnlineMatch: boolean;
  defaultMode: '1V1' | '2V2' | 'COOP_RAID';
  selectedRaidId: string;
  onlineEligibility: { allowed: boolean; reasons: string[] };
}

export function buildWaitingRoomHtml(
  currentRoomState: RoomStateSnapshot,
  assignedRole: 'PLAYER' | 'SPECTATOR',
  rttMs: number,
  unitSelectOptions: string
): string {
  return `<div class="slot-card" style="border:2px solid #38bdf8;background:#0f172a;">
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
      </div>`;
}

export function buildOnlineLobbyModalHtml(params: OnlineLobbyHtmlParams): string {
  const {
    gameRegistry,
    endgameRegistry,
    campaign,
    currentRoomState,
    assignedRole,
    errorNotice,
    rttMs,
    isTerminalOnlineMatch,
    defaultMode,
    selectedRaidId,
    onlineEligibility
  } = params;

  const unitSelectOptions = Object.keys(gameRegistry.units)
    .map((id) => {
      const u = gameRegistry.units[id];
      return `<option value="${id}">${u?.name ?? id}</option>`;
    })
    .join('');

  const waitingRoomHtml = currentRoomState
    ? buildWaitingRoomHtml(currentRoomState, assignedRole, rttMs, unitSelectOptions)
    : '';

  return `
    <div class="modal-box" role="dialog" aria-label="실시간 통신 대전 로비">
      <div class="field-row">
        <h3 style="color:#c084fc;font-size:15px;">
          🌐 실시간 통신 대전 로비 ${
            isTerminalOnlineMatch
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
}
