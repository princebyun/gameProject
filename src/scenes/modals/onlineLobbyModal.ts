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
import { buildOnlineLobbyModalHtml } from './onlineLobbyHtml';

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

  onlineModalEl.innerHTML = buildOnlineLobbyModalHtml({
    gameRegistry,
    endgameRegistry,
    campaign,
    currentRoomState,
    assignedRole,
    errorNotice,
    rttMs,
    isTerminalOnlineMatch: ctx.getIsTerminalOnlineMatch(),
    defaultMode,
    selectedRaidId,
    onlineEligibility
  });

  onlineModalEl
    .querySelector('#btn-close-online-modal')
    ?.addEventListener('click', () => {
      onlineModalEl.classList.remove('open');
    });

  onlineModalEl
    .querySelector('#btn-create-online-room')
    ?.addEventListener('click', async () => {
      const modeSel = onlineModalEl.querySelector('#sel-online-mode') as HTMLSelectElement | null;
      const raidSel = onlineModalEl.querySelector('#sel-online-raid-id') as HTMLSelectElement | null;
      const ruleSel = onlineModalEl.querySelector('#sel-online-rule') as HTMLSelectElement | null;
      const arenaSel = onlineModalEl.querySelector('#sel-online-arena') as HTMLSelectElement | null;
      const mode = (modeSel?.value ?? '2V2') as '1V1' | '2V2' | 'COOP_RAID';
      const raidId = raidSel?.value ?? selectedRaidId;
      const partyRule = (ruleSel?.value ?? 'standard_preset') as PartyRuleMode;
      const arenaSizeKey = (arenaSel?.value ?? 'large') as 'small' | 'medium' | 'large';

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
      const codeInput = onlineModalEl.querySelector('#inp-join-room-code') as HTMLInputElement | null;
      const code = (codeInput?.value ?? '').trim().toUpperCase();
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
      const codeInput = onlineModalEl.querySelector('#inp-join-room-code') as HTMLInputElement | null;
      const code = (codeInput?.value ?? '').trim().toUpperCase();
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
      const luffyProgress = forgedRoster.saveEnvelope?.payload.crew.unitProgressMap['luffy'];
      if (luffyProgress) {
        luffyProgress.haki.conqueror = 4 as unknown as 3;
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
