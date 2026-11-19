import { AssetLoader } from '../assets/assetLoader';
import { AudioManager } from '../audio/audioManager';
import {
  createBattleWorld,
  spawnBeamInstance,
  spawnMeleeArcInstance,
  spawnProjectileInstance,
  stepBattleWorld
} from '../core/combat/battleWorld';
import { activateFormShift, cycleZoanStance } from '../core/combat/formShiftEngine';
import { FIXED_DT } from '../core/constants';
import { SeededPRNG } from '../core/math/prng';
import type { GameDataRegistry, StatBlock } from '../core/types/dataSchemas';
import type {
  BattleWorldConfig,
  BattleWorldState,
  UnitBuildConfig
} from '../core/types/battleState';
import { UnifiedInputManager } from '../input/inputManager';
import type { KeyBindingConfig } from '../input/keyBindings';
import type { PlatformAdapter } from '../platform/platformAdapter';
import { renderBattleArena } from '../render/battleRenderer';
import { CanvasRenderer } from '../render/canvasRenderer';
import { renderBattleHud } from '../render/hudRenderer';
import { renderTouchOverlay } from '../render/touchOverlayRenderer';

const PRESET_STORAGE_KEY = 'aether_clash_onepiece_preset_v2';

const EV_PRESETS: Record<string, { label: string; evs: StatBlock }> = {
  balanced: {
    label: '밸런스형 (Balanced)',
    evs: { hp: 80, atk: 80, def: 80, spAtk: 80, spDef: 80, spd: 80 }
  },
  specialSweeper: {
    label: '특수 딜러형 (SpAtk/Spd)',
    evs: { hp: 20, atk: 0, def: 20, spAtk: 200, spDef: 20, spd: 200 }
  },
  physicalBrawler: {
    label: '물리 패기 격투형 (Atk/HP)',
    evs: { hp: 180, atk: 200, def: 40, spAtk: 0, spDef: 40, spd: 40 }
  },
  fortressTank: {
    label: '사황 중장갑형 (HP/Def/SpDef)',
    evs: { hp: 200, atk: 60, def: 130, spAtk: 40, spDef: 130, spd: 0 }
  }
};

export class SandboxScene {
  private renderer!: CanvasRenderer;
  private input: UnifiedInputManager;
  private assets: AssetLoader;
  private audio: AudioManager;
  private prng: SeededPRNG;

  private config: BattleWorldConfig;
  private world: BattleWorldState;
  private selectedAlphaEvPreset = 'physicalBrawler';
  private selectedOmegaEvPreset = 'fortressTank';

  private accumulator = 0;
  private lastTimeMs = 0;
  private fps = 60;
  private frameCounter = 0;
  private fpsTimerMs = 0;

  private logContainer!: HTMLElement;
  private lastLogCount = 0;
  private settingsModal!: HTMLElement;
  private configDrawer!: HTMLElement;

  constructor(
    private rootEl: HTMLElement,
    private registry: GameDataRegistry,
    private platform: PlatformAdapter
  ) {
    this.input = new UnifiedInputManager(platform);
    this.assets = new AssetLoader();
    this.audio = new AudioManager();
    this.prng = new SeededPRNG(20261119);

    this.config = this.createDefaultSandboxConfig();
    this.loadSavedPresetIfPresent();
    this.world = createBattleWorld(this.config, this.registry);
  }

  public async init(): Promise<void> {
    await this.assets.preloadCoreAssets(this.registry.units);
    this.buildDomLayout();
    this.attachCanvasInputEvents();
    this.lastTimeMs = this.platform.nowMs();
    this.fpsTimerMs = this.lastTimeMs;
    requestAnimationFrame((t) => this.loop(t));
  }

  private createUnitBuildFromSpecies(
    instanceId: string,
    speciesId: string,
    isPlayerControlled: boolean,
    aiLevel: number,
    evPresetKey: string
  ): UnitBuildConfig {
    const unitDef =
      this.registry.units[speciesId] ?? Object.values(this.registry.units)[0];
    const evs = EV_PRESETS[evPresetKey]?.evs ?? EV_PRESETS.balanced.evs;
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

  private createDefaultSandboxConfig(): BattleWorldConfig {
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

  private loadSavedPresetIfPresent(): void {
    const saved = this.platform.getStorageItem(PRESET_STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as BattleWorldConfig;
      if (parsed && Array.isArray(parsed.teamAlpha) && Array.isArray(parsed.teamOmega)) {
        this.config = parsed;
      }
    } catch {
      // Ignore corrupt preset
    }
  }

  public restartBattle(): void {
    this.prng = new SeededPRNG(this.config.seed);
    this.world = createBattleWorld(this.config, this.registry);
    this.lastLogCount = 0;
    this.syncCombatLogDom();
  }

  /**
   * One Piece Phase 1.5 interactive verification showcase scenarios
   */
  public triggerShowcaseScenario(
    kind:
      | 'BEAM_CLASH_KAIDO_KIZARU'
      | 'CONQUEROR_CLASH_LUFFY_KAIDO'
      | 'HAGOROMO_AWAKENING'
      | 'LOGIA_VS_HAKI'
      | 'ZOAN_STANCE_CYCLE'
  ): void {
    const alpha = this.world.units.find((u) => u.team === 'ALPHA' && u.isOnField && u.isAlive);
    const omega = this.world.units.find((u) => u.team === 'OMEGA' && u.isOnField && u.isAlive);
    if (!alpha || !omega) return;

    this.world.projectiles = [];
    this.world.beams = [];
    this.world.meleeArcs = [];
    this.world.beamClashes = [];
    this.world.meleeBeamGuards = [];
    this.world.meleeClashes = [];

    alpha.pos = { x: this.world.arenaWidth * 0.34, y: this.world.arenaHeight * 0.5 };
    alpha.prevPos = { ...alpha.pos };
    alpha.aimDir = { x: 1, y: 0 };

    omega.pos = { x: this.world.arenaWidth * 0.66, y: this.world.arenaHeight * 0.5 };
    omega.prevPos = { ...omega.pos };
    omega.aimDir = { x: -1, y: 0 };

    if (kind === 'BEAM_CLASH_KAIDO_KIZARU') {
      spawnBeamInstance(
        alpha,
        this.registry.moves['move_kaido_boro_breath'],
        { x: 1, y: 0 },
        this.world,
        this.registry
      );
      spawnBeamInstance(
        omega,
        this.registry.moves['move_kizaru_laser_beam'],
        { x: -1, y: 0 },
        this.world,
        this.registry
      );
      this.audio.playSfx('CLASH');
    } else if (kind === 'CONQUEROR_CLASH_LUFFY_KAIDO') {
      alpha.pos = { x: this.world.arenaWidth * 0.44, y: this.world.arenaHeight * 0.5 };
      alpha.prevPos = { ...alpha.pos };
      omega.pos = { x: this.world.arenaWidth * 0.56, y: this.world.arenaHeight * 0.5 };
      omega.prevPos = { ...omega.pos };
      spawnMeleeArcInstance(
        alpha,
        this.registry.moves['move_luffy_bajrang_gun'] ??
          this.registry.moves['move_luffy_roc_gun'],
        { x: 1, y: 0 },
        this.world,
        this.registry
      );
      spawnMeleeArcInstance(
        omega,
        this.registry.moves['move_kaido_ragnaraku'],
        { x: -1, y: 0 },
        this.world,
        this.registry
      );
      this.audio.playSfx('CLASH');
    } else if (kind === 'HAGOROMO_AWAKENING') {
      // Activate Gear 5 (White Hagoromo) on Alpha & Awakened Leopard (Black Hagoromo) on Omega
      alpha.hasUsedFormShift = false;
      alpha.exhaustionTimer = 0;
      alpha.hp = Math.max(10, Math.round(alpha.maxHp * 0.6));
      activateFormShift(alpha, this.world, this.registry, 'form_luffy_gear5');

      omega.hasUsedFormShift = false;
      omega.exhaustionTimer = 0;
      omega.hp = Math.max(10, Math.round(omega.maxHp * 0.6));
      activateFormShift(omega, this.world, this.registry, 'form_lucci_awakened');
      this.audio.playSfx('FORM_SHIFT');
    } else if (kind === 'LOGIA_VS_HAKI') {
      // Make Omega a Logia (Kizaru) and fire a non-Haki attack followed by an Armament Haki projectile
      omega.fruitType = 'LOGIA';
      omega.traitId = 'ability_pika_logia';
      omega.iframeTimer = 0;
      const nonHakiProj = spawnProjectileInstance(
        alpha,
        this.registry.moves['move_kizaru_yasakani'],
        { x: 1, y: 0 },
        this.world,
        this.registry
      );
      nonHakiProj.hasArmamentHaki = false;
      nonHakiProj.pos = { x: omega.pos.x - 10, y: omega.pos.y };
      this.audio.playSfx('CAST');
    } else if (kind === 'ZOAN_STANCE_CYCLE') {
      alpha.stanceCooldownTimer = 0;
      omega.stanceCooldownTimer = 0;
      cycleZoanStance(alpha, this.world, this.registry);
      cycleZoanStance(omega, this.world, this.registry);
      this.audio.playSfx('FORM_SHIFT');
    }
  }

  private buildDomLayout(): void {
    this.rootEl.innerHTML = '';

    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body {
        width: 100%;
        height: 100%;
        background: #070b12;
        color: #e2e8f0;
        font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
        overflow-x: hidden;
      }
      #app {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        width: 100%;
      }
      .top-bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 6px 10px;
        background: #0f172a;
        border-bottom: 1px solid #1e293b;
        font-size: 12px;
      }
      .top-bar-group {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
      }
      .brand-title {
        font-weight: 700;
        color: #facc15;
        letter-spacing: 0.4px;
        margin-right: 4px;
      }
      select, button, input {
        background: #1e293b;
        color: #f8fafc;
        border: 1px solid #334155;
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 12px;
        cursor: pointer;
      }
      button:hover {
        background: #334155;
        border-color: #38bdf8;
      }
      .btn-primary {
        background: #0284c7;
        border-color: #38bdf8;
        font-weight: 600;
      }
      .btn-showcase {
        background: #1e1b4b;
        border-color: #818cf8;
        color: #e0e7ff;
        font-size: 11px;
      }
      .workspace-main {
        display: flex;
        flex: 1;
        align-items: flex-start;
        justify-content: center;
        gap: 10px;
        padding: 8px;
        flex-wrap: wrap;
      }
      .canvas-stage-col {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex: 1 1 640px;
        max-width: 960px;
        width: 100%;
      }
      .canvas-wrapper {
        width: 100%;
        max-width: 960px;
        aspect-ratio: 16 / 9;
        border: 2px solid #1e293b;
        border-radius: 6px;
        overflow: hidden;
        background: #090d16;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .canvas-wrapper canvas {
        width: 100%;
        height: 100%;
        object-fit: contain;
        image-rendering: pixelated;
      }
      .showcase-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 6px;
        width: 100%;
        justify-content: center;
      }
      .mobile-gamepad-dock {
        display: none;
        width: 100%;
        max-width: 500px;
        margin-top: 8px;
        padding: 10px;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid #334155;
        border-radius: 10px;
        justify-content: space-between;
        align-items: center;
        user-select: none;
        touch-action: manipulation;
      }
      .dpad-grid {
        display: grid;
        grid-template-columns: repeat(3, 42px);
        grid-template-rows: repeat(3, 42px);
        gap: 4px;
      }
      .dpad-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        background: #1e293b;
        border: 1px solid #38bdf8;
        border-radius: 8px;
        font-weight: bold;
        font-size: 15px;
      }
      .action-pad-grid {
        display: grid;
        grid-template-columns: repeat(3, 54px);
        gap: 6px;
      }
      .act-btn {
        height: 44px;
        border-radius: 8px;
        font-weight: 700;
        font-size: 11px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }
      .side-drawer {
        flex: 0 1 320px;
        width: 100%;
        max-width: 340px;
        background: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 6px;
        padding: 10px;
        font-size: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .config-card {
        background: #162032;
        border: 1px solid #26354d;
        border-radius: 5px;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .config-card h4 {
        font-size: 12px;
        color: #38bdf8;
        margin-bottom: 2px;
      }
      .field-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }
      .field-row label {
        color: #94a3b8;
        font-size: 11px;
      }
      .field-row select {
        flex: 1;
        max-width: 195px;
      }
      .combat-log-box {
        height: 110px;
        overflow-y: auto;
        background: #090d16;
        border: 1px solid #1e293b;
        border-radius: 4px;
        padding: 6px;
        font-family: monospace;
        font-size: 11px;
        color: #cbd5e1;
      }
      .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.72);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 100;
        padding: 12px;
      }
      .modal-backdrop.open {
        display: flex;
      }
      .modal-box {
        background: #0f172a;
        border: 1px solid #38bdf8;
        border-radius: 8px;
        padding: 16px;
        width: 100%;
        max-width: 420px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      @media (max-width: 600px) {
        .mobile-gamepad-dock {
          display: flex;
        }
        .side-drawer {
          max-width: 100%;
        }
      }
    `;
    document.head.appendChild(style);

    const topBar = document.createElement('header');
    topBar.className = 'top-bar';
    topBar.innerHTML = `
      <div class="top-bar-group">
        <span class="brand-title">🏴‍☠️ ONE PIECE CLASH SANDBOX</span>
        <label>모드:
          <select id="sel-mode" aria-label="전투 모드">
            <option value="1V1">1:1 (Player vs AI)</option>
            <option value="2V2">2:2 (Player+AI vs 2 AI)</option>
            <option value="AI_VS_AI">AI vs AI (관전 모드)</option>
          </select>
        </label>
        <label>아레나:
          <select id="sel-arena" aria-label="아레나 크기">
            <option value="small">Small (640x380)</option>
            <option value="medium" selected>Medium (840x460)</option>
            <option value="large">Large (1120x640)</option>
          </select>
        </label>
        <label>AI 난이도:
          <select id="sel-ai-level" aria-label="AI 난이도">
            <option value="1">Lv.1 입문</option>
            <option value="2">Lv.2 훈련</option>
            <option value="3">Lv.3 숙련</option>
            <option value="4" selected>Lv.4 달인</option>
            <option value="5">Lv.5 최상위</option>
          </select>
        </label>
        <button id="btn-restart" class="btn-primary">▶ 전투 재시작</button>
      </div>
      <div class="top-bar-group">
        <button id="btn-save-preset">💾 프리셋 저장</button>
        <button id="btn-load-preset">📂 불러오기</button>
        <button id="btn-settings">⚙ 설정/접근성</button>
      </div>
    `;
    this.rootEl.appendChild(topBar);

    const main = document.createElement('main');
    main.className = 'workspace-main';

    const stageCol = document.createElement('div');
    stageCol.className = 'canvas-stage-col';

    const canvasWrapper = document.createElement('div');
    canvasWrapper.className = 'canvas-wrapper';
    this.renderer = new CanvasRenderer(canvasWrapper);
    stageCol.appendChild(canvasWrapper);

    const showcaseBar = document.createElement('div');
    showcaseBar.className = 'showcase-bar';
    showcaseBar.innerHTML = `
      <button id="btn-demo-beam" class="btn-showcase">⚡ 보로 브레스 vs 레이저 빔 맞대결</button>
      <button id="btn-demo-melee" class="btn-showcase">👑 루피 vs 카이도 패왕색 하늘 가르기</button>
      <button id="btn-demo-form" class="btn-showcase">☁ 기어5(흰 구름띠) & 루치(검은 구름띠) 각성</button>
      <button id="btn-demo-zoan" class="btn-showcase">🔄 동물계 변신 순환 (인간↔인수↔청룡)</button>
      <button id="btn-demo-status" class="btn-showcase">✨ 자연계(키자루) 비패기 흘려보내기</button>
    `;
    stageCol.appendChild(showcaseBar);

    const mobileDock = this.createMobileVirtualControllerDock();
    stageCol.appendChild(mobileDock);

    main.appendChild(stageCol);

    this.configDrawer = this.createSideConfigDrawer();
    main.appendChild(this.configDrawer);

    this.rootEl.appendChild(main);

    this.settingsModal = this.createSettingsModal();
    this.rootEl.appendChild(this.settingsModal);

    this.bindUiEvents(topBar, showcaseBar);
    this.syncCombatLogDom();
  }

  private createMobileVirtualControllerDock(): HTMLElement {
    const dock = document.createElement('div');
    dock.className = 'mobile-gamepad-dock';
    dock.id = 'mobile-virtual-controller';
    dock.innerHTML = `
      <div class="dpad-grid" aria-label="가상 방향키">
        <div></div>
        <button class="dpad-btn" data-dir="UP">▲</button>
        <div></div>
        <button class="dpad-btn" data-dir="LEFT">◀</button>
        <div class="dpad-btn" style="font-size:10px;color:#38bdf8;">MOVE</div>
        <button class="dpad-btn" data-dir="RIGHT">▶</button>
        <div></div>
        <button class="dpad-btn" data-dir="DOWN">▼</button>
        <div></div>
      </div>
      <div class="action-pad-grid" aria-label="가상 액션 버튼">
        <button class="act-btn" data-act="SKILL_0" style="border-color:#38bdf8;">S1<span>스킬1</span></button>
        <button class="act-btn" data-act="SKILL_1" style="border-color:#38bdf8;">S2<span>스킬2</span></button>
        <button class="act-btn" data-act="FORM_SHIFT" style="border-color:#f59e0b;color:#fbbf24;">변신/각성<span>FORM</span></button>
        <button class="act-btn" data-act="SKILL_2" style="border-color:#38bdf8;">S3<span>스킬3</span></button>
        <button class="act-btn" data-act="SKILL_3" style="border-color:#38bdf8;">S4<span>스킬4</span></button>
        <button class="act-btn" data-act="DODGE" style="border-color:#2dd4bf;color:#2dd4bf;">회피<span>DODGE</span></button>
      </div>
    `;

    const setDir = (dir: string | null) => {
      if (dir === 'UP') this.input.virtualMoveVec = { x: 0, y: -1 };
      else if (dir === 'DOWN') this.input.virtualMoveVec = { x: 0, y: 1 };
      else if (dir === 'LEFT') this.input.virtualMoveVec = { x: -1, y: 0 };
      else if (dir === 'RIGHT') this.input.virtualMoveVec = { x: 1, y: 0 };
      else this.input.virtualMoveVec = { x: 0, y: 0 };
    };

    dock.querySelectorAll<HTMLButtonElement>('[data-dir]').forEach((btn) => {
      const dir = btn.dataset.dir ?? null;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        setDir(dir);
      });
      btn.addEventListener('pointerup', () => setDir(null));
      btn.addEventListener('pointerleave', () => setDir(null));
    });

    dock.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((btn) => {
      const act = btn.dataset.act as
        | 'SKILL_0'
        | 'SKILL_1'
        | 'SKILL_2'
        | 'SKILL_3'
        | 'DODGE'
        | 'FORM_SHIFT';
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.input.triggerVirtualAction(act);
      });
    });

    return dock;
  }

  private createSideConfigDrawer(): HTMLElement {
    const drawer = document.createElement('aside');
    drawer.className = 'side-drawer';

    const unitOptions = Object.values(this.registry.units)
      .map(
        (u) =>
          `<option value="${u.id}">${u.name} [${u.fruitType ?? u.element}]</option>`
      )
      .join('');
    const moveOptions = Object.values(this.registry.moves)
      .map(
        (m) =>
          `<option value="${m.id}">${m.name} (${m.archetype.slice(0, 4)}/${m.element})</option>`
      )
      .join('');
    const equipOptions = Object.values(this.registry.equipment)
      .map((eq) => `<option value="${eq.id}">${eq.name}</option>`)
      .join('');
    const traitOptions = Object.values(this.registry.traits)
      .map((t) => `<option value="${t.id}">${t.name}</option>`)
      .join('');
    const formOptions = Object.values(this.registry.forms)
      .map((f) => `<option value="${f.id}">${f.name}</option>`)
      .join('');
    const evOptions = Object.entries(EV_PRESETS)
      .map(([k, v]) => `<option value="${k}">${v.label}</option>`)
      .join('');

    const alphaLead = this.config.teamAlpha[0];
    const omegaLead = this.config.teamOmega[0];

    drawer.innerHTML = `
      <div class="config-card">
        <h4>🔵 ALPHA 리더 캐릭터 설정</h4>
        <div class="field-row"><label>캐릭터:</label><select id="alpha-unit">${unitOptions}</select></div>
        <div class="field-row"><label>육성(EV):</label><select id="alpha-ev">${evOptions}</select></div>
        <div class="field-row"><label>장비:</label><select id="alpha-eq">${equipOptions}</select></div>
        <div class="field-row"><label>특성/열매:</label><select id="alpha-trait">${traitOptions}</select></div>
        <div class="field-row"><label>각성 폼:</label><select id="alpha-form">${formOptions}</select></div>
        <div class="field-row"><label>스킬 1:</label><select id="alpha-m0">${moveOptions}</select></div>
        <div class="field-row"><label>스킬 2:</label><select id="alpha-m1">${moveOptions}</select></div>
        <div class="field-row"><label>스킬 3:</label><select id="alpha-m2">${moveOptions}</select></div>
        <div class="field-row"><label>스킬 4:</label><select id="alpha-m3">${moveOptions}</select></div>
      </div>

      <div class="config-card">
        <h4>🔴 OMEGA 리더 캐릭터 설정</h4>
        <div class="field-row"><label>캐릭터:</label><select id="omega-unit">${unitOptions}</select></div>
        <div class="field-row"><label>육성(EV):</label><select id="omega-ev">${evOptions}</select></div>
        <div class="field-row"><label>장비:</label><select id="omega-eq">${equipOptions}</select></div>
        <div class="field-row"><label>특성/열매:</label><select id="omega-trait">${traitOptions}</select></div>
        <div class="field-row"><label>각성 폼:</label><select id="omega-form">${formOptions}</select></div>
      </div>

      <div class="config-card">
        <h4>📜 실시간 패기 & 맞대결 전투 로그</h4>
        <div id="combat-log-box" class="combat-log-box"></div>
      </div>
    `;

    (drawer.querySelector('#alpha-unit') as HTMLSelectElement).value = alphaLead.speciesId;
    (drawer.querySelector('#alpha-ev') as HTMLSelectElement).value = this.selectedAlphaEvPreset;
    (drawer.querySelector('#alpha-eq') as HTMLSelectElement).value = alphaLead.equipmentId;
    (drawer.querySelector('#alpha-trait') as HTMLSelectElement).value = alphaLead.traitId;
    (drawer.querySelector('#alpha-form') as HTMLSelectElement).value = alphaLead.formId;
    alphaLead.moveIds.slice(0, 4).forEach((mId, idx) => {
      const sel = drawer.querySelector(`#alpha-m${idx}`) as HTMLSelectElement | null;
      if (sel) sel.value = mId;
    });

    (drawer.querySelector('#omega-unit') as HTMLSelectElement).value = omegaLead.speciesId;
    (drawer.querySelector('#omega-ev') as HTMLSelectElement).value = this.selectedOmegaEvPreset;
    (drawer.querySelector('#omega-eq') as HTMLSelectElement).value = omegaLead.equipmentId;
    (drawer.querySelector('#omega-trait') as HTMLSelectElement).value = omegaLead.traitId;
    (drawer.querySelector('#omega-form') as HTMLSelectElement).value = omegaLead.formId;

    this.logContainer = drawer.querySelector('#combat-log-box') as HTMLElement;
    return drawer;
  }

  private createSettingsModal(): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'settings-modal';
    const b = this.input.getBindings();

    modal.innerHTML = `
      <div class="modal-box" role="dialog" aria-label="접근성 및 조작 설정">
        <h3 style="color:#38bdf8;font-size:15px;">⚙ 접근성 및 키 바인딩 설정</h3>
        <div class="field-row">
          <label for="chk-flash">화면 번쩍임 효과 (Flash Effect):</label>
          <input type="checkbox" id="chk-flash" checked />
        </div>
        <div class="field-row">
          <label for="rng-shake">카메라 흔들림 강도 (0~100%):</label>
          <input type="range" id="rng-shake" min="0" max="100" value="80" />
        </div>
        <div class="field-row">
          <label for="chk-mute">오디오 음소거 (Mute Audio):</label>
          <input type="checkbox" id="chk-mute" />
        </div>
        <div class="field-row">
          <label for="chk-touch-ui">캔버스 가상 터치 UI 상시 표시:</label>
          <input type="checkbox" id="chk-touch-ui" />
        </div>
        <hr style="border-color:#1e293b;" />
        <div class="field-row">
          <label>회피 키 (Dodge):</label>
          <input type="text" id="bind-dodge" value="${b.dodge}" style="width:110px;" />
        </div>
        <div class="field-row">
          <label>변신/각성 키 (Form Shift):</label>
          <input type="text" id="bind-form" value="${b.formShift}" style="width:110px;" />
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px;">
          <button id="btn-reset-binds">초기화</button>
          <button id="btn-close-settings" class="btn-primary">닫기</button>
        </div>
      </div>
    `;
    return modal;
  }

  private bindUiEvents(topBar: HTMLElement, showcaseBar: HTMLElement): void {
    const selMode = topBar.querySelector('#sel-mode') as HTMLSelectElement;
    const selArena = topBar.querySelector('#sel-arena') as HTMLSelectElement;
    const selAi = topBar.querySelector('#sel-ai-level') as HTMLSelectElement;

    selMode.value = this.config.mode;
    selArena.value = this.config.arenaSizeKey;
    selAi.value = String(this.config.teamOmega[0]?.aiLevel ?? 4);

    const readDrawerIntoConfig = () => {
      this.config.mode = selMode.value as '1V1' | '2V2' | 'AI_VS_AI';
      this.config.arenaSizeKey = selArena.value as 'small' | 'medium' | 'large';
      const aiLevel = Number(selAi.value) || 4;

      for (const u of this.config.teamAlpha) u.aiLevel = aiLevel;
      for (const u of this.config.teamOmega) u.aiLevel = aiLevel;

      const alphaLead = this.config.teamAlpha[0];
      alphaLead.speciesId = (
        this.configDrawer.querySelector('#alpha-unit') as HTMLSelectElement
      ).value;
      this.selectedAlphaEvPreset = (
        this.configDrawer.querySelector('#alpha-ev') as HTMLSelectElement
      ).value;
      alphaLead.evs = {
        ...(EV_PRESETS[this.selectedAlphaEvPreset]?.evs ?? EV_PRESETS.balanced.evs)
      };
      alphaLead.equipmentId = (
        this.configDrawer.querySelector('#alpha-eq') as HTMLSelectElement
      ).value;
      alphaLead.traitId = (
        this.configDrawer.querySelector('#alpha-trait') as HTMLSelectElement
      ).value;
      alphaLead.formId = (
        this.configDrawer.querySelector('#alpha-form') as HTMLSelectElement
      ).value;
      alphaLead.moveIds = [0, 1, 2, 3].map(
        (idx) =>
          (this.configDrawer.querySelector(`#alpha-m${idx}`) as HTMLSelectElement).value
      );
      alphaLead.isPlayerControlled = this.config.mode !== 'AI_VS_AI';

      const omegaLead = this.config.teamOmega[0];
      omegaLead.speciesId = (
        this.configDrawer.querySelector('#omega-unit') as HTMLSelectElement
      ).value;
      this.selectedOmegaEvPreset = (
        this.configDrawer.querySelector('#omega-ev') as HTMLSelectElement
      ).value;
      omegaLead.evs = {
        ...(EV_PRESETS[this.selectedOmegaEvPreset]?.evs ?? EV_PRESETS.balanced.evs)
      };
      omegaLead.equipmentId = (
        this.configDrawer.querySelector('#omega-eq') as HTMLSelectElement
      ).value;
      omegaLead.traitId = (
        this.configDrawer.querySelector('#omega-trait') as HTMLSelectElement
      ).value;
      omegaLead.formId = (
        this.configDrawer.querySelector('#omega-form') as HTMLSelectElement
      ).value;
      omegaLead.moveIds = [
        ...(this.registry.units[omegaLead.speciesId]?.defaultMoves ?? omegaLead.moveIds)
      ];
    };

    this.configDrawer
      .querySelector('#alpha-unit')
      ?.addEventListener('change', (e) => {
        const spId = (e.target as HTMLSelectElement).value;
        const uDef = this.registry.units[spId];
        if (!uDef) return;
        (this.configDrawer.querySelector('#alpha-eq') as HTMLSelectElement).value =
          uDef.defaultEquipmentId;
        (this.configDrawer.querySelector('#alpha-trait') as HTMLSelectElement).value =
          uDef.traitId;
        (this.configDrawer.querySelector('#alpha-form') as HTMLSelectElement).value =
          uDef.defaultFormId;
        uDef.defaultMoves.forEach((mId, idx) => {
          const sel = this.configDrawer.querySelector(
            `#alpha-m${idx}`
          ) as HTMLSelectElement | null;
          if (sel) sel.value = mId;
        });
        readDrawerIntoConfig();
        this.restartBattle();
      });

    this.configDrawer
      .querySelector('#omega-unit')
      ?.addEventListener('change', (e) => {
        const spId = (e.target as HTMLSelectElement).value;
        const uDef = this.registry.units[spId];
        if (!uDef) return;
        (this.configDrawer.querySelector('#omega-eq') as HTMLSelectElement).value =
          uDef.defaultEquipmentId;
        (this.configDrawer.querySelector('#omega-trait') as HTMLSelectElement).value =
          uDef.traitId;
        (this.configDrawer.querySelector('#omega-form') as HTMLSelectElement).value =
          uDef.defaultFormId;
        readDrawerIntoConfig();
        this.restartBattle();
      });

    selMode.addEventListener('change', () => {
      readDrawerIntoConfig();
      this.restartBattle();
    });
    selArena.addEventListener('change', () => {
      readDrawerIntoConfig();
      this.restartBattle();
    });
    selAi.addEventListener('change', () => {
      readDrawerIntoConfig();
      this.restartBattle();
    });

    topBar.querySelector('#btn-restart')?.addEventListener('click', () => {
      readDrawerIntoConfig();
      this.restartBattle();
    });

    topBar.querySelector('#btn-save-preset')?.addEventListener('click', () => {
      readDrawerIntoConfig();
      this.platform.setStorageItem(PRESET_STORAGE_KEY, JSON.stringify(this.config));
      this.world.combatLog.push('[시스템] 현재 원피스 샌드박스 팀 프리셋이 저장되었습니다.');
      this.syncCombatLogDom();
    });

    topBar.querySelector('#btn-load-preset')?.addEventListener('click', () => {
      this.loadSavedPresetIfPresent();
      selMode.value = this.config.mode;
      selArena.value = this.config.arenaSizeKey;
      this.restartBattle();
      this.world.combatLog.push('[시스템] 저장된 팀 프리셋을 불러왔습니다.');
      this.syncCombatLogDom();
    });

    showcaseBar.querySelector('#btn-demo-beam')?.addEventListener('click', () => {
      this.triggerShowcaseScenario('BEAM_CLASH_KAIDO_KIZARU');
    });
    showcaseBar.querySelector('#btn-demo-melee')?.addEventListener('click', () => {
      this.triggerShowcaseScenario('CONQUEROR_CLASH_LUFFY_KAIDO');
    });
    showcaseBar.querySelector('#btn-demo-form')?.addEventListener('click', () => {
      this.triggerShowcaseScenario('HAGOROMO_AWAKENING');
    });
    showcaseBar.querySelector('#btn-demo-zoan')?.addEventListener('click', () => {
      this.triggerShowcaseScenario('ZOAN_STANCE_CYCLE');
    });
    showcaseBar.querySelector('#btn-demo-status')?.addEventListener('click', () => {
      this.triggerShowcaseScenario('LOGIA_VS_HAKI');
    });

    topBar.querySelector('#btn-settings')?.addEventListener('click', () => {
      this.settingsModal.classList.add('open');
    });
    this.settingsModal
      .querySelector('#btn-close-settings')
      ?.addEventListener('click', () => {
        this.settingsModal.classList.remove('open');
      });

    const chkFlash = this.settingsModal.querySelector('#chk-flash') as HTMLInputElement;
    chkFlash.addEventListener('change', () => {
      this.renderer.settings.flashEffectEnabled = chkFlash.checked;
    });

    const rngShake = this.settingsModal.querySelector('#rng-shake') as HTMLInputElement;
    rngShake.addEventListener('input', () => {
      this.renderer.settings.shakeIntensity = Number(rngShake.value) / 100;
    });

    const chkMute = this.settingsModal.querySelector('#chk-mute') as HTMLInputElement;
    chkMute.addEventListener('change', () => {
      this.audio.setMuted(chkMute.checked);
    });

    const chkTouch = this.settingsModal.querySelector('#chk-touch-ui') as HTMLInputElement;
    chkTouch.addEventListener('change', () => {
      this.input.forceShowTouchUi = chkTouch.checked;
    });

    const bindDodge = this.settingsModal.querySelector('#bind-dodge') as HTMLInputElement;
    bindDodge.addEventListener('change', () => {
      this.input.updateBinding('dodge' as keyof KeyBindingConfig, bindDodge.value.trim());
    });

    const bindForm = this.settingsModal.querySelector('#bind-form') as HTMLInputElement;
    bindForm.addEventListener('change', () => {
      this.input.updateBinding('formShift' as keyof KeyBindingConfig, bindForm.value.trim());
    });

    this.settingsModal
      .querySelector('#btn-reset-binds')
      ?.addEventListener('click', () => {
        this.input.resetBindings();
        const b = this.input.getBindings();
        bindDodge.value = b.dodge;
        bindForm.value = b.formShift;
      });
  }

  private attachCanvasInputEvents(): void {
    const c = this.renderer.canvas;
    c.addEventListener('pointerdown', (e) => {
      const pt = this.renderer.clientToLogical(e.clientX, e.clientY);
      this.input.handleCanvasPointerDown(pt);
    });
    c.addEventListener('pointermove', (e) => {
      const pt = this.renderer.clientToLogical(e.clientX, e.clientY);
      this.input.handleCanvasPointerMove(pt);
    });
    window.addEventListener('pointerup', () => {
      this.input.handleCanvasPointerUp();
    });
  }

  private syncCombatLogDom(): void {
    if (!this.logContainer) return;
    if (this.world.combatLog.length === this.lastLogCount) return;
    this.lastLogCount = this.world.combatLog.length;

    const recent = this.world.combatLog.slice(-18);
    this.logContainer.innerHTML = recent
      .map((line) => `<div>${line}</div>`)
      .join('');
    this.logContainer.scrollTop = this.logContainer.scrollHeight;
  }

  private loop(nowMs: number): void {
    const frameDtSec = Math.min(0.1, Math.max(0, (nowMs - this.lastTimeMs) / 1000));
    this.lastTimeMs = nowMs;

    this.frameCounter += 1;
    if (nowMs - this.fpsTimerMs >= 500) {
      this.fps = Math.min(
        60,
        Math.max(1, Math.round((this.frameCounter * 1000) / (nowMs - this.fpsTimerMs)))
      );
      this.frameCounter = 0;
      this.fpsTimerMs = nowMs;
    }

    this.accumulator += frameDtSec;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < 6) {
      const playerUnit = this.world.units.find(
        (u) => u.team === 'ALPHA' && u.isOnField && u.isAlive && u.isPlayerControlled
      );
      const playerCmd = this.input.buildPlayerCommand(
        playerUnit,
        this.world,
        this.registry
      );
      const cmds = playerCmd ? [playerCmd] : [];

      stepBattleWorld(this.world, cmds, this.registry, this.prng, FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps += 1;
    }

    const alpha = this.accumulator / FIXED_DT;
    renderBattleArena(
      this.renderer.ctx,
      this.world,
      this.registry,
      this.assets,
      alpha,
      this.renderer.settings
    );
    renderBattleHud(
      this.renderer.ctx,
      this.world,
      this.registry,
      this.input.getBindings(),
      this.fps,
      this.input.isTouchViewport()
    );
    renderTouchOverlay(this.renderer.ctx, this.input);

    this.syncCombatLogDom();

    requestAnimationFrame((t) => this.loop(t));
  }
}
