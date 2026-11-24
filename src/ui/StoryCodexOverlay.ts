import {
  createInitialStoryProgress,
  getStoryCompletionSummary,
  STRAW_HAT_CREW_ORDER
} from '../core/story/StoryStateMachine';
import {
  getStoryChaptersByAct,
  STORY_CHAPTERS_LIST
} from '../data/story/storyChaptersRegistry';
import type {
  StoryChapterScript,
  StoryProgressState
} from '../data/story/types';
import type { Disposable } from '../core/types/disposable';

export interface StoryCodexCallbacks {
  onReplayCutscene: (chapterId: string) => void;
  onStartMusouBattle: (chapterId: string) => void;
  onClose?: () => void;
}

const CREW_KO_NAMES: Record<string, string> = {
  luffy: '루피',
  zoro: '조로',
  nami: '나미',
  usopp: '우솝',
  sanji: '상디',
  chopper: '쵸파',
  robin: '로빈',
  franky: '프랑키',
  brook: '브룩',
  jinbe: '징베'
};

const ACT_TABS: ReadonlyArray<{ act: 1 | 2 | 3; label: string }> = [
  { act: 1, label: '1부: 이스트 블루 (Ch.01~06)' },
  { act: 2, label: '2부: 위대한 항로 (Ch.07~12)' },
  { act: 3, label: '3부: 신세계 · 최종장 (Ch.13~18)' }
];

export class StoryCodexOverlay implements Disposable {
  private readonly backdropEl: HTMLElement;
  private abort = new AbortController();
  private activeAct: 1 | 2 | 3 = 1;
  private progress: StoryProgressState =
    createInitialStoryProgress(STORY_CHAPTERS_LIST);

  constructor(
    rootEl: HTMLElement,
    private readonly callbacks: StoryCodexCallbacks
  ) {
    this.backdropEl = document.createElement('div');
    this.backdropEl.id = 'story-codex-modal';
    this.backdropEl.className = 'modal-backdrop';
    this.backdropEl.setAttribute('role', 'dialog');
    this.backdropEl.setAttribute('aria-label', '원피스 3D 스토리 도감');
    rootEl.appendChild(this.backdropEl);
  }

  public isOpen(): boolean {
    return this.backdropEl.classList.contains('open');
  }

  public getActiveAct(): 1 | 2 | 3 {
    return this.activeAct;
  }

  public setActiveAct(act: 1 | 2 | 3): void {
    this.activeAct = act;
    if (this.isOpen()) {
      this.render();
    }
  }

  public open(progress?: Readonly<StoryProgressState> | null): void {
    this.progress = progress
      ? {
          ...progress,
          chapters: { ...progress.chapters },
          clearedChapterIds: [...progress.clearedChapterIds],
          recruitedUnits: [...progress.recruitedUnits],
          unlockedForms: [...progress.unlockedForms],
          unlockedSpecialSlots: [...progress.unlockedSpecialSlots],
          unlockedSeaZones: [...progress.unlockedSeaZones],
          worldFlags: [...progress.worldFlags]
        }
      : createInitialStoryProgress(STORY_CHAPTERS_LIST);
    this.backdropEl.classList.add('open');
    this.render();
  }

  public close(): void {
    if (!this.isOpen()) return;
    this.backdropEl.classList.remove('open');
    this.callbacks.onClose?.();
  }

  private renderChapterCard(ch: StoryChapterScript): string {
    const status = this.progress.chapters[ch.chapterId] ?? 'LOCKED';
    const isLocked = status === 'LOCKED';
    const isCleared = status === 'CLEARED';

    const statusBadge = isCleared
      ? '<span style="padding:2px 6px;border-radius:4px;background:#14532d;color:#86efac;border:1px solid #22c55e;font-size:10px;font-weight:700;">CLEARED ✓</span>'
      : isLocked
        ? '<span style="padding:2px 6px;border-radius:4px;background:#1e293b;color:#94a3b8;border:1px solid #475569;font-size:10px;">🔒 LOCKED</span>'
        : '<span style="padding:2px 6px;border-radius:4px;background:#713f12;color:#fef08a;border:1px solid #facc15;font-size:10px;font-weight:700;">▶ AVAILABLE</span>';

    if (isLocked) {
      return `
        <div data-codex-card="${ch.chapterId}" data-locked="true" style="background:rgba(15,23,42,0.65);border:1px dashed #334155;border-radius:8px;padding:10px;opacity:0.7;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <strong style="color:#64748b;font-size:12px;">${ch.chapterNo} · ??? (미해금 챕터 실루엣)</strong>
            ${statusBadge}
          </div>
          <div style="font-size:11px;color:#475569;margin-top:4px;">선행 스토리 챕터(${ch.prerequisiteChapterIds.join(', ') || '없음'})를 클리어하면 3D 컷신과 무쌍 보스전이 해금됩니다.</div>
        </div>
      `;
    }

    const unlockBadges: string[] = [];
    for (const u of ch.unlocks.recruitUnits) {
      unlockBadges.push(`🤝 ${CREW_KO_NAMES[u] ?? u}`);
    }
    for (const f of ch.unlocks.unlockForms) {
      unlockBadges.push(`✨ ${f}`);
    }
    if (ch.unlocks.upgradeShip === 'thousand_sunny') {
      unlockBadges.push('⛵ 사우전드 써니호');
    }
    if (ch.unlocks.bountyIncrease > 0) {
      unlockBadges.push(`💰 +${(ch.unlocks.bountyIncrease / 10000).toLocaleString()}만 베리`);
    }

    return `
      <div data-codex-card="${ch.chapterId}" data-locked="false" style="background:rgba(15,23,42,0.92);border:1.5px solid ${isCleared ? '#22c55e' : '#38bdf8'};border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:6px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <div>
            <span style="color:#38bdf8;font-family:monospace;font-size:11px;font-weight:700;">${ch.chapterNo}</span>
            <strong style="color:#fde047;font-size:13px;margin-left:6px;">${ch.title}</strong>
            <span style="color:#94a3b8;font-size:11px;margin-left:6px;">${ch.subtitle}</span>
          </div>
          ${statusBadge}
        </div>
        <div style="font-size:11px;color:#e2e8f0;line-height:1.45;">
          ${ch.summary2Lines[0]}<br/>${ch.summary2Lines[1]}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
          <div style="display:flex;gap:4px;flex-wrap:wrap;font-size:10px;color:#cbd5e1;">
            ${unlockBadges.map((b) => `<span style="padding:2px 6px;background:#090d16;border:1px solid #334155;border-radius:4px;">${b}</span>`).join('')}
          </div>
          <div style="display:flex;gap:6px;">
            <button type="button" data-codex-cutscene="${ch.chapterId}" style="padding:5px 10px;font-size:11px;font-weight:700;background:#1e3a8a;color:#e0f2fe;border:1px solid #38bdf8;border-radius:5px;cursor:pointer;">🎬 3D 컷신 다시보기</button>
            <button type="button" data-codex-battle="${ch.chapterId}" style="padding:5px 10px;font-size:11px;font-weight:700;background:#7c2d12;color:#fef08a;border:1px solid #f97316;border-radius:5px;cursor:pointer;">⚔ 무쌍 보스전 재도전</button>
          </div>
        </div>
      </div>
    `;
  }

  public render(): void {
    this.abort.abort();
    this.abort = new AbortController();
    const { signal } = this.abort;

    const summary = getStoryCompletionSummary(this.progress, STORY_CHAPTERS_LIST);
    const chaptersInAct = getStoryChaptersByAct(this.activeAct);

    this.backdropEl.innerHTML = `
      <div style="width:min(860px, 95vw);max-height:88dvh;display:flex;flex-direction:column;gap:8px;background:rgba(9,13,22,0.97);border:2px solid #facc15;border-radius:12px;padding:12px;color:#f8fafc;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;border-bottom:1px solid #1e293b;padding-bottom:8px;">
          <div>
            <h2 style="margin:0;font-size:16px;color:#fde047;">📖 원피스 3D 스토리 도감 (Ch.01 후샤 마을 ~ Ch.18 엘바프)</h2>
            <div style="font-size:11px;color:#7dd3fc;margin-top:2px;">
              진행도: <strong>${summary.clearedCount}/${summary.totalCount} (${summary.percent}%)</strong> · 스토리 현상금: <strong style="color:#fb923c;">${this.progress.totalStoryBounty.toLocaleString()} 베리</strong> · 기함: <strong>${this.progress.activeShipId === 'thousand_sunny' ? '사우전드 써니호' : '고잉 메리호'}</strong>
            </div>
          </div>
          <button id="btn-codex-close" type="button" style="padding:5px 10px;background:#1e293b;color:#f8fafc;border:1px solid #64748b;border-radius:6px;font-weight:700;cursor:pointer;">✕ 닫기</button>
        </div>

        <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;background:#0f172a;padding:6px 8px;border-radius:6px;border:1px solid #1e293b;font-size:10px;">
          <span style="color:#facc15;font-weight:700;margin-right:4px;">🏴‍☠️ 밀짚모자 10인 (${summary.strawHatCount}/10):</span>
          ${STRAW_HAT_CREW_ORDER.map((uid) => {
            const ok = summary.recruitedCrewChecklist.find((c) => c.unitId === uid)?.recruited ?? false;
            return `<span style="padding:2px 6px;border-radius:999px;border:1px solid ${ok ? '#22c55e' : '#334155'};background:${ok ? '#14532d' : '#090d16'};color:${ok ? '#bbf7d0' : '#64748b'};">${ok ? '✓' : '○'} ${CREW_KO_NAMES[uid] ?? uid}</span>`;
          }).join('')}
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">
          ${ACT_TABS.map((tab) => {
            const active = tab.act === this.activeAct;
            const actStats = summary.actBreakdown.find((a) => a.act === tab.act);
            return `<button type="button" data-codex-act="${tab.act}" style="padding:7px 6px;font-size:11px;font-weight:800;border-radius:6px;cursor:pointer;border:1.5px solid ${active ? '#facc15' : '#334155'};background:${active ? '#713f12' : '#1e293b'};color:${active ? '#fef08a' : '#cbd5e1'};">${tab.label} (${actStats?.cleared ?? 0}/${actStats?.total ?? 0})</button>`;
          }).join('')}
        </div>

        <div style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding-right:4px;">
          ${chaptersInAct.map((ch) => this.renderChapterCard(ch)).join('')}
        </div>
      </div>
    `;

    this.backdropEl
      .querySelector('#btn-codex-close')
      ?.addEventListener('click', () => this.close(), { signal });

    this.backdropEl.addEventListener(
      'click',
      (e) => {
        if (e.target === this.backdropEl) {
          this.close();
        }
      },
      { signal }
    );

    this.backdropEl.querySelectorAll('[data-codex-act]').forEach((btn) => {
      btn.addEventListener(
        'click',
        () => {
          const val = Number((btn as HTMLElement).dataset.codexAct);
          if (val === 1 || val === 2 || val === 3) {
            this.setActiveAct(val);
          }
        },
        { signal }
      );
    });

    this.backdropEl.querySelectorAll('[data-codex-cutscene]').forEach((btn) => {
      btn.addEventListener(
        'click',
        () => {
          const id = (btn as HTMLElement).dataset.codexCutscene;
          if (id) {
            this.close();
            this.callbacks.onReplayCutscene(id);
          }
        },
        { signal }
      );
    });

    this.backdropEl.querySelectorAll('[data-codex-battle]').forEach((btn) => {
      btn.addEventListener(
        'click',
        () => {
          const id = (btn as HTMLElement).dataset.codexBattle;
          if (id) {
            this.close();
            this.callbacks.onStartMusouBattle(id);
          }
        },
        { signal }
      );
    });
  }

  public dispose(): void {
    this.abort.abort();
    this.backdropEl.remove();
  }
}
