import type { BgmTrackManifestEntry } from '../data/assets/types';

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * 4-Channel 8-bit/16-bit Retro Chiptune Sequencer (Web Audio API):
 * - Ch 1: Pulse 1 (Square Lead)
 * - Ch 2: Pulse 2 (Sawtooth/Square Arpeggio Harmony)
 * - Ch 3: Triangle Bass
 * - Ch 4: White Noise Percussion (Kick / Snare / Hi-hat)
 */
export class ChiptuneSynthPlayer {
  private timerId: ReturnType<typeof setInterval> | null = null;
  private stepIndex = 0;
  private nextStepTime = 0;
  private activeTrack: BgmTrackManifestEntry | null = null;
  private outputGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private isPlaying = false;

  public start(
    ctx: AudioContext,
    destination: AudioNode,
    track: BgmTrackManifestEntry,
    fadeInSec: number
  ): GainNode {
    this.stop(0.05);

    const bus = ctx.createGain();
    const now = ctx.currentTime;
    const targetVol = Math.max(0.0001, track.volume * 0.24);

    if (fadeInSec > 0.01) {
      bus.gain.setValueAtTime(0.0001, now);
      bus.gain.linearRampToValueAtTime(targetVol, now + fadeInSec);
    } else {
      bus.gain.setValueAtTime(targetVol, now);
    }
    bus.connect(destination);

    this.outputGain = bus;
    this.activeTrack = track;
    this.stepIndex = 0;
    this.nextStepTime = now + 0.04;
    this.isPlaying = true;
    this.ensureNoiseBuffer(ctx);

    this.timerId = setInterval(() => {
      this.scheduleAhead(ctx);
    }, 35);

    return bus;
  }

  public stop(fadeOutSec = 0.2): void {
    this.isPlaying = false;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    const bus = this.outputGain;
    this.outputGain = null;
    this.activeTrack = null;

    if (bus) {
      try {
        const ctx = bus.context;
        const now = ctx.currentTime;
        bus.gain.cancelScheduledValues(now);
        bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), now);
        bus.gain.exponentialRampToValueAtTime(
          0.0001,
          now + Math.max(0.02, fadeOutSec)
        );
        setTimeout(() => {
          try {
            bus.disconnect();
          } catch {
            // ignore
          }
        }, Math.ceil(fadeOutSec * 1000) + 60);
      } catch {
        // ignore cleanup errors in headless/closed AudioContext
      }
    }
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getActiveTrackId(): string | null {
    return this.activeTrack?.id ?? null;
  }

  private ensureNoiseBuffer(ctx: AudioContext): void {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return;
    }
    try {
      const length = Math.floor(ctx.sampleRate * 0.2);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let seed = 0x13579bdf;
      for (let i = 0; i < length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        data[i] = (seed / 0xffffffff) * 2 - 1;
      }
      this.noiseBuffer = buffer;
    } catch {
      this.noiseBuffer = null;
    }
  }

  private scheduleAhead(ctx: AudioContext): void {
    if (!this.isPlaying || !this.activeTrack || !this.outputGain) return;
    if (ctx.state === 'suspended') return;

    const track = this.activeTrack;
    const stepDurationSec = 60 / Math.max(60, track.bpm) / 2; // 8th-note retro drive
    const lookaheadSec = 0.14;

    while (this.nextStepTime < ctx.currentTime + lookaheadSec) {
      this.scheduleStep(ctx, this.outputGain, track, this.stepIndex, this.nextStepTime, stepDurationSec);
      this.stepIndex += 1;
      this.nextStepTime += stepDurationSec;

      const patternLen = Math.max(1, track.chiptunePreset.leadPattern.length);
      if (!track.loop && this.stepIndex >= patternLen) {
        this.isPlaying = false;
        if (this.timerId !== null) {
          clearInterval(this.timerId);
          this.timerId = null;
        }
        break;
      }
    }
  }

  private scheduleStep(
    ctx: AudioContext,
    bus: GainNode,
    track: BgmTrackManifestEntry,
    step: number,
    time: number,
    stepDur: number
  ): void {
    const preset = track.chiptunePreset;
    const idx = step % preset.leadPattern.length;
    const barShift = Math.floor(step / preset.leadPattern.length) % 2 === 1 ? 0 : 0;

    // Channel 1: Pulse 1 (Square Lead)
    const leadSemi = preset.leadPattern[idx];
    if (leadSemi !== undefined && leadSemi >= -24 && leadSemi !== -1) {
      this.playTone(
        ctx,
        bus,
        'square',
        midiToFreq(preset.keyRootMidi + leadSemi + barShift),
        time,
        stepDur * 0.85,
        0.26
      );
    }

    // Channel 2: Pulse 2 (Harmony / Arp)
    const arpSemi = preset.arpPattern[idx % preset.arpPattern.length];
    if (arpSemi !== undefined && arpSemi >= -24 && arpSemi !== -1) {
      this.playTone(
        ctx,
        bus,
        'square',
        midiToFreq(preset.keyRootMidi - 12 + arpSemi),
        time,
        stepDur * 0.52,
        0.13
      );
    }

    // Channel 3: Triangle Bass
    const bassSemi = preset.bassPattern[idx % preset.bassPattern.length];
    if (bassSemi !== undefined && bassSemi !== -1) {
      this.playTone(
        ctx,
        bus,
        'triangle',
        midiToFreq(preset.keyRootMidi + bassSemi),
        time,
        stepDur * 0.9,
        0.34
      );
    }

    // Channel 4: Noise / Retro Drums (1=Kick, 2=Snare, 3=HiHat)
    const drum = preset.drumPattern[idx % preset.drumPattern.length] ?? 0;
    if (drum === 1) {
      this.playKick(ctx, bus, time);
    } else if (drum === 2) {
      this.playNoiseHit(ctx, bus, time, 0.08, 1200, 0.22);
    } else if (drum === 3) {
      this.playNoiseHit(ctx, bus, time, 0.03, 5200, 0.1);
    }
  }

  private playTone(
    ctx: AudioContext,
    bus: GainNode,
    type: OscillatorType,
    freq: number,
    time: number,
    duration: number,
    peakGain: number
  ): void {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(peakGain, time + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.03, duration));
      osc.connect(gain);
      gain.connect(bus);
      osc.start(time);
      osc.stop(time + duration + 0.01);
    } catch {
      // ignore scheduling failures
    }
  }

  private playKick(ctx: AudioContext, bus: GainNode, time: number): void {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(145, time);
      osc.frequency.exponentialRampToValueAtTime(42, time + 0.09);
      gain.gain.setValueAtTime(0.32, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.1);
      osc.connect(gain);
      gain.connect(bus);
      osc.start(time);
      osc.stop(time + 0.11);
    } catch {
      // ignore
    }
  }

  private playNoiseHit(
    ctx: AudioContext,
    bus: GainNode,
    time: number,
    duration: number,
    filterFreq: number,
    peakGain: number
  ): void {
    if (!this.noiseBuffer) return;
    try {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(filterFreq, time);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(peakGain, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(bus);
      src.start(time);
      src.stop(time + duration + 0.01);
    } catch {
      // ignore
    }
  }
}
