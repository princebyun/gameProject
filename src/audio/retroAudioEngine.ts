import { ExternalAssetResolver } from '../assets/externalAssetResolver';
import type { Disposable } from '../core/types/disposable';
import {
  defaultAssetManifestRegistry,
  type AssetManifestRegistry
} from '../data/assets/assetManifestRegistry';
import type { BgmTrackManifestEntry } from '../data/assets/types';
import { ChiptuneSynthPlayer } from './chiptuneSynthPlayer';
import { SfxManager, type SfxPlayResult } from './sfxManager';
import { attachOnEndedDisconnect, disconnectAudioNodes } from './webAudioCleanup';

export type BattleBgmMood =
  | 'NORMAL'
  | 'BOSS'
  | 'YONKO_AWAKENING'
  | 'RAID_GIANT';

interface ActiveExternalBgmNode {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export class RetroAudioEngine implements Disposable {
  public readonly resolver: ExternalAssetResolver;
  public readonly manifestRegistry: AssetManifestRegistry;
  public readonly sfx: SfxManager;

  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmBusGain: GainNode | null = null;
  private bgmFilter: BiquadFilterNode | null = null;
  private sfxBusGain: GainNode | null = null;

  private masterVolume = 1.0;
  private bgmVolume = 0.7;
  private sfxVolume = 0.8;
  private muted = false;

  private currentBgmId: string | null = null;
  private currentBgmSource: 'EXTERNAL_OGG' | 'CHIPTUNE_FALLBACK' =
    'CHIPTUNE_FALLBACK';
  private bgmSourceStatus = new Map<string, 'EXTERNAL_OGG' | 'CHIPTUNE_FALLBACK'>();
  private breakFilterActive = false;
  private unlocked = false;
  private gestureAbortController: AbortController | null = null;

  private chiptune = new ChiptuneSynthPlayer();
  private externalBgmNode: ActiveExternalBgmNode | null = null;
  private bgmRequestToken = 0;

  constructor(
    resolver: ExternalAssetResolver = new ExternalAssetResolver(),
    manifestRegistry: AssetManifestRegistry = defaultAssetManifestRegistry,
    sfxRng: () => number = Math.random
  ) {
    this.resolver = resolver;
    this.manifestRegistry = manifestRegistry;
    this.sfx = new SfxManager(resolver, manifestRegistry, sfxRng);
    this.sfx.setVolume(this.sfxVolume);
  }

  public attachGestureUnlock(): void {
    if (this.gestureAbortController || typeof window === 'undefined') return;
    this.gestureAbortController = new AbortController();
    const { signal } = this.gestureAbortController;
    const unlockHandler = () => {
      this.unlock();
    };
    window.addEventListener('pointerdown', unlockHandler, { passive: true, signal });
    window.addEventListener('touchstart', unlockHandler, { passive: true, signal });
    window.addEventListener('keydown', unlockHandler, { passive: true, signal });
  }

  public detachGestureUnlock(): void {
    this.gestureAbortController?.abort();
    this.gestureAbortController = null;
  }

  public unlock(): boolean {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    this.unlocked = true;
    this.detachGestureUnlock();
    // If a BGM was requested before first user gesture, kick it off now
    if (
      this.currentBgmId &&
      !this.chiptune.getIsPlaying() &&
      !this.externalBgmNode
    ) {
      const pendingId = this.currentBgmId;
      this.currentBgmId = null;
      void this.playBgm(pendingId, { crossfadeSec: 0.25 });
    }
    return true;
  }

  public isUnlocked(): boolean {
    return this.unlocked;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.bgmBusGain = this.ctx.createGain();
        this.bgmFilter = this.ctx.createBiquadFilter();
        this.sfxBusGain = this.ctx.createGain();

        this.bgmFilter.type = 'lowpass';
        this.bgmFilter.frequency.setValueAtTime(
          this.breakFilterActive ? 720 : 20000,
          this.ctx.currentTime
        );
        this.bgmFilter.Q.setValueAtTime(1.1, this.ctx.currentTime);

        this.bgmBusGain.connect(this.bgmFilter);
        this.bgmFilter.connect(this.masterGain);
        this.sfxBusGain.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        this.applyGainValues();
      } catch {
        this.ctx = null;
        return null;
      }
    }
    return this.ctx;
  }

  private applyGainValues(): void {
    if (!this.ctx || !this.masterGain || !this.bgmBusGain || !this.sfxBusGain) {
      return;
    }
    const now = this.ctx.currentTime;
    const master = this.muted ? 0 : this.masterVolume;
    this.masterGain.gain.setTargetAtTime(master, now, 0.02);
    this.bgmBusGain.gain.setTargetAtTime(this.bgmVolume, now, 0.03);
    this.sfxBusGain.gain.setTargetAtTime(1.0, now, 0.02);
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.sfx.setMuted(muted);
    this.applyGainValues();
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMasterVolume(vol: number): void {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    this.applyGainValues();
  }

  public setBgmVolume(vol: number): void {
    this.bgmVolume = Math.max(0, Math.min(1, vol));
    this.applyGainValues();
  }

  public setSfxVolume(vol: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
    this.sfx.setVolume(this.sfxVolume);
    this.applyGainValues();
  }

  public getVolumes(): { master: number; bgm: number; sfx: number; muted: boolean } {
    return {
      master: this.masterVolume,
      bgm: this.bgmVolume,
      sfx: this.sfxVolume,
      muted: this.muted
    };
  }

  public getCurrentBgmId(): string | null {
    return this.currentBgmId;
  }

  public getCurrentBgmSource(): 'EXTERNAL_OGG' | 'CHIPTUNE_FALLBACK' {
    return this.currentBgmSource;
  }

  public getBgmSourceStatus(
    trackId: string
  ): 'EXTERNAL_OGG' | 'CHIPTUNE_FALLBACK' {
    return this.bgmSourceStatus.get(trackId) ?? 'CHIPTUNE_FALLBACK';
  }

  public isBreakFilterActive(): boolean {
    return this.breakFilterActive;
  }

  /**
   * Boss break / groggy low-pass filter effect (muffles highs to 720Hz, restores to 20kHz).
   */
  public setBreakFilterActive(active: boolean): void {
    if (this.breakFilterActive === active) return;
    this.breakFilterActive = active;
    if (this.ctx && this.bgmFilter) {
      const now = this.ctx.currentTime;
      this.bgmFilter.frequency.cancelScheduledValues(now);
      this.bgmFilter.frequency.setTargetAtTime(active ? 720 : 20000, now, 0.14);
    }
  }

  public async playBgm(
    trackId: string,
    options?: { forceRestart?: boolean; crossfadeSec?: number }
  ): Promise<{
    trackId: string;
    source: 'EXTERNAL_OGG' | 'CHIPTUNE_FALLBACK';
    crossfadeSec: number;
  } | null> {
    const track = this.manifestRegistry.bgmById[trackId];
    if (!track) return null;

    const fadeSec =
      options?.crossfadeSec ?? this.manifestRegistry.audioFile.crossfadeSec ?? 0.6;

    if (this.currentBgmId === trackId && !options?.forceRestart) {
      return {
        trackId,
        source: this.currentBgmSource,
        crossfadeSec: fadeSec
      };
    }

    const requestToken = ++this.bgmRequestToken;
    this.currentBgmId = trackId;

    const ctx = this.ensureContext();
    const resolved = await this.resolver.resolveAudioAsync(
      `bgm:${trackId}`,
      track.src,
      ctx
    );

    // Discard stale async load if another BGM was requested in the meantime
    if (requestToken !== this.bgmRequestToken) {
      return null;
    }

    const sourceKind: 'EXTERNAL_OGG' | 'CHIPTUNE_FALLBACK' =
      resolved.source === 'EXTERNAL_OGG' && resolved.buffer
        ? 'EXTERNAL_OGG'
        : 'CHIPTUNE_FALLBACK';

    this.currentBgmSource = sourceKind;
    this.bgmSourceStatus.set(trackId, sourceKind);

    if (ctx && this.bgmBusGain) {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      this.fadeOutActiveBgm(fadeSec);

      if (sourceKind === 'EXTERNAL_OGG' && resolved.buffer) {
        this.startExternalBgm(ctx, this.bgmBusGain, track, resolved.buffer, fadeSec);
      } else {
        this.chiptune.start(ctx, this.bgmBusGain, track, fadeSec);
      }
    }

    return {
      trackId,
      source: sourceKind,
      crossfadeSec: fadeSec
    };
  }

  public async setBattleMood(mood: BattleBgmMood): Promise<void> {
    const map: Record<BattleBgmMood, string> = {
      NORMAL: 'battle_normal',
      BOSS: 'battle_boss',
      YONKO_AWAKENING: 'battle_yonko_awakening',
      RAID_GIANT: 'battle_raid_giant'
    };
    await this.playBgm(map[mood]);
  }

  public stopBgm(fadeOutSec = 0.35): void {
    this.bgmRequestToken += 1;
    this.currentBgmId = null;
    this.fadeOutActiveBgm(fadeOutSec);
  }

  public playSfxById(
    sfxId: string,
    nowMs?: number,
    opts?: { volumeScale?: number; pitchScale?: number }
  ): SfxPlayResult {
    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return this.sfx.play(sfxId, ctx, this.sfxBusGain, nowMs, opts);
  }

  private startExternalBgm(
    ctx: AudioContext,
    destination: AudioNode,
    track: BgmTrackManifestEntry,
    buffer: AudioBuffer,
    fadeInSec: number
  ): void {
    try {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = track.loop;
      if (track.loop) {
        const clampedStart = Math.max(0, Math.min(track.loopStartSec, buffer.duration));
        const clampedEnd =
          track.loopEndSec > clampedStart && track.loopEndSec <= buffer.duration
            ? track.loopEndSec
            : buffer.duration;
        source.loopStart = clampedStart;
        source.loopEnd = clampedEnd;
      }

      const gain = ctx.createGain();
      const now = ctx.currentTime;
      const targetVol = Math.max(0.0001, track.volume);
      if (fadeInSec > 0.01) {
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(targetVol, now + fadeInSec);
      } else {
        gain.gain.setValueAtTime(targetVol, now);
      }

      source.connect(gain);
      gain.connect(destination);
      attachOnEndedDisconnect(source, gain);
      source.start(now);

      this.externalBgmNode = { source, gain };
    } catch {
      // Fallback cleanly to chiptune if external buffer node fails
      this.chiptune.start(ctx, destination, track, fadeInSec);
    }
  }

  private fadeOutActiveBgm(fadeOutSec: number): void {
    this.chiptune.stop(fadeOutSec);

    const ext = this.externalBgmNode;
    this.externalBgmNode = null;
    if (ext) {
      try {
        const ctx = ext.gain.context;
        const now = ctx.currentTime;
        ext.gain.gain.cancelScheduledValues(now);
        ext.gain.gain.setValueAtTime(Math.max(0.0001, ext.gain.gain.value), now);
        ext.gain.gain.exponentialRampToValueAtTime(
          0.0001,
          now + Math.max(0.03, fadeOutSec)
        );
        ext.source.stop(now + Math.max(0.04, fadeOutSec) + 0.02);
      } catch {
        // ignore already-stopped sources
      }
    }
  }

  public dispose(): void {
    this.detachGestureUnlock();
    this.bgmRequestToken += 1;
    this.currentBgmId = null;
    this.chiptune.dispose();
    const ext = this.externalBgmNode;
    this.externalBgmNode = null;
    if (ext) {
      try { ext.source.stop(); } catch { /* already stopped */ }
      disconnectAudioNodes(ext.source, ext.gain);
    }
    this.sfx.dispose();
    disconnectAudioNodes(this.bgmBusGain, this.bgmFilter, this.sfxBusGain, this.masterGain);
    this.bgmBusGain = null;
    this.bgmFilter = null;
    this.sfxBusGain = null;
    this.masterGain = null;
    if (this.ctx) {
      if (this.ctx.state !== 'closed') void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.bgmSourceStatus.clear();
    this.unlocked = false;
  }
}
