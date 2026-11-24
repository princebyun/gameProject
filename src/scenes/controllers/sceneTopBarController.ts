import type { TouchButtonSizePreset } from '../../input/inputManager';
import type { KeyBindingConfig } from '../../input/keyBindings';
import type { WindowDisplayMode } from '../../platform/deviceAdapter';
import type { Disposable } from '../sceneTypes';
import { normalizeBattleSpeedScale } from './battleSpeedControl';
import type { SceneManagerHost } from './controllerContracts';
import type { SceneAudioDirector } from './sceneAudioDirector';

export class SceneTopBarController implements Disposable {
  private readonly abort = new AbortController();
  private devToolsExpanded = false;

  constructor(
    private readonly host: SceneManagerHost,
    private readonly audioDirector: SceneAudioDirector
  ) {}

  public dispose(): void {
    this.abort.abort();
  }

  public bindTopBarEvents(topBar: HTMLElement): void {
    const { signal } = this.abort;
    const toggleBtn = this.host.rootEl.querySelector('#btn-toggle-hud-drawer') as HTMLButtonElement | null;
    const devToolsRow = topBar.querySelector('#dev-tools-bar-row') as HTMLElement | null;
    const btnStoryCodex = topBar.querySelector('#btn-story-codex') as HTMLButtonElement | null;
    const btnToggleJournal = topBar.querySelector('#btn-toggle-journal') as HTMLButtonElement | null;
    const btnToggleDevTools = topBar.querySelector('#btn-toggle-devtools') as HTMLButtonElement | null;

    const closeTopMenu = () => {
      topBar.classList.remove('open');
      this.host.sideDrawerEl?.classList.remove('open');
      if (!this.devToolsExpanded) {
        this.host.showcaseBarEl?.classList.remove('open');
      }
      if (toggleBtn) toggleBtn.textContent = '☰ 메뉴';
      this.host.clearTransientFocusAndInput();
    };

    toggleBtn?.addEventListener(
      'click',
      () => {
        const opening = !topBar.classList.contains('open');
        topBar.classList.toggle('open', opening);
        if (!opening) {
          this.host.sideDrawerEl?.classList.remove('open');
          if (!this.devToolsExpanded) {
            this.host.showcaseBarEl?.classList.remove('open');
          }
        } else if (this.devToolsExpanded) {
          this.host.showcaseBarEl?.classList.add('open');
        }
        toggleBtn.textContent = opening ? '✕ 닫기' : '☰ 메뉴';
        this.host.clearTransientFocusAndInput();
      },
      { signal }
    );

    btnStoryCodex?.addEventListener(
      'click',
      () => {
        closeTopMenu();
        this.host.openStoryCodex?.();
      },
      { signal }
    );

    btnToggleJournal?.addEventListener(
      'click',
      () => {
        const open = !this.host.sideDrawerEl?.classList.contains('open');
        this.host.sideDrawerEl?.classList.toggle('open', open);
        if (btnToggleJournal) {
          btnToggleJournal.classList.toggle('btn-tab-active', Boolean(open));
        }
        this.host.clearTransientFocusAndInput();
      },
      { signal }
    );

    btnToggleDevTools?.addEventListener(
      'click',
      () => {
        this.devToolsExpanded = !this.devToolsExpanded;
        if (devToolsRow) {
          devToolsRow.style.display = this.devToolsExpanded ? 'flex' : 'none';
        }
        this.host.showcaseBarEl?.classList.toggle('open', this.devToolsExpanded);
        btnToggleDevTools.classList.toggle('btn-tab-active', this.devToolsExpanded);
        this.host.clearTransientFocusAndInput();
      },
      { signal }
    );

    const tabRpg = topBar.querySelector('#tab-rpg') as HTMLButtonElement;
    const tabEndgame = topBar.querySelector('#tab-endgame') as HTMLButtonElement | null;
    const tabOnline = topBar.querySelector('#tab-online') as HTMLButtonElement;
    const tabSandbox = topBar.querySelector('#tab-sandbox') as HTMLButtonElement;

    tabRpg.addEventListener(
      'click',
      () => {
        tabRpg.classList.add('btn-tab-active');
        tabSandbox.classList.remove('btn-tab-active');
        closeTopMenu();
        this.host.switchToScene(
          this.host.campaign.activeIslandId ? 'ISLAND_EPISODE' : 'SEA_SAILING'
        );
      },
      { signal }
    );

    tabEndgame?.addEventListener(
      'click',
      () => {
        closeTopMenu();
        this.host.openEndgameHub();
      },
      { signal }
    );

    tabOnline.addEventListener(
      'click',
      () => {
        closeTopMenu();
        this.host.openOnlineLobbyModal(false);
      },
      { signal }
    );

    tabSandbox.addEventListener(
      'click',
      () => {
        tabSandbox.classList.add('btn-tab-active');
        tabRpg.classList.remove('btn-tab-active');
        this.host.sideDrawerEl?.classList.add('open');
        this.host.showcaseBarEl?.classList.add('open');
        this.host.switchToScene('SANDBOX');
      },
      { signal }
    );

    const selJump = topBar.querySelector('#sel-debug-jump') as HTMLSelectElement;
    selJump.addEventListener(
      'change',
      () => {
        if (!selJump.value) return;
        const targetJump = selJump.value;
        selJump.value = '';
        selJump.blur();
        tabRpg.classList.add('btn-tab-active');
        tabSandbox.classList.remove('btn-tab-active');
        closeTopMenu();
        this.host.executeDebugStoryJump(targetJump);
      },
      { signal }
    );

    topBar.querySelector('#btn-asset-preview')?.addEventListener(
      'click',
      () => {
        this.host.audio.unlock();
        closeTopMenu();
        this.host.assetPreviewScene?.open();
      },
      { signal }
    );

    topBar.querySelector('#btn-return-title')?.addEventListener(
      'click',
      async () => {
        await this.host.scanLatestSaveOnBoot();
        closeTopMenu();
        this.host.enterTitleScene();
      },
      { signal }
    );

    topBar.querySelector('#btn-save-menu')?.addEventListener(
      'click',
      () => {
        closeTopMenu();
        void this.host.openSaveManagerModal();
      },
      { signal }
    );

    topBar.querySelector('#btn-camp-menu')?.addEventListener(
      'click',
      () => {
        closeTopMenu();
        this.host.openCrewCampModal();
      },
      { signal }
    );

    topBar.querySelector('#btn-settings')?.addEventListener(
      'click',
      () => {
        closeTopMenu();
        this.host.settingsModalEl.classList.add('open');
      },
      { signal }
    );

    topBar.querySelector('#btn-visual-polish')?.addEventListener(
      'click',
      () => {
        closeTopMenu();
        this.host.visualPolishDrawer?.toggle();
      },
      { signal }
    );

    this.bindSettingsModalEvents(signal);
  }

  private bindSettingsModalEvents(signal: AbortSignal): void {
    const sm = this.host.settingsModalEl;
    const selBattleSpeed = sm.querySelector('#sel-battle-speed') as HTMLSelectElement | null;
    if (selBattleSpeed) {
      selBattleSpeed.value = String(this.host.battleSpeedScale);
      selBattleSpeed.addEventListener(
        'change',
        () => {
          this.host.setBattleSpeedScale(normalizeBattleSpeedScale(selBattleSpeed.value));
          this.host.audio.playSfxId('ui_move');
        },
        { signal }
      );
    }
    sm.querySelector('#btn-close-settings')?.addEventListener(
      'click',
      () => {
        void this.host.storage.saveGlobalSettings(this.audioDirector.getCurrentGlobalSettings());
        sm.classList.remove('open');
      },
      { signal }
    );

    const chkFlash = sm.querySelector('#chk-flash') as HTMLInputElement;
    chkFlash.addEventListener(
      'change',
      () => {
        this.host.renderer.settings.flashEffectEnabled = chkFlash.checked;
        this.host.pixiHost?.updatePolishConfig({ flashEffectEnabled: chkFlash.checked });
        void this.host.storage.saveGlobalSettings(this.audioDirector.getCurrentGlobalSettings());
      },
      { signal }
    );

    const selGraphicsQuality = sm.querySelector('#sel-graphics-quality') as HTMLSelectElement | null;
    selGraphicsQuality?.addEventListener(
      'change',
      () => {
        const q = selGraphicsQuality.value as 'HIGH' | 'MEDIUM' | 'LOW';
        this.host.pixiHost?.updatePolishConfig({ quality: q });
        this.host.visualPolishDrawer?.syncFromHost();
      },
      { signal }
    );

    const selWinMode = sm.querySelector('#sel-window-mode') as HTMLSelectElement | null;
    selWinMode?.addEventListener(
      'change',
      () => {
        void this.host.platformBridge.device.setDisplayMode(
          selWinMode.value as WindowDisplayMode
        );
      },
      { signal }
    );

    const chkHaptics = sm.querySelector('#chk-haptics') as HTMLInputElement | null;
    chkHaptics?.addEventListener(
      'change',
      () => {
        this.host.platformBridge.device.setHapticsEnabled(chkHaptics.checked);
      },
      { signal }
    );

    sm.querySelector('#btn-quit-game')?.addEventListener(
      'click',
      () => {
        void this.host.platformBridge.device.requestQuitWithConfirmation();
      },
      { signal }
    );

    const rngShake = sm.querySelector('#rng-shake') as HTMLInputElement;
    rngShake.addEventListener(
      'input',
      () => {
        this.host.renderer.settings.shakeIntensity = Number(rngShake.value) / 100;
        this.host.pixiHost?.updatePolishConfig({ shakeIntensity: this.host.renderer.settings.shakeIntensity });
        void this.host.storage.saveGlobalSettings(this.audioDirector.getCurrentGlobalSettings());
      },
      { signal }
    );

    const rngBgmVol = sm.querySelector('#rng-bgm-vol') as HTMLInputElement | null;
    rngBgmVol?.addEventListener(
      'input',
      () => {
        this.host.audio.setBgmVolume(Number(rngBgmVol.value) / 100);
        void this.host.storage.saveGlobalSettings(this.audioDirector.getCurrentGlobalSettings());
      },
      { signal }
    );

    const rngSfxVol = sm.querySelector('#rng-sfx-vol') as HTMLInputElement | null;
    rngSfxVol?.addEventListener(
      'input',
      () => {
        this.host.audio.setSfxVolume(Number(rngSfxVol.value) / 100);
        void this.host.storage.saveGlobalSettings(this.audioDirector.getCurrentGlobalSettings());
      },
      { signal }
    );

    const chkMute = sm.querySelector('#chk-mute') as HTMLInputElement;
    chkMute.addEventListener(
      'change',
      () => {
        this.host.audio.setMuted(chkMute.checked);
        void this.host.storage.saveGlobalSettings(this.audioDirector.getCurrentGlobalSettings());
      },
      { signal }
    );

    const chkTouch = sm.querySelector('#chk-touch-ui') as HTMLInputElement;
    chkTouch.addEventListener(
      'change',
      () => {
        this.host.input.forceShowTouchUi = chkTouch.checked;
      },
      { signal }
    );

    const selTouchSize = sm.querySelector('#sel-touch-size') as HTMLSelectElement | null;
    selTouchSize?.addEventListener(
      'change',
      () => {
        this.host.input.setTouchButtonSize(selTouchSize.value as TouchButtonSizePreset);
      },
      { signal }
    );

    const rngTouchOpacity = sm.querySelector('#rng-touch-opacity') as HTMLInputElement | null;
    rngTouchOpacity?.addEventListener(
      'input',
      () => {
        this.host.input.setTouchOpacity(Number(rngTouchOpacity.value) / 100);
      },
      { signal }
    );

    const bindDodge = sm.querySelector('#bind-dodge') as HTMLInputElement;
    bindDodge.addEventListener(
      'change',
      () => {
        this.host.input.updateBinding('dodge' as keyof KeyBindingConfig, bindDodge.value.trim());
      },
      { signal }
    );

    const bindForm = sm.querySelector('#bind-form') as HTMLInputElement;
    bindForm.addEventListener(
      'change',
      () => {
        this.host.input.updateBinding('formShift' as keyof KeyBindingConfig, bindForm.value.trim());
      },
      { signal }
    );

    sm.querySelector('#btn-reset-binds')?.addEventListener(
      'click',
      () => {
        this.host.input.resetBindings();
        const b = this.host.input.getBindings();
        bindDodge.value = b.dodge;
        bindForm.value = b.formShift;
      },
      { signal }
    );
  }
}
