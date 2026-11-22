import { ExternalAssetResolver } from '../assets/externalAssetResolver';
import type { Disposable } from '../core/types/disposable';
import {
  defaultAssetManifestRegistry,
  type AssetManifestRegistry
} from '../data/assets/assetManifestRegistry';
import {
  RetroAudioEngine,
  type BattleBgmMood
} from './retroAudioEngine';
import type { SfxPlayResult, StandardSfxId } from './sfxManager';

export type SfxKind =
  | 'CAST'
  | 'HIT'
  | 'CLASH'
  | 'JUST_DODGE'
  | 'FORM_SHIFT'
  | 'UI_CLICK';

const LEGACY_SFX_MAP: Record<SfxKind, StandardSfxId> = {
  CAST: 'beam_fire',
  HIT: 'blunt_hit',
  CLASH: 'melee_clash_clang',
  JUST_DODGE: 'just_dodge_chime',
  FORM_SHIFT: 'transform_burst',
  UI_CLICK: 'ui_confirm'
};

export class AudioManager implements Disposable {
  public readonly engine: RetroAudioEngine;

  constructor(
    resolver: ExternalAssetResolver = new ExternalAssetResolver(),
    manifestRegistry: AssetManifestRegistry = defaultAssetManifestRegistry
  ) {
    this.engine = new RetroAudioEngine(resolver, manifestRegistry);
  }

  public attachGestureUnlock(): void {
    this.engine.attachGestureUnlock();
  }

  public unlock(): boolean {
    return this.engine.unlock();
  }

  public setMuted(muted: boolean): void {
    this.engine.setMuted(muted);
  }

  public isMuted(): boolean {
    return this.engine.isMuted();
  }

  public setMasterVolume(vol: number): void {
    this.engine.setMasterVolume(vol);
  }

  public setBgmVolume(vol: number): void {
    this.engine.setBgmVolume(vol);
  }

  public setSfxVolume(vol: number): void {
    this.engine.setSfxVolume(vol);
  }

  public getVolumes(): { master: number; bgm: number; sfx: number; muted: boolean } {
    return this.engine.getVolumes();
  }

  public async playBgm(
    trackId: string,
    options?: { forceRestart?: boolean; crossfadeSec?: number }
  ): Promise<void> {
    await this.engine.playBgm(trackId, options);
  }

  public async setBattleMood(mood: BattleBgmMood): Promise<void> {
    await this.engine.setBattleMood(mood);
  }

  public setBreakFilterActive(active: boolean): void {
    this.engine.setBreakFilterActive(active);
  }

  public stopBgm(fadeOutSec = 0.35): void {
    this.engine.stopBgm(fadeOutSec);
  }

  public getCurrentBgmId(): string | null {
    return this.engine.getCurrentBgmId();
  }

  public getCurrentBgmSource(): 'EXTERNAL_OGG' | 'CHIPTUNE_FALLBACK' {
    return this.engine.getCurrentBgmSource();
  }

  public playSfx(kind: SfxKind): SfxPlayResult {
    return this.engine.playSfxById(LEGACY_SFX_MAP[kind]);
  }

  public playSfxId(sfxId: StandardSfxId | string): SfxPlayResult {
    return this.engine.playSfxById(sfxId);
  }

  public dispose(): void {
    this.engine.dispose();
  }
}
