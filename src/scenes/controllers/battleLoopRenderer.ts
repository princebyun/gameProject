import { stepBattleWorld } from '../../core/combat/battleWorld';
import { FIXED_DT } from '../../core/constants';
import type {
  BattleWorldConfig,
  UnitBuildConfig
} from '../../core/types/battleState';
import { stepBootScene } from '../bootScene';
import type { Disposable } from '../sceneTypes';
import { EV_PRESETS, type SceneManagerHost } from './controllerContracts';
import type { RpgWorldController } from './rpgWorldController';
import { renderActiveSceneFrame } from './sceneFrameRenderer';

export class BattleLoopRenderer implements Disposable {
  constructor(
    private readonly host: SceneManagerHost,
    private readonly rpgController: RpgWorldController
  ) {}

  public dispose(): void {
    // Lifecycle managed by SceneManager
  }

  public createUnitBuildFromSpecies(
    instanceId: string,
    speciesId: string,
    isPlayerControlled: boolean,
    aiLevel: number,
    evPresetKey: string
  ): UnitBuildConfig {
    const unitDef =
      this.host.gameRegistry.units[speciesId] ??
      Object.values(this.host.gameRegistry.units)[0];
    if (!unitDef) {
      throw new Error(`Missing unit definition for ${speciesId}`);
    }
    const evs = EV_PRESETS[evPresetKey]?.evs ?? EV_PRESETS['balanced']!.evs;
    return {
      instanceId,
      speciesId: unitDef.id,
      level: 50,
      ivs: { hp: 31, atk: 31, def: 31, spAtk: 31, spDef: 31, spd: 31 },
      evs: { ...evs },
      moveIds: [...unitDef.defaultMoves],
      equipmentId: unitDef.defaultEquipmentId,
      traitId: unitDef.traitId,
      formId: unitDef.defaultFormId,
      isPlayerControlled,
      aiLevel
    };
  }

  public createDefaultSandboxConfig(): BattleWorldConfig {
    return {
      seed: 20261119,
      arenaSizeKey: 'medium',
      mode: '1V1',
      teamAlpha: [
        this.createUnitBuildFromSpecies('alpha_1', 'luffy', true, 4, 'physicalBrawler'),
        this.createUnitBuildFromSpecies('alpha_2', 'zoro', false, 4, 'physicalBrawler'),
        this.createUnitBuildFromSpecies('alpha_3', 'law', false, 4, 'specialSweeper')
      ],
      teamOmega: [
        this.createUnitBuildFromSpecies('omega_1', 'kaido', false, 4, 'fortressTank'),
        this.createUnitBuildFromSpecies('omega_2', 'kizaru', false, 4, 'specialSweeper'),
        this.createUnitBuildFromSpecies('omega_3', 'lucci', false, 4, 'physicalBrawler')
      ]
    };
  }

  public stepFixedTick(): boolean {
    if (this.host.activeScene === 'BOOT') {
      const bootDone = stepBootScene(
        this.host.bootState,
        this.host.bootAssetsReady,
        FIXED_DT
      );
      if (bootDone) {
        this.host.enterTitleScene();
      }
      return true;
    }

    if (this.host.activeScene === 'TITLE') {
      return true;
    }

    if (this.host.activeScene === 'OPENING_NARRATION') {
      this.rpgController.stepOpeningFrame(FIXED_DT);
      return true;
    }

    if (
      this.host.activeScene === 'SEA_SAILING' ||
      this.host.activeScene === 'ISLAND_EPISODE'
    ) {
      this.rpgController.stepRpgFrame(FIXED_DT);
      return true;
    }

    if (this.host.activeScene === 'ONLINE_BATTLE' && this.host.activeLockstep) {
      return this.stepOnlineBattleTick();
    }

    this.stepOfflineBattleTick();
    return true;
  }

  private stepOnlineBattleTick(): boolean {
    const lockstep = this.host.activeLockstep;
    if (!lockstep) return true;
    if (lockstep.stepDisconnectTimer(FIXED_DT)) {
      const myTeam =
        this.host.onlineAssignedSlotIndex === 0 ||
        this.host.onlineAssignedSlotIndex === 1
          ? 'ALPHA'
          : 'OMEGA';
      this.host.finishOnlineMatch(
        myTeam,
        '상대 플레이어 15초 재접속 대기 시간 초과로 자동 승리 판정되었습니다.'
      );
      return false;
    }

    if (this.host.onlineAssignedRole === 'PLAYER') {
      const myUnitId =
        lockstep.config.slotToUnitInstanceId[this.host.onlineAssignedSlotIndex];
      const myUnit = lockstep.world.units.find((u) => u.instanceId === myUnitId);
      const localCmd = this.host.input.buildPlayerCommand(
        myUnit,
        lockstep.world,
        this.host.gameRegistry
      );
      lockstep.submitLocalCommandForNextTick(localCmd);
    }

    lockstep.tryAdvanceTick();

    if (lockstep.world.winnerTeam !== null) {
      this.host.finishOnlineMatch(
        lockstep.world.winnerTeam,
        '실시간 통신 대전 결판이 났습니다!'
      );
      return false;
    }
    return true;
  }

  private stepOfflineBattleTick(): void {
    if (this.host.threeMusouController?.isCutsceneActive()) {
      return;
    }
    let playerUnit = this.host.battleWorld.units.find(
      (u) =>
        u.team === 'ALPHA' &&
        u.isOnField &&
        u.isAlive &&
        !u.isDowned &&
        u.isPlayerControlled
    );
    if (
      !playerUnit &&
      !(
        this.host.activeScene === 'SANDBOX' &&
        this.host.sandboxConfig.mode === 'AI_VS_AI'
      )
    ) {
      const nextStanding = this.host.battleWorld.units.find(
        (u) => u.team === 'ALPHA' && u.isOnField && u.isAlive && !u.isDowned
      );
      if (nextStanding) {
        for (const u of this.host.battleWorld.units) {
          if (u.team === 'ALPHA') {
            u.isPlayerControlled = u.instanceId === nextStanding.instanceId;
          }
        }
        playerUnit = nextStanding;
      }
    }

    const playerCmd = this.host.input.buildPlayerCommand(
      playerUnit,
      this.host.battleWorld,
      this.host.gameRegistry
    );

    if (
      this.host.battleWorld.raidState.active &&
      playerUnit &&
      playerCmd?.swapToBenchUnitId
    ) {
      const standing = this.host.battleWorld.units.filter(
        (u) => u.team === 'ALPHA' && u.isOnField && u.isAlive && !u.isDowned
      );
      if (standing.length > 1) {
        const curIdx = standing.findIndex(
          (u) => u.instanceId === playerUnit!.instanceId
        );
        const nextAlly = standing[(curIdx + 1) % standing.length];
        if (nextAlly) {
          for (const u of this.host.battleWorld.units) {
            if (u.team === 'ALPHA') {
              u.isPlayerControlled = u.instanceId === nextAlly.instanceId;
            }
          }
        }
        playerCmd.swapToBenchUnitId = null;
      }
    }

    const cmds = playerCmd ? [playerCmd] : [];
    const prevClashes =
      this.host.battleWorld.beamClashes.length +
      this.host.battleWorld.meleeClashes.length +
      this.host.battleWorld.meleeBeamGuards.length;
    const prevSlowMo = this.host.battleWorld.slowMoTimer;
    const prevFormId = playerUnit?.activeFormId ?? null;

    stepBattleWorld(
      this.host.battleWorld,
      cmds,
      this.host.gameRegistry,
      this.host.prng,
      FIXED_DT
    );
    this.host.threeMusouController?.stepMusouTickIfActive(this.host);

    const nextClashes =
      this.host.battleWorld.beamClashes.length +
      this.host.battleWorld.meleeClashes.length +
      this.host.battleWorld.meleeBeamGuards.length;
    if (nextClashes > prevClashes) {
      void this.host.platformBridge.device.triggerHaptic('clash');
      this.host.audio.playSfxId(
        this.host.battleWorld.beamClashes.length > 0
          ? 'beam_clash_loop'
          : 'melee_clash_clang'
      );
    } else if (this.host.battleWorld.slowMoTimer > prevSlowMo) {
      void this.host.platformBridge.device.triggerHaptic('just_dodge');
      this.host.audio.playSfxId('just_dodge_chime');
    } else if (
      playerUnit &&
      playerUnit.activeFormId !== prevFormId &&
      playerUnit.activeFormId
    ) {
      void this.host.platformBridge.device.triggerHaptic('awakening');
      this.host.audio.playSfxId(
        playerUnit.activeFormId === 'form_luffy_gear5'
          ? 'awakening_drums'
          : 'transform_burst'
      );
      this.host.syncSceneBgm(this.host.battleWorld);
    }

    this.host.audio.setBreakFilterActive(
      Boolean(
        this.host.battleWorld.raidState &&
          this.host.battleWorld.raidState.groggyTimer > 0
      )
    );
    if (this.host.tickCount % 30 === 0) {
      this.host.syncSceneBgm(this.host.battleWorld);
    }

    if (
      this.host.activeScene === 'STORY_BATTLE' &&
      this.host.battleWorld.winnerTeam !== null
    ) {
      this.host.finishStoryBattle(this.host.battleWorld.winnerTeam === 'ALPHA');
    }
  }

  public renderFrame(alpha: number): void {
    renderActiveSceneFrame(this.host, alpha);
  }
}
