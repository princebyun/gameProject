export type SfxKind =
  | 'CAST'
  | 'HIT'
  | 'CLASH'
  | 'JUST_DODGE'
  | 'FORM_SHIFT'
  | 'UI_CLICK';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private lastPlayMs = new Map<SfxKind, number>();

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') {
      return null;
    }
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        try {
          this.ctx = new AudioCtx();
        } catch {
          this.ctx = null;
        }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public playSfx(kind: SfxKind): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const prev = this.lastPlayMs.get(kind) ?? 0;
    if (now - prev < 55) {
      return;
    }
    this.lastPlayMs.set(kind, now);

    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const t0 = ctx.currentTime;
      if (kind === 'CAST') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, t0);
        osc.frequency.exponentialRampToValueAtTime(580, t0 + 0.08);
        gain.gain.setValueAtTime(0.06, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
        osc.start(t0);
        osc.stop(t0 + 0.09);
      } else if (kind === 'HIT') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(190, t0);
        osc.frequency.exponentialRampToValueAtTime(75, t0 + 0.07);
        gain.gain.setValueAtTime(0.08, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
        osc.start(t0);
        osc.stop(t0 + 0.08);
      } else if (kind === 'CLASH') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(520, t0);
        osc.frequency.exponentialRampToValueAtTime(880, t0 + 0.11);
        gain.gain.setValueAtTime(0.08, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
        osc.start(t0);
        osc.stop(t0 + 0.12);
      } else if (kind === 'JUST_DODGE') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, t0);
        osc.frequency.exponentialRampToValueAtTime(960, t0 + 0.15);
        gain.gain.setValueAtTime(0.09, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
        osc.start(t0);
        osc.stop(t0 + 0.16);
      } else if (kind === 'FORM_SHIFT') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, t0);
        osc.frequency.exponentialRampToValueAtTime(880, t0 + 0.25);
        gain.gain.setValueAtTime(0.1, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.26);
        osc.start(t0);
        osc.stop(t0 + 0.26);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, t0);
        gain.gain.setValueAtTime(0.04, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.04);
        osc.start(t0);
        osc.stop(t0 + 0.04);
      }
    } catch {
      // Ignore audio synthesis restrictions prior to user gesture
    }
  }
}
