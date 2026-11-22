import type { GlobalSettingsPayload } from '../../core/save/schema';
import type { BattleWorldState } from '../../core/types/battleState';
import { resolveBgmForSeaZone } from '../../data/assets/assetManifestRegistry';
import type { Disposable } from '../sceneTypes';
import type { SceneManagerHost } from './controllerContracts';

const BOSS_SPECIES_SET = new Set([
  'kaido',
  'kizaru',
  'saturn',
  'loki',
  'magellan',
  'katakuri',
  'doflamingo',
  'lucci',
  'enel',
  'crocodile',
  'arlong',
  'akainu',
  'aokiji',
  'blackbeard',
  'morgan',
  'buggy',
  'don_krieg',
  'smoker',
  'wapol',
  'moria',
  'hody'
]);

export class SceneAudioDirector implements Disposable {
  constructor(private readonly host: SceneManagerHost) {}

  public dispose(): void {
    // Lifecycle managed by AudioManager at app root
  }

  public getCurrentGlobalSettings(): GlobalSettingsPayload {
    const vols = this.host.audio.getVolumes();
    return {
      flashEffect: this.host.renderer?.settings.flashEffectEnabled ?? true,
      shakeIntensity: this.host.renderer?.settings.shakeIntensity ?? 0.8,
      bgmVolume: vols.bgm,
      sfxVolume: vols.muted ? 0 : vols.sfx,
      keyBindings: { ...this.host.input.getBindings() }
    };
  }

  public applyAudioAndVisualSettings(settings: GlobalSettingsPayload): void {
    if (this.host.renderer) {
      this.host.renderer.settings.flashEffectEnabled = settings.flashEffect;
      this.host.renderer.settings.shakeIntensity = settings.shakeIntensity;
    }
    if (typeof settings.bgmVolume === 'number') {
      this.host.audio.setBgmVolume(settings.bgmVolume);
    }
    if (typeof settings.sfxVolume === 'number') {
      this.host.audio.setSfxVolume(settings.sfxVolume);
    }
    if (this.host.settingsModalEl) {
      const chkFlash = this.host.settingsModalEl.querySelector('#chk-flash') as HTMLInputElement | null;
      const rngShake = this.host.settingsModalEl.querySelector('#rng-shake') as HTMLInputElement | null;
      const rngBgm = this.host.settingsModalEl.querySelector('#rng-bgm-vol') as HTMLInputElement | null;
      const rngSfx = this.host.settingsModalEl.querySelector('#rng-sfx-vol') as HTMLInputElement | null;
      if (chkFlash) chkFlash.checked = settings.flashEffect;
      if (rngShake) rngShake.value = String(Math.round(settings.shakeIntensity * 100));
      if (rngBgm && typeof settings.bgmVolume === 'number') {
        rngBgm.value = String(Math.round(settings.bgmVolume * 100));
      }
      if (rngSfx && typeof settings.sfxVolume === 'number') {
        rngSfx.value = String(Math.round(settings.sfxVolume * 100));
      }
    }
  }

  public syncSceneBgm(activeWorld?: BattleWorldState): void {
    if (this.host.assetPreviewScene?.getIsOpen()) return;
    if (
      this.host.activeScene === 'BOOT' ||
      this.host.activeScene === 'TITLE' ||
      this.host.activeScene === 'OPENING_NARRATION'
    ) {
      this.host.audio.setBreakFilterActive(false);
      if (this.host.activeScene === 'TITLE') {
        void this.host.audio.playBgm('title_adventure');
      }
      return;
    }

    if (this.host.activeScene === 'SEA_SAILING') {
      this.host.audio.setBreakFilterActive(false);
      void this.host.audio.playBgm(resolveBgmForSeaZone(this.host.campaign.currentZoneId));
      return;
    }

    if (this.host.activeScene === 'ISLAND_EPISODE') {
      this.host.audio.setBreakFilterActive(false);
      void this.host.audio.playBgm('island_peaceful');
      return;
    }

    const world =
      activeWorld ??
      (this.host.activeScene === 'ONLINE_BATTLE' && this.host.activeLockstep
        ? this.host.activeLockstep.world
        : this.host.battleWorld);

    if (!world) {
      void this.host.audio.playBgm('battle_normal');
      return;
    }

    const isGroggy = Boolean(world.raidState && world.raidState.groggyTimer > 0);
    this.host.audio.setBreakFilterActive(isGroggy);

    const endgameKind = this.host.getActiveEndgameBattleKind();
    const isGiantRaid =
      world.mode === 'COOP_RAID' ||
      endgameKind === 'RAID' ||
      world.units.some((u) => u.speciesId.startsWith('raid_'));

    if (isGiantRaid) {
      void this.host.audio.setBattleMood('RAID_GIANT');
      return;
    }

    const hasAwakeningOrPhase2 = world.units.some((u) => {
      if (!u.isAlive) return false;
      if (u.bossPhase2Triggered) return true;
      if (!u.activeFormId) return false;
      const fDef = this.host.gameRegistry.forms[u.activeFormId];
      return (
        u.activeFormId === 'form_luffy_gear5' ||
        u.activeFormId === 'form_kaido_beast' ||
        u.activeFormId === 'form_lucci_awakened' ||
        u.activeFormId === 'form_magellan_venom_demon' ||
        fDef?.formCategory === 'AWAKENED_ZOAN' ||
        fDef?.formCategory === 'ENVIRONMENT_AWAKENING'
      );
    });

    if (hasAwakeningOrPhase2) {
      void this.host.audio.setBattleMood('YONKO_AWAKENING');
      return;
    }

    const isBossFight =
      Boolean(endgameKind) ||
      world.units.some((u) => u.team === 'OMEGA' && BOSS_SPECIES_SET.has(u.speciesId));

    void this.host.audio.setBattleMood(isBossFight ? 'BOSS' : 'NORMAL');
  }
}
