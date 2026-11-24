import { Container, Graphics, UniformGroup, type Filter } from 'pixi.js';
import type { BattleWorldState, UnitRuntimeState } from '../../../core/types/battleState';
import type { Disposable } from '../../../core/types/disposable';
import { clamp } from '../../../core/math/vector2';
import type { VisualPolishConfig } from '../../backend/renderBackend';
import type { ViewportMetrics } from '../../viewport/responsiveViewportManager';
import type { DynamicPointLightInput } from './DynamicLightingLayer';
import { getBossAuraProfile } from './giantBossAuraProfiles';
import { createGlslFilter } from './glslUtils';

const CHROMATIC_FORESIGHT_FRAG = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uIntensity;
uniform float uTime;
uniform vec2 uCenter;

void main(void) {
    vec2 diff = vTextureCoord - uCenter;
    float wave = sin(length(diff) * 28.0 - uTime * 8.0) * 0.5 + 0.5;
    vec2 shift = normalize(diff + vec2(0.0001)) * (uIntensity * (0.55 + wave * 0.45));
    float r = texture(uTexture, clamp(vTextureCoord + shift, vec2(0.001), vec2(0.999))).r;
    vec4 gSample = texture(uTexture, vTextureCoord);
    float b = texture(uTexture, clamp(vTextureCoord - shift, vec2(0.001), vec2(0.999))).b;
    finalColor = vec4(r, gSample.g, b, gSample.a);
}
`;

const MAX_GROUND_CRACKS = 12;
const MAX_BOSS_LIGHTS = 6;

interface GroundCrackDecal {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  lifeSec: number;
  maxLifeSec: number;
  color: number;
}

export interface GiantCameraFramingResult {
  zoom: number;
  targetZoom: number;
  headroomOffsetY: number;
  hasGiant: boolean;
}

export interface BossPhaseCutinTrigger {
  unitId: string;
  headline: string;
  subline: string;
}

export interface GiantBossPipelineStepResult {
  bloomBoost: number;
  lights: readonly DynamicPointLightInput[];
  shockwavePoints: readonly { x: number; y: number }[];
  phaseCutin: BossPhaseCutinTrigger | null;
}

export class GiantBossShaderPipeline implements Disposable {
  public readonly floorTelegraphLayer = new Container();
  public readonly groundCrackLayer = new Container();
  public readonly auraEmissiveLayer = new Container();
  public readonly chromaticFilter: Filter;

  private readonly telegraphGfx = new Graphics();
  private readonly crackGfx = new Graphics();
  private readonly auraGfx = new Graphics();
  private readonly chromaticUniforms: UniformGroup<{
    uIntensity: { value: number; type: 'f32' };
    uTime: { value: number; type: 'f32' };
    uCenter: { value: Float32Array; type: 'vec2<f32>' };
  }>;

  private readonly crackPool: GroundCrackDecal[] = [];
  private readonly scratchLights: DynamicPointLightInput[] = [];
  private readonly scratchShockwaves: { x: number; y: number }[] = [];
  private readonly triggeredPhaseCutinUnits = new Set<string>();
  private readonly seenSaturnGlareIds = new Set<string>();
  private readonly seenLokiSlamIds = new Set<string>();

  private nextCrackSlot = 0;
  private lastRaidDpsActive = false;
  private elapsedSec = 0;
  private smoothedZoom = 1.0;
  private targetZoom = 1.0;
  private smoothedHeadroomY = 0;
  private disposed = false;

  constructor() {
    this.floorTelegraphLayer.label = 'giant_boss_telegraph_layer';
    this.groundCrackLayer.label = 'giant_boss_ground_cracks';
    this.auraEmissiveLayer.label = 'giant_boss_aura_emissive';

    this.floorTelegraphLayer.addChild(this.telegraphGfx);
    this.groundCrackLayer.addChild(this.crackGfx);
    this.auraEmissiveLayer.addChild(this.auraGfx);

    for (let i = 0; i < MAX_GROUND_CRACKS; i++) {
      this.crackPool.push({
        active: false,
        x: 0,
        y: 0,
        radius: 36,
        lifeSec: 0,
        maxLifeSec: 4.5,
        color: 0xfacc15
      });
    }

    this.chromaticUniforms = new UniformGroup({
      uIntensity: { value: 0.0, type: 'f32' },
      uTime: { value: 0.0, type: 'f32' },
      uCenter: { value: new Float32Array([0.5, 0.5]), type: 'vec2<f32>' }
    });
    this.chromaticFilter = createGlslFilter({
      name: 'opgv-giant-foresight-chromatic',
      fragment: CHROMATIC_FORESIGHT_FRAG,
      resources: { chromaUniforms: this.chromaticUniforms },
      padding: 0
    });
    this.chromaticFilter.enabled = false;
  }

  public get currentCameraZoom(): number {
    return this.smoothedZoom;
  }

  public get targetCameraZoom(): number {
    return this.targetZoom;
  }

  public get headroomOffsetY(): number {
    return this.smoothedHeadroomY;
  }

  public get activeGroundCrackCount(): number {
    let count = 0;
    for (const c of this.crackPool) {
      if (c.active) count += 1;
    }
    return count;
  }

  public computeCameraFraming(
    world: BattleWorldState,
    viewport: ViewportMetrics,
    dtSec = 1 / 60
  ): GiantCameraFramingResult {
    let maxScale = 1.0;
    for (let i = 0; i < world.units.length; i++) {
      const u = world.units[i];
      if (!u || !u.isOnField || !u.isAlive) continue;
      const eff = u.entityScale * u.visualScale;
      if (eff > maxScale) maxScale = eff;
    }

    const hasGiant = maxScale >= 1.5;
    this.targetZoom = hasGiant
      ? Number(clamp(0.85 - (maxScale - 1.5) * 0.08, 0.78, 0.85).toFixed(4))
      : 1.0;
    const targetHeadroomY = hasGiant
      ? Math.round(viewport.safeRect.top * 0.35 + 14 + (1 - this.targetZoom) * 48)
      : 0;

    const rate = Math.min(1, Math.max(0.05, dtSec * 8));
    this.smoothedZoom += (this.targetZoom - this.smoothedZoom) * rate;
    this.smoothedHeadroomY += (targetHeadroomY - this.smoothedHeadroomY) * rate;

    if (Math.abs(this.targetZoom - this.smoothedZoom) < 0.002) {
      this.smoothedZoom = this.targetZoom;
    }
    if (Math.abs(targetHeadroomY - this.smoothedHeadroomY) < 0.5) {
      this.smoothedHeadroomY = targetHeadroomY;
    }

    return {
      zoom: this.smoothedZoom,
      targetZoom: this.targetZoom,
      headroomOffsetY: Math.round(this.smoothedHeadroomY),
      hasGiant
    };
  }

  public step(
    world: BattleWorldState,
    cam: { x: number; y: number },
    viewport: ViewportMetrics,
    polish: VisualPolishConfig,
    dtSec = 1 / 60
  ): GiantBossPipelineStepResult {
    if (this.disposed) {
      return { bloomBoost: 0, lights: [], shockwavePoints: [], phaseCutin: null };
    }
    const dt = Math.min(0.05, Math.max(0.001, dtSec));
    this.elapsedSec += dt;
    this.scratchLights.length = 0;
    this.scratchShockwaves.length = 0;

    this.renderTelegraphs(world, polish);
    this.updateGroundCracks(dt);
    const auraRes = this.renderBossAurasAndFieldDistortions(world, cam, viewport, polish);
    const phaseCutin = this.detectBossPhaseCutin(world);

    return {
      bloomBoost: auraRes.bloomBoost,
      lights: this.scratchLights,
      shockwavePoints: this.scratchShockwaves,
      phaseCutin
    };
  }

  private unitHasActiveMeleeArc(world: BattleWorldState, unitId: string): boolean {
    for (let i = 0; i < world.meleeArcs.length; i++) {
      const arc = world.meleeArcs[i];
      if (arc && !arc.finished && arc.ownerUnitId === unitId) return true;
    }
    return false;
  }

  private renderTelegraphs(world: BattleWorldState, polish: VisualPolishConfig): void {
    this.telegraphGfx.clear();
    const calmMode = !polish.flashEffectEnabled;
    const pulse = calmMode ? 0.85 : 0.72 + 0.28 * Math.sin(this.elapsedSec * 9.0);

    if (world.raidState.active) {
      for (const tele of world.raidState.telegraphs) {
        const prog = clamp(tele.elapsedSec / Math.max(0.1, tele.durationSec), 0, 1);
        const tx = Math.round(tele.origin.x);
        const ty = Math.round(tele.origin.y);

        if (tele.shape === 'SAFE_ZONE') {
          this.telegraphGfx.rect(0, 0, world.arenaWidth, world.arenaHeight);
          this.telegraphGfx.fill({ color: 0x991b1b, alpha: 0.16 + prog * 0.14 });
          this.telegraphGfx.circle(tx, ty, tele.radiusPx);
          this.telegraphGfx.fill({ color: 0x22c55e, alpha: 0.22 });
          this.telegraphGfx.stroke({ color: 0x4ade80, width: 3, alpha: 0.92 * pulse });
          continue;
        }

        if (tele.shape === 'CIRCLE') {
          this.telegraphGfx.circle(tx, ty, tele.radiusPx);
          this.telegraphGfx.fill({ color: 0xdc2626, alpha: 0.16 });
          this.telegraphGfx.circle(tx, ty, Math.max(6, tele.radiusPx * prog));
          this.telegraphGfx.fill({ color: 0xf97316, alpha: 0.26 + prog * 0.22 });
          this.telegraphGfx.circle(tx, ty, tele.radiusPx);
          this.telegraphGfx.stroke({ color: 0xfef08a, width: 2.5, alpha: 0.88 * pulse });
        } else if (tele.shape === 'CONE') {
          const baseAng = Math.atan2(tele.dir.y, tele.dir.x);
          const halfRad = ((tele.arcDeg * Math.PI) / 180) * 0.5;
          this.telegraphGfx.moveTo(tx, ty);
          this.telegraphGfx.arc(tx, ty, tele.radiusPx, baseAng - halfRad, baseAng + halfRad);
          this.telegraphGfx.closePath();
          this.telegraphGfx.fill({ color: 0xdc2626, alpha: 0.18 });

          const innerR = Math.max(8, tele.radiusPx * prog);
          this.telegraphGfx.moveTo(tx, ty);
          this.telegraphGfx.arc(tx, ty, innerR, baseAng - halfRad, baseAng + halfRad);
          this.telegraphGfx.closePath();
          this.telegraphGfx.fill({ color: 0xf97316, alpha: 0.34 });
          this.telegraphGfx.stroke({ color: 0xfef08a, width: 2.5, alpha: 0.9 * pulse });
        } else if (tele.shape === 'CROSS_BEAM') {
          const hw = tele.widthPx * 0.5;
          const iw = Math.max(6, tele.widthPx * prog);
          this.telegraphGfx.rect(0, Math.round(ty - hw), world.arenaWidth, tele.widthPx);
          this.telegraphGfx.rect(Math.round(tx - hw), 0, tele.widthPx, world.arenaHeight);
          this.telegraphGfx.fill({ color: 0xdc2626, alpha: 0.16 });

          this.telegraphGfx.rect(0, Math.round(ty - iw * 0.5), world.arenaWidth, Math.round(iw));
          this.telegraphGfx.rect(Math.round(tx - iw * 0.5), 0, Math.round(iw), world.arenaHeight);
          this.telegraphGfx.fill({ color: 0xfb7185, alpha: 0.36 });

          this.telegraphGfx.rect(0, Math.round(ty - hw), world.arenaWidth, tele.widthPx);
          this.telegraphGfx.rect(Math.round(tx - hw), 0, tele.widthPx, world.arenaHeight);
          this.telegraphGfx.stroke({ color: 0xfef08a, width: 2, alpha: 0.88 * pulse });
        }
      }
    }

    if (world.impelDownHazard.pendingTrapPos && world.impelDownHazard.pendingTrapTelegraphTimer > 0) {
      const p = world.impelDownHazard.pendingTrapPos;
      this.telegraphGfx.circle(Math.round(p.x), Math.round(p.y), 46);
      this.telegraphGfx.fill({ color: 0xa855f7, alpha: 0.24 });
      this.telegraphGfx.stroke({ color: 0xe879f9, width: 2.5, alpha: pulse });
    }

    if (world.birdcage.active) {
      const cw = Math.round(world.arenaWidth * world.birdcage.shrinkScale);
      const ch = Math.round(world.arenaHeight * world.birdcage.shrinkScale);
      const cx = Math.round((world.arenaWidth - cw) * 0.5);
      const cy = Math.round((world.arenaHeight - ch) * 0.5);
      this.telegraphGfx.rect(cx, cy, cw, ch);
      this.telegraphGfx.stroke({ color: 0xf43f5e, width: 3, alpha: 0.8 * pulse });
    }
  }

  private spawnGroundCrack(x: number, y: number, radius: number, color: number): void {
    const slot = this.crackPool[this.nextCrackSlot % MAX_GROUND_CRACKS];
    this.nextCrackSlot += 1;
    if (!slot) return;
    slot.active = true;
    slot.x = Math.round(x);
    slot.y = Math.round(y);
    slot.radius = radius;
    slot.lifeSec = 4.5;
    slot.maxLifeSec = 4.5;
    slot.color = color;
  }

  private updateGroundCracks(dtSec: number): void {
    this.crackGfx.clear();
    for (const c of this.crackPool) {
      if (!c.active) continue;
      c.lifeSec -= dtSec;
      if (c.lifeSec <= 0) {
        c.active = false;
        continue;
      }
      const alpha = clamp(c.lifeSec / c.maxLifeSec, 0, 1) * 0.78;
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI * 2 * i) / 6 + (c.x % 7) * 0.12;
        const ex = c.x + Math.cos(ang) * c.radius;
        const ey = c.y + Math.sin(ang) * c.radius * 0.55;
        this.crackGfx.moveTo(c.x, c.y);
        this.crackGfx.lineTo(ex, ey);
        this.crackGfx.stroke({ color: 0x090d16, width: 3, alpha });
        this.crackGfx.moveTo(c.x, c.y);
        this.crackGfx.lineTo(ex * 0.92 + c.x * 0.08, ey * 0.92 + c.y * 0.08);
        this.crackGfx.stroke({ color: c.color, width: 1.4, alpha: alpha * 0.85 });
      }
    }
  }

  private renderBossAurasAndFieldDistortions(
    world: BattleWorldState,
    cam: { x: number; y: number },
    viewport: ViewportMetrics,
    polish: VisualPolishConfig
  ): { bloomBoost: number } {
    this.auraGfx.clear();
    let bloomBoost = 0;
    let foresightUnit: UnitRuntimeState | null = null;
    const calmMode = !polish.flashEffectEnabled;

    // Law ROOM refracting cyan dome from active fieldZones
    for (const zone of world.fieldZones) {
      if (zone.fieldKind !== 'DOME_SHIELD') continue;
      const zx = Math.round(zone.pos.x);
      const zy = Math.round(zone.pos.y);
      this.auraGfx.circle(zx, zy, zone.radiusPx);
      this.auraGfx.fill({ color: 0x38bdf8, alpha: 0.14 });
      this.auraGfx.stroke({ color: 0x7dd3fc, width: 2.5, alpha: 0.88 });
      bloomBoost = Math.max(bloomBoost, 0.18);
    }

    for (const u of world.units) {
      if (!u.isOnField || !u.isAlive) continue;
      const prof = getBossAuraProfile(u.speciesId);
      const isAwakened = u.bossPhase2Triggered || u.activeFormKind !== null || u.entityScale >= 1.45;
      if (!prof && !isAwakened) continue;

      const rimCol = prof?.rimColorHex ?? 0xfacc15;
      const secCol = prof?.secondaryColorHex ?? 0x38bdf8;
      const ux = Math.round(u.pos.x);
      const uy = Math.round(u.pos.y);
      const rimR = Math.round(u.radiusPx * (1.28 + 0.08 * Math.sin(this.elapsedSec * 5)));

      if (isAwakened || u.isBossUnit) {
        this.auraGfx.circle(ux, uy, rimR);
        this.auraGfx.stroke({
          color: rimCol,
          width: u.bossPhase2Triggered ? 3.2 : 2.2,
          alpha: calmMode ? 0.55 : 0.82
        });
        bloomBoost = Math.max(bloomBoost, u.bossPhase2Triggered ? 0.34 : 0.2);
      }

      if (prof?.auraStyle === 'CONQUEROR_DRAGON' || prof?.auraStyle === 'MYTHIC_THUNDER') {
        const bolts = calmMode ? 2 : 4;
        for (let i = 0; i < bolts; i++) {
          const ang = this.elapsedSec * 3.4 + (Math.PI * 2 * i) / bolts;
          const bx = ux + Math.cos(ang) * (rimR + 10);
          const by = uy + Math.sin(ang) * (rimR * 0.65 + 6);
          this.auraGfx.moveTo(ux, uy - 12);
          this.auraGfx.lineTo((ux + bx) * 0.5 + 6, (uy + by) * 0.5 - 10);
          this.auraGfx.lineTo(bx, by);
          this.auraGfx.stroke({ color: i % 2 === 0 ? rimCol : secCol, width: 2, alpha: 0.85 });
        }
      } else if (prof?.auraStyle === 'TOXIC_YOKAI' || prof?.auraStyle === 'BLACK_HAGOROMO') {
        for (let i = 0; i < 4; i++) {
          const ang = this.elapsedSec * 2.2 + (Math.PI * 2 * i) / 4;
          const cx = ux + Math.cos(ang) * (rimR + 6);
          const cy = uy - 18 + Math.sin(ang) * (rimR * 0.5);
          this.auraGfx.circle(cx, cy, 8);
          this.auraGfx.fill({ color: prof.auraStyle === 'BLACK_HAGOROMO' ? 0x1e1b4b : rimCol, alpha: 0.45 });
        }
      } else if (prof?.auraStyle === 'LIGHT_MIRROR' && u.windupMoveId) {
        for (let i = 0; i < 4; i++) {
          const ang = this.elapsedSec * 4 + (Math.PI * i) * 0.5;
          this.auraGfx.moveTo(ux, uy - 10);
          this.auraGfx.lineTo(ux + Math.cos(ang) * 90, uy - 10 + Math.sin(ang) * 60);
          this.auraGfx.stroke({ color: rimCol, width: 2.5, alpha: 0.85 });
        }
      }

      if (prof?.hasGlareShockwave && (u.bossPhase2Triggered || u.windupMoveId !== null)) {
        const glareKey = `${u.instanceId}_${u.windupMoveId ?? 'p2'}_${Math.floor(world.tick / 90)}`;
        if (!this.seenSaturnGlareIds.has(glareKey)) {
          this.seenSaturnGlareIds.add(glareKey);
          this.scratchShockwaves.push({ x: ux, y: uy - 18 });
        }
      }

      if (prof?.hasGroundCrackDecals && (u.windupMoveId !== null || this.unitHasActiveMeleeArc(world, u.instanceId))) {
        const slamKey = `${u.instanceId}_${Math.floor(world.tick / 45)}`;
        if (!this.seenLokiSlamIds.has(slamKey)) {
          this.seenLokiSlamIds.add(slamKey);
          this.spawnGroundCrack(ux, uy + 14, 48, rimCol);
        }
      }

      if (prof?.hasChromaticForesight && u.foresightFocus > 0 && u.foresightBreakTimer <= 0) {
        foresightUnit = u;
      }

      if (this.scratchLights.length < MAX_BOSS_LIGHTS && (u.isBossUnit || u.entityScale >= 1.45)) {
        this.scratchLights.push({
          x: ux + cam.x,
          y: uy - 22 + cam.y,
          radiusPx: prof?.lightRadiusPx ?? 140,
          colorInt: rimCol,
          intensity: u.bossPhase2Triggered ? 1.05 : 0.78,
          flickerSpeed: 3.5,
          flickerAmp: calmMode ? 0.02 : 0.1
        });
      }
    }

    // Katakuri Foresight / Law ROOM Chromatic Aberration Filter
    if (foresightUnit && polish.quality !== 'LOW' && polish.flashEffectEnabled) {
      this.chromaticFilter.enabled = true;
      this.chromaticUniforms.uniforms.uTime = this.elapsedSec;
      this.chromaticUniforms.uniforms.uIntensity = 0.0055;
      const c = this.chromaticUniforms.uniforms.uCenter;
      c[0] = clamp((foresightUnit.pos.x + cam.x) / Math.max(1, viewport.viewWidth), 0.1, 0.9);
      c[1] = clamp((foresightUnit.pos.y + cam.y) / Math.max(1, viewport.viewHeight), 0.1, 0.9);
    } else {
      this.chromaticFilter.enabled = false;
    }

    return { bloomBoost };
  }

  private detectBossPhaseCutin(world: BattleWorldState): BossPhaseCutinTrigger | null {
    for (const u of world.units) {
      if (!u.isBossUnit || !u.isOnField || !u.isAlive) continue;
      if (u.bossPhase2Triggered && !this.triggeredPhaseCutinUnits.has(u.instanceId)) {
        this.triggeredPhaseCutinUnits.add(u.instanceId);
        const prof = getBossAuraProfile(u.speciesId);
        return {
          unitId: u.speciesId,
          headline: prof?.phase2Headline ?? `${u.name} — 2페이즈 각성!`,
          subline: prof?.phase2Subline ?? '강력한 필살 공격에 대비하십시오!'
        };
      }
    }

    const dpsActive = world.raidState.active && world.raidState.dpsCheck.active;
    if (dpsActive && !this.lastRaidDpsActive) {
      this.lastRaidDpsActive = true;
      const boss = world.units.find((u) => u.instanceId === world.raidState.bossUnitId);
      const prof = boss ? getBossAuraProfile(boss.speciesId) : null;
      return {
        unitId: boss?.speciesId ?? 'kaido',
        headline: prof?.phase2Headline ?? `${world.raidState.bossName} — 레이드 필살 전조!`,
        subline: '집중 공격으로 보스 보호막을 파괴하십시오!'
      };
    }
    if (!dpsActive) {
      this.lastRaidDpsActive = false;
    }
    return null;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.chromaticFilter.destroy();
    this.floorTelegraphLayer.destroy({ children: true, texture: false });
    this.groundCrackLayer.destroy({ children: true, texture: false });
    this.auraEmissiveLayer.destroy({ children: true, texture: false });
    this.crackPool.length = 0;
    this.scratchLights.length = 0;
    this.scratchShockwaves.length = 0;
    this.triggeredPhaseCutinUnits.clear();
    this.seenSaturnGlareIds.clear();
    this.seenLokiSlamIds.clear();
  }
}
