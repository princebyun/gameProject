import type { ExternalAssetResolver } from '../assets/externalAssetResolver';
import type { Disposable } from '../core/types/disposable';
import {
  defaultAssetManifestRegistry,
  type AssetManifestRegistry
} from '../data/assets/assetManifestRegistry';
import type { SfxManifestEntry } from '../data/assets/types';
import { attachOnEndedDisconnect } from './webAudioCleanup';

export type StandardSfxId =
  | 'slash_light'
  | 'slash_heavy'
  | 'blunt_hit'
  | 'beam_fire'
  | 'beam_clash_loop'
  | 'melee_clash_clang'
  | 'dodge_whoosh'
  | 'just_dodge_chime'
  | 'haki_lightning'
  | 'logia_dissolve'
  | 'transform_burst'
  | 'awakening_drums'
  | 'ui_move'
  | 'ui_confirm'
  | 'ui_cancel'
  | 'wanted_poster_slam'
  | 'ship_cannon'
  | 'coup_de_burst';

export interface SfxPlayResult {
  played: boolean;
  sfxId: string;
  source: 'EXTERNAL_OGG' | 'CHIPTUNE_FALLBACK';
  pitchMultiplier: number;
  reason?: 'UNKNOWN_SFX' | 'MUTED' | 'THROTTLED';
}

export class SfxManager implements Disposable {
  private volume = 0.8;
  private muted = false;
  private recentTimestamps = new Map<string, number[]>();
  private externalBuffers = new Map<string, AudioBuffer>();
  private externalStatus = new Map<string, 'EXTERNAL_OGG' | 'CHIPTUNE_FALLBACK'>();
  private loadingKeys = new Set<string>();
  private noiseBuffer: AudioBuffer | null = null;

  constructor(
    private readonly resolver: ExternalAssetResolver,
    private readonly manifestRegistry: AssetManifestRegistry = defaultAssetManifestRegistry,
    private readonly rng: () => number = Math.random
  ) {}

  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  public getVolume(): number {
    return this.volume;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public getSourceStatus(sfxId: string): 'EXTERNAL_OGG' | 'CHIPTUNE_FALLBACK' {
    return this.externalStatus.get(sfxId) ?? 'CHIPTUNE_FALLBACK';
  }

  public clearThrottleHistory(): void {
    this.recentTimestamps.clear();
  }

  /**
   * Preload/probe an external .ogg SFX asynchronously so subsequent plays use EXTERNAL_OGG.
   */
  public async preloadSfx(
    sfxId: string,
    ctx: AudioContext | null
  ): Promise<'EXTERNAL_OGG' | 'CHIPTUNE_FALLBACK'> {
    const entry = this.manifestRegistry.sfxById[sfxId];
    if (!entry) return 'CHIPTUNE_FALLBACK';

    const resolved = await this.resolver.resolveAudioAsync(
      `sfx:${sfxId}`,
      entry.src,
      ctx
    );
    if (resolved.source === 'EXTERNAL_OGG' && resolved.buffer) {
      this.externalBuffers.set(sfxId, resolved.buffer);
      this.externalStatus.set(sfxId, 'EXTERNAL_OGG');
      return 'EXTERNAL_OGG';
    }
    this.externalStatus.set(sfxId, 'CHIPTUNE_FALLBACK');
    return 'CHIPTUNE_FALLBACK';
  }

  public play(
    sfxId: string,
    ctx: AudioContext | null,
    destination: AudioNode | null,
    nowMs?: number
  ): SfxPlayResult {
    const entry = this.manifestRegistry.sfxById[sfxId];
    if (!entry) {
      return {
        played: false,
        sfxId,
        source: 'CHIPTUNE_FALLBACK',
        pitchMultiplier: 1,
        reason: 'UNKNOWN_SFX'
      };
    }

    if (this.muted || this.volume <= 0.001) {
      return {
        played: false,
        sfxId,
        source: this.getSourceStatus(sfxId),
        pitchMultiplier: 1,
        reason: 'MUTED'
      };
    }

    const now =
      nowMs !== undefined
        ? nowMs
        : typeof performance !== 'undefined'
          ? performance.now()
          : Date.now();

    // Sliding window throttle: maxPolyphony (default 3) within throttleMs (default 50ms)
    const prevList = this.recentTimestamps.get(sfxId) ?? [];
    const activeWindow = prevList.filter((t) => now - t < entry.throttleMs);
    if (activeWindow.length >= entry.maxPolyphony) {
      this.recentTimestamps.set(sfxId, activeWindow);
      return {
        played: false,
        sfxId,
        source: this.getSourceStatus(sfxId),
        pitchMultiplier: 1,
        reason: 'THROTTLED'
      };
    }
    activeWindow.push(now);
    this.recentTimestamps.set(sfxId, activeWindow);

    // ±pitchJitterRatio (e.g. ±6% -> 0.94..1.06)
    const jitter = (this.rng() * 2 - 1) * entry.pitchJitterRatio;
    const pitchMultiplier = Number((1 + jitter).toFixed(4));

    // Trigger non-blocking external .ogg probe once if ctx is available
    if (ctx && !this.externalStatus.has(sfxId) && !this.loadingKeys.has(sfxId)) {
      this.loadingKeys.add(sfxId);
      void this.preloadSfx(sfxId, ctx).finally(() => {
        this.loadingKeys.delete(sfxId);
      });
    }

    const extBuf = this.externalBuffers.get(sfxId);
    const sourceKind: 'EXTERNAL_OGG' | 'CHIPTUNE_FALLBACK' = extBuf
      ? 'EXTERNAL_OGG'
      : 'CHIPTUNE_FALLBACK';

    if (ctx && destination && ctx.state !== 'closed') {
      const effectiveGain = Math.min(1, entry.volume * this.volume * 0.42);
      if (extBuf) {
        this.playExternalBuffer(ctx, destination, extBuf, effectiveGain, pitchMultiplier);
      } else {
        this.playSynthPreset(ctx, destination, entry, effectiveGain, pitchMultiplier);
      }
    }

    return {
      played: true,
      sfxId,
      source: sourceKind,
      pitchMultiplier
    };
  }

  private playExternalBuffer(
    ctx: AudioContext,
    destination: AudioNode,
    buffer: AudioBuffer,
    volume: number,
    pitchMultiplier: number
  ): void {
    try {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.setValueAtTime(pitchMultiplier, ctx.currentTime);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      src.connect(gain);
      gain.connect(destination);
      attachOnEndedDisconnect(src, gain);
      src.start(ctx.currentTime);
    } catch {
      // ignore playback restriction errors
    }
  }

  private ensureNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    try {
      const len = Math.floor(ctx.sampleRate * 0.35);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      let seed = 0x2468ace1;
      for (let i = 0; i < len; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        ch[i] = (seed / 0xffffffff) * 2 - 1;
      }
      this.noiseBuffer = buf;
      return buf;
    } catch {
      return null;
    }
  }

  private playSynthPreset(
    ctx: AudioContext,
    destination: AudioNode,
    entry: SfxManifestEntry,
    gainLevel: number,
    pitch: number
  ): void {
    const t0 = ctx.currentTime;
    const preset = entry.synthPreset;

    try {
      switch (preset) {
        case 'slash_light':
          this.burstNoise(ctx, destination, t0, 0.06, 2600 * pitch, gainLevel * 0.7);
          this.sweepOsc(ctx, destination, 'triangle', 680 * pitch, 240 * pitch, t0, 0.06, gainLevel * 0.65);
          break;
        case 'slash_heavy':
          this.burstNoise(ctx, destination, t0, 0.13, 1400 * pitch, gainLevel * 0.9);
          this.sweepOsc(ctx, destination, 'sawtooth', 420 * pitch, 110 * pitch, t0, 0.13, gainLevel * 0.85);
          break;
        case 'blunt_hit':
          this.sweepOsc(ctx, destination, 'sawtooth', 180 * pitch, 58 * pitch, t0, 0.09, gainLevel);
          this.burstNoise(ctx, destination, t0, 0.05, 900 * pitch, gainLevel * 0.5);
          break;
        case 'beam_fire':
          this.sweepOsc(ctx, destination, 'square', 280 * pitch, 920 * pitch, t0, 0.14, gainLevel * 0.8);
          this.sweepOsc(ctx, destination, 'sawtooth', 560 * pitch, 180 * pitch, t0 + 0.04, 0.18, gainLevel * 0.65);
          break;
        case 'beam_clash_loop':
          this.sweepOsc(ctx, destination, 'square', 380 * pitch, 520 * pitch, t0, 0.12, gainLevel * 0.75);
          this.burstNoise(ctx, destination, t0, 0.12, 1800 * pitch, gainLevel * 0.45);
          break;
        case 'melee_clash_clang':
          this.sweepOsc(ctx, destination, 'square', 1120 * pitch, 640 * pitch, t0, 0.12, gainLevel * 0.9);
          this.sweepOsc(ctx, destination, 'triangle', 1680 * pitch, 920 * pitch, t0, 0.1, gainLevel * 0.6);
          break;
        case 'dodge_whoosh':
          this.burstNoise(ctx, destination, t0, 0.09, 2200 * pitch, gainLevel * 0.6);
          this.sweepOsc(ctx, destination, 'sine', 420 * pitch, 200 * pitch, t0, 0.08, gainLevel * 0.45);
          break;
        case 'just_dodge_chime':
          this.sweepOsc(ctx, destination, 'sine', 660 * pitch, 990 * pitch, t0, 0.12, gainLevel * 0.9);
          this.sweepOsc(ctx, destination, 'triangle', 1320 * pitch, 1760 * pitch, t0 + 0.05, 0.14, gainLevel * 0.75);
          break;
        case 'haki_lightning':
          this.sweepOsc(ctx, destination, 'sawtooth', 120 * pitch, 54 * pitch, t0, 0.22, gainLevel);
          this.burstNoise(ctx, destination, t0, 0.18, 3200 * pitch, gainLevel * 0.85);
          this.sweepOsc(ctx, destination, 'square', 840 * pitch, 240 * pitch, t0 + 0.03, 0.16, gainLevel * 0.55);
          break;
        case 'logia_dissolve':
          this.burstNoise(ctx, destination, t0, 0.14, 3400 * pitch, gainLevel * 0.7);
          this.sweepOsc(ctx, destination, 'sine', 880 * pitch, 420 * pitch, t0, 0.13, gainLevel * 0.5);
          break;
        case 'transform_burst':
          this.sweepOsc(ctx, destination, 'triangle', 190 * pitch, 780 * pitch, t0, 0.24, gainLevel * 0.95);
          this.sweepOsc(ctx, destination, 'square', 285 * pitch, 1040 * pitch, t0 + 0.06, 0.2, gainLevel * 0.6);
          break;
        case 'awakening_drums':
          // Iconic rhythmic double-beat liberation drums
          this.sweepOsc(ctx, destination, 'sine', 165 * pitch, 55 * pitch, t0, 0.11, gainLevel);
          this.sweepOsc(ctx, destination, 'sine', 195 * pitch, 65 * pitch, t0 + 0.12, 0.11, gainLevel * 0.95);
          this.sweepOsc(ctx, destination, 'triangle', 220 * pitch, 80 * pitch, t0 + 0.22, 0.15, gainLevel);
          break;
        case 'ui_move':
          this.sweepOsc(ctx, destination, 'square', 520 * pitch, 620 * pitch, t0, 0.035, gainLevel * 0.5);
          break;
        case 'ui_confirm':
          this.sweepOsc(ctx, destination, 'square', 587 * pitch, 880 * pitch, t0, 0.075, gainLevel * 0.65);
          break;
        case 'ui_cancel':
          this.sweepOsc(ctx, destination, 'square', 440 * pitch, 260 * pitch, t0, 0.075, gainLevel * 0.6);
          break;
        case 'wanted_poster_slam':
          this.sweepOsc(ctx, destination, 'sawtooth', 140 * pitch, 42 * pitch, t0, 0.18, gainLevel);
          this.burstNoise(ctx, destination, t0, 0.11, 700 * pitch, gainLevel * 0.85);
          break;
        case 'ship_cannon':
          this.sweepOsc(ctx, destination, 'sine', 135 * pitch, 38 * pitch, t0, 0.24, gainLevel);
          this.burstNoise(ctx, destination, t0, 0.22, 520 * pitch, gainLevel * 0.9);
          break;
        case 'coup_de_burst':
          this.burstNoise(ctx, destination, t0, 0.3, 1800 * pitch, gainLevel * 0.95);
          this.sweepOsc(ctx, destination, 'sawtooth', 160 * pitch, 640 * pitch, t0, 0.28, gainLevel * 0.8);
          break;
        default:
          this.sweepOsc(ctx, destination, 'sine', 560 * pitch, 440 * pitch, t0, 0.06, gainLevel * 0.5);
          break;
      }
    } catch {
      // Ignore Web Audio scheduling errors
    }
  }

  private sweepOsc(
    ctx: AudioContext,
    destination: AudioNode,
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    startTime: number,
    duration: number,
    peakGain: number
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, startFreq), startTime);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, endFreq),
      startTime + Math.max(0.015, duration)
    );
    gain.gain.setValueAtTime(Math.max(0.0001, peakGain), startTime);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      startTime + Math.max(0.02, duration)
    );
    osc.connect(gain);
    gain.connect(destination);
    attachOnEndedDisconnect(osc, gain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.015);
  }

  private burstNoise(
    ctx: AudioContext,
    destination: AudioNode,
    startTime: number,
    duration: number,
    filterFreq: number,
    peakGain: number
  ): void {
    const buf = this.ensureNoiseBuffer(ctx);
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(Math.max(80, filterFreq), startTime);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.0001, peakGain), startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    attachOnEndedDisconnect(src, filter, gain);
    src.start(startTime);
    src.stop(startTime + duration + 0.015);
  }

  public dispose(): void {
    this.recentTimestamps.clear();
    this.externalBuffers.clear();
    this.externalStatus.clear();
    this.loadingKeys.clear();
    this.noiseBuffer = null;
  }
}
