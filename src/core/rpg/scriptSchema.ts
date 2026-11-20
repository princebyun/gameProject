/**
 * Pure Bandai-RPG Cutscene DSL Schema & Directive Evaluator.
 * Strictly DOM-free so it remains 100% compatible with Pure Core Architecture Audit.
 */

export type DialogueTriggerType =
  | 'arrival'
  | 'gold_marker'
  | 'pre_boss'
  | 'post_boss'
  | 'recruitment'
  | 'sea_gate'
  | 'side_banter';

export type DialogueEmotion =
  | 'normal'
  | 'angry'
  | 'determined'
  | 'shocked'
  | 'smirk'
  | 'sad'
  | 'excited';

export type DialogueSide = 'left' | 'right' | 'center_narration';

export type DialogueDirective =
  | { type: 'bgm'; trackId: string; fadeSec?: number }
  | { type: 'sfx'; sfxId: string }
  | { type: 'cameraShake'; intensity: number; durationSec: number }
  | { type: 'screenFlash'; color: string; durationSec: number }
  | { type: 'chapterCard'; chapterNum: string; title: string; subtitle: string }
  | {
      type: 'recruitmentBanner';
      unitId: string;
      roleName: string;
      passiveSummary: string;
    }
  | { type: 'wantedPoster'; bounty: number; title: string };

export interface DialogueLineNode {
  speakerId: string;
  speakerName: string;
  emotion: DialogueEmotion;
  side: DialogueSide;
  text: string;
  directives?: DialogueDirective[];
}

export interface DialogueScript {
  scriptId: string;
  episodeId: string;
  triggerType: DialogueTriggerType;
  title: string;
  /** Optional NPC id or encounter id binding for automatic runtime lookup */
  bindingId?: string;
  lines: DialogueLineNode[];
}

export interface EpisodeDialoguePack {
  episodeId: string;
  islandId: string;
  seaZoneId: 'east_blue' | 'grand_line' | 'new_world';
  scripts: DialogueScript[];
}

export interface SideCrewBanterScript extends DialogueScript {
  triggerType: 'side_banter';
  seaZoneId: 'east_blue' | 'grand_line' | 'new_world';
  markerPos: { x: number; y: number };
  markerLabel: string;
  requiredUnitIds?: string[];
  rewardTrainingPoints: number;
  rewardAffinity: number;
}

export interface SideCrewBanterPack {
  banters: SideCrewBanterScript[];
}

export interface NpcSpeakerProfile {
  speakerId: string;
  displayName: string;
  roleLabel: string;
  accentColor: string;
  badgeGlyph: string;
}

export type BattleBanterTrigger =
  | 'battle_start'
  | 'boss_hp_50'
  | 'gimmick_hint'
  | 'player_awakening'
  | 'clash_start';

export interface BattleBanterEntry {
  banterId: string;
  episodeId: string;
  trigger: BattleBanterTrigger;
  /** Optional specific boss unitId (e.g. 'crocodile', 'kaido') */
  bossUnitId?: string;
  /** Optional specific ally unitId or formId (for player_awakening) */
  allyUnitId?: string;
  formId?: string;
  /** Optional encounterId filter */
  encounterId?: string;
  speakerId: string;
  speakerName: string;
  emotion: DialogueEmotion;
  text: string;
  priority?: number;
}

export interface BattleBanterBank {
  version: string;
  entries: BattleBanterEntry[];
}

export interface DirectiveAccessibilityConfig {
  flashEffect: boolean;
  shakeIntensity: number; // 0.0 ~ 1.0
}

export interface EvaluatedDirectiveCommand {
  directive: DialogueDirective;
  suppressedByAccessibility: boolean;
  effectiveShakeIntensity?: number;
}

export const DIALOGUE_EMOTION_META: Record<
  DialogueEmotion,
  { borderColor: string; bgTint: string; icon: string; label: string }
> = {
  normal: {
    borderColor: '#facc15',
    bgTint: 'rgba(15, 23, 42, 0.94)',
    icon: '',
    label: '평온'
  },
  angry: {
    borderColor: '#ef4444',
    bgTint: 'rgba(69, 10, 10, 0.92)',
    icon: '💢',
    label: '격노'
  },
  determined: {
    borderColor: '#f59e0b',
    bgTint: 'rgba(30, 27, 75, 0.94)',
    icon: '🔥',
    label: '결의'
  },
  shocked: {
    borderColor: '#38bdf8',
    bgTint: 'rgba(12, 74, 110, 0.92)',
    icon: '❗',
    label: '경악'
  },
  smirk: {
    borderColor: '#a855f7',
    bgTint: 'rgba(46, 16, 101, 0.92)',
    icon: '😏',
    label: '자신감'
  },
  sad: {
    borderColor: '#60a5fa',
    bgTint: 'rgba(15, 23, 42, 0.96)',
    icon: '💧',
    label: '비통'
  },
  excited: {
    borderColor: '#fb923c',
    bgTint: 'rgba(67, 20, 7, 0.92)',
    icon: '★',
    label: '흥분'
  }
};

export const VALID_TRIGGER_TYPES: ReadonlySet<DialogueTriggerType> = new Set([
  'arrival',
  'gold_marker',
  'pre_boss',
  'post_boss',
  'recruitment',
  'sea_gate',
  'side_banter'
]);

export const VALID_EMOTIONS: ReadonlySet<DialogueEmotion> = new Set([
  'normal',
  'angry',
  'determined',
  'shocked',
  'smirk',
  'sad',
  'excited'
]);

export const VALID_SIDES: ReadonlySet<DialogueSide> = new Set([
  'left',
  'right',
  'center_narration'
]);

/**
 * Evaluates a dialogue line's DSL directives with accessibility rules enforced.
 * - When `accessibility.flashEffect === false`, every `screenFlash` directive is suppressed.
 * - `cameraShake` intensity is multiplied by `accessibility.shakeIntensity` (0 suppresses it).
 */
export function evaluateLineDirectives(
  line: DialogueLineNode,
  accessibility: DirectiveAccessibilityConfig = {
    flashEffect: true,
    shakeIntensity: 0.8
  }
): EvaluatedDirectiveCommand[] {
  const directives = line.directives ?? [];
  const results: EvaluatedDirectiveCommand[] = [];

  for (const directive of directives) {
    if (directive.type === 'screenFlash') {
      results.push({
        directive,
        suppressedByAccessibility: !accessibility.flashEffect
      });
      continue;
    }

    if (directive.type === 'cameraShake') {
      const clampedMult = Math.max(0, Math.min(1, accessibility.shakeIntensity));
      const effective = directive.intensity * clampedMult;
      results.push({
        directive,
        suppressedByAccessibility: effective <= 0.01,
        effectiveShakeIntensity: effective
      });
      continue;
    }

    results.push({
      directive,
      suppressedByAccessibility: false
    });
  }

  return results;
}

/**
 * Pure structural validation helper for a DialogueScript (used in tests and CLI).
 */
export function validateDialogueScriptStructure(script: DialogueScript): string[] {
  const errs: string[] = [];
  if (!script.scriptId || script.scriptId.trim().length === 0) {
    errs.push('Missing scriptId');
  }
  if (!script.episodeId || script.episodeId.trim().length === 0) {
    errs.push(`[${script.scriptId}] Missing episodeId`);
  }
  if (!VALID_TRIGGER_TYPES.has(script.triggerType)) {
    errs.push(`[${script.scriptId}] Invalid triggerType: ${String(script.triggerType)}`);
  }
  if (!Array.isArray(script.lines) || script.lines.length === 0) {
    errs.push(`[${script.scriptId}] Script has no dialogue lines`);
    return errs;
  }

  script.lines.forEach((line, idx) => {
    const prefix = `[${script.scriptId}#${idx}]`;
    if (!line.speakerId || !line.speakerName) {
      errs.push(`${prefix} Missing speakerId or speakerName`);
    }
    if (!VALID_EMOTIONS.has(line.emotion)) {
      errs.push(`${prefix} Invalid emotion: ${String(line.emotion)}`);
    }
    if (!VALID_SIDES.has(line.side)) {
      errs.push(`${prefix} Invalid side: ${String(line.side)}`);
    }
    if (!line.text || line.text.trim().length === 0) {
      errs.push(`${prefix} Empty dialogue text`);
    }
  });

  return errs;
}
