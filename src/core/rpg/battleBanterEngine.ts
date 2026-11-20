import type { BattleWorldState } from '../types/battleState';
import type { BattleBanterEntry, BattleBanterTrigger } from './scriptSchema';

export const BANTER_DISPLAY_DURATION_SEC = 2.8;
export const BANTER_FADE_IN_SEC = 0.2;
export const BANTER_FADE_OUT_SEC = 0.35;

export interface ActiveBanterItem {
  entry: BattleBanterEntry;
  elapsedSec: number;
  durationSec: number;
}

export interface BattleBanterObserverSnapshot {
  initialized: boolean;
  bossPhase2Fired: boolean;
  prevSlashMissCount: number;
  prevDestroyedPropsCount: number;
  prevTotalClashes: number;
  prevAllyForms: Record<string, string | null>;
  prevLunarianFlameOn: boolean | null;
  prevSuperRegenLockoutActive: boolean;
  prevForesightBroken: boolean;
  prevBirdcageActive: boolean;
  prevSteroidActive: boolean;
  prevFruitNullified: boolean;
  prevMinionCount: number;
}

export function createInitialBanterSnapshot(): BattleBanterObserverSnapshot {
  return {
    initialized: false,
    bossPhase2Fired: false,
    prevSlashMissCount: 0,
    prevDestroyedPropsCount: 0,
    prevTotalClashes: 0,
    prevAllyForms: {},
    prevLunarianFlameOn: null,
    prevSuperRegenLockoutActive: false,
    prevForesightBroken: false,
    prevBirdcageActive: false,
    prevSteroidActive: false,
    prevFruitNullified: false,
    prevMinionCount: 0
  };
}

/**
 * Pure non-blocking real-time mid-battle banter queue & trigger observer.
 * Reads BattleWorldState strictly read-only — never mutates combat simulation state.
 */
export class BattleBanterController {
  private queue: ActiveBanterItem[] = [];
  private activeItem: ActiveBanterItem | null = null;
  private firedKeys = new Set<string>();
  private snapshot: BattleBanterObserverSnapshot = createInitialBanterSnapshot();

  public reset(): void {
    this.queue = [];
    this.activeItem = null;
    this.firedKeys.clear();
    this.snapshot = createInitialBanterSnapshot();
  }

  public getActiveItem(): ActiveBanterItem | null {
    return this.activeItem;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public hasFired(dedupeKey: string): boolean {
    return this.firedKeys.has(dedupeKey);
  }

  /**
   * Computes normalized alpha [0..1] for smooth fade-in / fade-out presentation.
   */
  public getActiveAlpha(): number {
    if (!this.activeItem) return 0;
    const { elapsedSec, durationSec } = this.activeItem;
    if (elapsedSec < BANTER_FADE_IN_SEC) {
      return Math.max(0, Math.min(1, elapsedSec / BANTER_FADE_IN_SEC));
    }
    const remaining = durationSec - elapsedSec;
    if (remaining < BANTER_FADE_OUT_SEC) {
      return Math.max(0, Math.min(1, remaining / BANTER_FADE_OUT_SEC));
    }
    return 1;
  }

  /**
   * Enqueues a banter entry if its dedupeKey has not already been fired during this battle.
   * Returns true if accepted into active slot or queue; false if suppressed as duplicate.
   */
  public enqueue(
    entry: BattleBanterEntry,
    dedupeKey: string = entry.banterId,
    durationSec: number = BANTER_DISPLAY_DURATION_SEC
  ): boolean {
    if (this.firedKeys.has(dedupeKey)) {
      return false;
    }
    this.firedKeys.add(dedupeKey);

    const item: ActiveBanterItem = {
      entry,
      elapsedSec: 0,
      durationSec
    };

    if (!this.activeItem) {
      this.activeItem = item;
    } else {
      this.queue.push(item);
      // Sort waiting queue by descending priority while preserving FIFO for ties
      this.queue.sort((a, b) => (b.entry.priority ?? 0) - (a.entry.priority ?? 0));
    }
    return true;
  }

  public step(dt: number): void {
    if (!this.activeItem) {
      if (this.queue.length > 0) {
        this.activeItem = this.queue.shift() ?? null;
      }
      return;
    }

    this.activeItem.elapsedSec += Math.max(0, dt);
    if (this.activeItem.elapsedSec >= this.activeItem.durationSec) {
      this.activeItem = this.queue.shift() ?? null;
    }
  }

  /**
   * Read-only observer of BattleWorldState that detects all 5 real-time banter triggers:
   * 1. battle_start
   * 2. boss_hp_50
   * 3. gimmick_hint
   * 4. player_awakening
   * 5. clash_start
   */
  public observeWorld(
    world: BattleWorldState,
    entries: readonly BattleBanterEntry[],
    encounterId?: string | null
  ): BattleBanterEntry[] {
    if (world.winnerTeam !== null) return [];

    const triggered: BattleBanterEntry[] = [];
    const alphaUnits = world.units.filter((u) => u.team === 'ALPHA' && u.isOnField);
    const omegaUnits = world.units.filter((u) => u.team === 'OMEGA' && u.isOnField && u.isAlive);
    const primaryBoss =
      omegaUnits.find((u) => u.isBossUnit) ?? omegaUnits[0] ?? null;
    const bossSpeciesIds = new Set(omegaUnits.map((u) => u.speciesId));

    const pickAndEnqueue = (
      trigger: BattleBanterTrigger,
      matcher: (e: BattleBanterEntry) => boolean,
      dedupeSuffix?: string
    ): void => {
      const candidates = entries
        .filter((e) => e.trigger === trigger && matcher(e))
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

      for (const cand of candidates) {
        const key = dedupeSuffix ? `${cand.banterId}:${dedupeSuffix}` : cand.banterId;
        if (this.enqueue(cand, key)) {
          triggered.push(cand);
          return;
        }
      }
    };

    if (!this.snapshot.initialized) {
      this.snapshot.initialized = true;
      for (const au of alphaUnits) {
        this.snapshot.prevAllyForms[au.instanceId] = au.activeFormId;
      }
      this.snapshot.prevSlashMissCount = world.slashImmuneMissCount;
      this.snapshot.prevDestroyedPropsCount = world.destructibleProps.filter(
        (p) => p.destroyed
      ).length;
      this.snapshot.prevTotalClashes =
        world.beamClashes.length +
        world.meleeClashes.length +
        world.meleeBeamGuards.length;
      if (primaryBoss) {
        this.snapshot.prevLunarianFlameOn = primaryBoss.lunarianFlameOn;
        this.snapshot.prevSuperRegenLockoutActive =
          primaryBoss.superRegenLockoutTimer > 0;
        this.snapshot.prevForesightBroken = primaryBoss.foresightBreakTimer > 0;
        this.snapshot.prevSteroidActive = primaryBoss.steroidOverdriveActive;
      }
      this.snapshot.prevBirdcageActive = world.birdcage.active;
      this.snapshot.prevFruitNullified = alphaUnits.some((u) => u.fruitNullifyTimer > 0);
      this.snapshot.prevMinionCount = omegaUnits.filter((u) => u.isMinion).length;
    }

    // 1. battle_start (after 0.35s so boss intro starts smoothly)
    if (world.elapsedSec >= 0.35 && primaryBoss) {
      pickAndEnqueue(
        'battle_start',
        (e) =>
          (Boolean(encounterId) && e.encounterId === encounterId) ||
          (Boolean(e.bossUnitId) && bossSpeciesIds.has(e.bossUnitId!)),
        `start_${primaryBoss.speciesId}`
      );
    }

    // 2. boss_hp_50 (Boss Phase 2 or HP <= 50%)
    if (primaryBoss) {
      const hpRatio = primaryBoss.hp / Math.max(1, primaryBoss.maxHp);
      if (primaryBoss.bossPhase2Triggered || hpRatio <= 0.5) {
        if (!this.snapshot.bossPhase2Fired) {
          this.snapshot.bossPhase2Fired = true;
          pickAndEnqueue(
            'boss_hp_50',
            (e) =>
              (Boolean(encounterId) && e.encounterId === encounterId) ||
              (Boolean(e.bossUnitId) && bossSpeciesIds.has(e.bossUnitId!)),
            `hp50_${primaryBoss.speciesId}`
          );
        }
      }
    }

    // 3. gimmick_hint (Boss-specific combat mechanics observed read-only)
    if (primaryBoss) {
      const destroyedProps = world.destructibleProps.filter((p) => p.destroyed).length;
      const hasPoisonField = world.fieldZones.some((f) => f.isPoisonCloud);
      const anyAllyInWater = alphaUnits.some((u) => u.inWaterTerrain);
      const anyAllyFruitNullified = alphaUnits.some((u) => u.fruitNullifyTimer > 0);
      const minionCount = omegaUnits.filter((u) => u.isMinion).length;

      const gimmickFired =
        // Buggy Bara-Bara slash split
        (bossSpeciesIds.has('buggy') &&
          (world.slashImmuneMissCount > this.snapshot.prevSlashMissCount ||
            primaryBoss.baraSplitTimer > 0 ||
            world.elapsedSec >= 3.2)) ||
        // Don Krieg MH5 poison cloud
        (bossSpeciesIds.has('don_krieg') &&
          (hasPoisonField || world.elapsedSec >= 3.0)) ||
        // Arlong water terrain bonus
        (bossSpeciesIds.has('arlong') &&
          (anyAllyInWater || world.waterZones.length > 0 && world.elapsedSec >= 2.8)) ||
        // Smoker survival escape hint
        (bossSpeciesIds.has('smoker') &&
          world.winCondition.kind === 'SURVIVE_TIME' &&
          world.elapsedSec >= 2.5) ||
        // Morgan / Wapol / Blueno / Kaku / Lucci / Aokiji / Akainu early tactical hint
        ((bossSpeciesIds.has('morgan') ||
          bossSpeciesIds.has('wapol') ||
          bossSpeciesIds.has('blueno') ||
          bossSpeciesIds.has('lucci') ||
          bossSpeciesIds.has('aokiji') ||
          bossSpeciesIds.has('akainu')) &&
          world.elapsedSec >= 3.0) ||
        // Crocodile water barrels / wet weakness
        (bossSpeciesIds.has('crocodile') &&
          (destroyedProps > this.snapshot.prevDestroyedPropsCount ||
            (world.destructibleProps.length > 0 && world.elapsedSec >= 2.5))) ||
        // Enel rubber lightning immunity
        (bossSpeciesIds.has('enel') && world.elapsedSec >= 2.2) ||
        // Moria Doppelman minion / Shadows Asgard
        (bossSpeciesIds.has('moria') &&
          (minionCount > this.snapshot.prevMinionCount || world.elapsedSec >= 3.0)) ||
        // Blackbeard Yami fruit nullification
        (bossSpeciesIds.has('blackbeard') &&
          ((anyAllyFruitNullified && !this.snapshot.prevFruitNullified) ||
            world.elapsedSec >= 3.0)) ||
        // Hody Energy Steroid overdrive
        (bossSpeciesIds.has('hody_jones') &&
          ((primaryBoss.steroidOverdriveActive && !this.snapshot.prevSteroidActive) ||
            world.elapsedSec >= 3.2)) ||
        // Doflamingo Birdcage shrinking arena
        (bossSpeciesIds.has('doflamingo') &&
          ((world.birdcage.active && !this.snapshot.prevBirdcageActive) ||
            world.elapsedSec >= 2.8)) ||
        // Katakuri Future Sight counter / focus break
        (bossSpeciesIds.has('katakuri') &&
          ((primaryBoss.foresightBreakTimer > 0 && !this.snapshot.prevForesightBroken) ||
            world.elapsedSec >= 2.6)) ||
        // King Lunarian Flame toggle
        (bossSpeciesIds.has('king') &&
          ((this.snapshot.prevLunarianFlameOn !== null &&
            primaryBoss.lunarianFlameOn !== this.snapshot.prevLunarianFlameOn) ||
            world.elapsedSec >= 2.8)) ||
        // Kaido Conqueror coating & Boro Breath warning
        (bossSpeciesIds.has('kaido') && world.elapsedSec >= 3.2) ||
        // Saturn Conqueror Haki super regeneration suppression
        (bossSpeciesIds.has('saturn') &&
          ((primaryBoss.superRegenLockoutTimer > 0 &&
            !this.snapshot.prevSuperRegenLockoutActive) ||
            world.elapsedSec >= 2.5)) ||
        // Kizaru light speed / Logia warning
        (bossSpeciesIds.has('kizaru') &&
          !bossSpeciesIds.has('saturn') &&
          world.elapsedSec >= 2.8) ||
        // Loki Ragnir giant lightning warning
        (bossSpeciesIds.has('loki') && world.elapsedSec >= 2.6);

      if (gimmickFired) {
        pickAndEnqueue(
          'gimmick_hint',
          (e) =>
            (Boolean(encounterId) && e.encounterId === encounterId) ||
            (Boolean(e.bossUnitId) && bossSpeciesIds.has(e.bossUnitId!)),
          `gimmick_${primaryBoss.speciesId}`
        );
      }

      this.snapshot.prevSlashMissCount = world.slashImmuneMissCount;
      this.snapshot.prevDestroyedPropsCount = destroyedProps;
      this.snapshot.prevLunarianFlameOn = primaryBoss.lunarianFlameOn;
      this.snapshot.prevSuperRegenLockoutActive =
        primaryBoss.superRegenLockoutTimer > 0;
      this.snapshot.prevForesightBroken = primaryBoss.foresightBreakTimer > 0;
      this.snapshot.prevBirdcageActive = world.birdcage.active;
      this.snapshot.prevSteroidActive = primaryBoss.steroidOverdriveActive;
      this.snapshot.prevFruitNullified = anyAllyFruitNullified;
      this.snapshot.prevMinionCount = minionCount;
    }

    // 4. player_awakening (Luffy Gear 5, Zoro King of Hell, Sanji Diable Jambe, Chopper Monster Point, etc.)
    for (const ally of alphaUnits) {
      const prevForm = this.snapshot.prevAllyForms[ally.instanceId] ?? null;
      if (ally.activeFormId && ally.activeFormId !== prevForm) {
        const activeForm = ally.activeFormId;
        pickAndEnqueue(
          'player_awakening',
          (e) =>
            (Boolean(e.formId) && e.formId === activeForm) ||
            (!e.formId && e.allyUnitId === ally.speciesId),
          `awaken_${ally.speciesId}_${activeForm}`
        );
      }
      this.snapshot.prevAllyForms[ally.instanceId] = ally.activeFormId;
    }

    // 5. clash_start (Beam vs Beam, Melee vs Melee, Conqueror Sky Split)
    const totalClashes =
      world.beamClashes.length +
      world.meleeClashes.length +
      world.meleeBeamGuards.length;
    if (totalClashes > this.snapshot.prevTotalClashes) {
      const leader = alphaUnits.find((u) => u.isPlayerControlled) ?? alphaUnits[0];
      pickAndEnqueue(
        'clash_start',
        (e) =>
          (Boolean(e.bossUnitId) && bossSpeciesIds.has(e.bossUnitId!)) ||
          (Boolean(leader) && e.allyUnitId === leader.speciesId) ||
          (!e.bossUnitId && !e.allyUnitId),
        `clash_${primaryBoss?.speciesId ?? 'any'}`
      );
    }
    this.snapshot.prevTotalClashes = totalClashes;

    return triggered;
  }
}
