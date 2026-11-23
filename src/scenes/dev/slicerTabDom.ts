import type { GameDataRegistry } from '../../core/types/dataSchemas';
import {
  STANDARD_SPRITE_ANIM_STATES,
  type SpriteAnimState
} from '../../data/assets/types';
import type { SlicerAnalysisResult } from '../../assets/slicer/slicerTypes';

export type SlicerToolMode = 'TOGGLE_EXCLUDE' | 'MERGE' | 'PIVOT_DRAG';

export interface SlicerDomContext {
  unitId: string;
  formId: string;
  tolerance: number;
  flipHorizontal: boolean;
  toolMode: SlicerToolMode;
  previewRowIndex: number;
  selectedFrameIds: number[];
  activePivotFrameId: number | null;
  statusMessage: string;
  analysis: SlicerAnalysisResult | null;
  gameRegistry: GameDataRegistry;
}

export function buildSlicerTabHtml(ctx: SlicerDomContext): string {
  const unitIds = Object.keys(ctx.gameRegistry.units);
  const unitDef = ctx.gameRegistry.units[ctx.unitId];
  const formIds = new Set<string>();
  if (unitDef?.defaultFormId) formIds.add(unitDef.defaultFormId);
  if (unitDef?.awakenedFormId) formIds.add(unitDef.awakenedFormId);
  for (const fid of unitDef?.forms ?? []) formIds.add(fid);

  const toolBtnStyle = (mode: SlicerToolMode) =>
    `padding:4px 8px;font-size:11px;cursor:pointer;border-radius:4px;border:1px solid ${
      ctx.toolMode === mode ? '#38bdf8' : '#475569'
    };background:${ctx.toolMode === mode ? '#0284c7' : '#0f172a'};color:#f8fafc;font-weight:bold;`;

  const rowListHtml = ctx.analysis
    ? ctx.analysis.rows
        .map((row) => {
          const isPreview = ctx.previewRowIndex === row.rowIndex;
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding:4px 6px;background:${
              isPreview ? '#172554' : '#0f172a'
            };border:1px solid ${isPreview ? '#38bdf8' : '#334155'};border-radius:4px;font-size:11px;">
              <button data-slicer-preview-row="${row.rowIndex}" style="background:none;border:none;color:#fde047;cursor:pointer;font-weight:bold;padding:0;font-family:monospace;">
                ▶ R${row.rowIndex} (${row.frames.length}f)
              </button>
              <select data-slicer-row-state="${row.rowIndex}" style="padding:2px 4px;background:#1e293b;color:#f8fafc;border:1px solid #475569;font-size:11px;">
                ${STANDARD_SPRITE_ANIM_STATES.map(
                  (st) => `<option value="${st}" ${row.assignedState === st ? 'selected' : ''}>${st}</option>`
                ).join('')}
              </select>
            </div>
          `;
        })
        .join('')
    : '<div style="font-size:11px;color:#94a3b8;">시트를 로드하면 행별 자동 분류 결과가 표시됩니다.</div>';

  return `
    <div style="display:grid;grid-template-columns:270px 1fr;gap:10px;">
      <div style="background:#1e293b;padding:10px;border-radius:6px;display:flex;flex-direction:column;gap:8px;font-size:12px;">
        <div id="ap-slicer-dropzone" style="border:2px dashed #38bdf8;border-radius:6px;padding:10px;text-align:center;background:#0f172a;cursor:pointer;">
          <div style="color:#fde047;font-weight:bold;">📥 비규격 시트 PNG 드롭 / 선택</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px;">NDS·JUS·GBA·MUGEN PNG 지원</div>
          <input id="ap-slicer-file" type="file" accept="image/png" style="margin-top:6px;width:100%;font-size:10px;" />
        </div>

        <button id="ap-slicer-load-sample" style="padding:5px 8px;cursor:pointer;background:#0f766e;color:#f0fdfa;border:1px solid #14b8a6;border-radius:4px;font-weight:bold;font-size:11px;">
          🧪 테스트용 비규격 시트 로드
        </button>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <label style="font-size:11px;">대상 유닛
            <select id="ap-slicer-unit" style="width:100%;margin-top:2px;padding:3px;background:#0f172a;color:#f8fafc;border:1px solid #475569;">
              ${unitIds
                .map(
                  (uid) =>
                    `<option value="${uid}" ${ctx.unitId === uid ? 'selected' : ''}>${ctx.gameRegistry.units[uid]?.name ?? uid}</option>`
                )
                .join('')}
            </select>
          </label>
          <label style="font-size:11px;">폼 (formId)
            <select id="ap-slicer-form" style="width:100%;margin-top:2px;padding:3px;background:#0f172a;color:#f8fafc;border:1px solid #475569;">
              <option value="base" ${ctx.formId === 'base' ? 'selected' : ''}>base</option>
              ${Array.from(formIds)
                .map((fid) => `<option value="${fid}" ${ctx.formId === fid ? 'selected' : ''}>${fid}</option>`)
                .join('')}
            </select>
          </label>
        </div>

        <label style="font-size:11px;">배경색 허용 오차 (<span id="ap-slicer-tol-val">${ctx.tolerance}</span>)
          <input id="ap-slicer-tol" type="range" min="4" max="48" value="${ctx.tolerance}" style="width:100%;" />
        </label>

        <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer;">
          <input id="ap-slicer-flipx" type="checkbox" ${ctx.flipHorizontal ? 'checked' : ''} /> 좌우 반전 정규화 (오른쪽 보기)
        </label>

        <div style="border-top:1px solid #334155;padding-top:6px;">
          <div style="font-size:11px;color:#cbd5e1;margin-bottom:4px;">수동 보정 도구 (원본 캔버스 클릭/드래그):</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            <button data-slicer-tool="TOGGLE_EXCLUDE" style="${toolBtnStyle('TOGGLE_EXCLUDE')}">제외↔복구</button>
            <button data-slicer-tool="MERGE" style="${toolBtnStyle('MERGE')}">병합 선택</button>
            <button data-slicer-tool="PIVOT_DRAG" style="${toolBtnStyle('PIVOT_DRAG')}">피벗 드래그</button>
          </div>
          <div style="display:flex;gap:4px;margin-top:6px;">
            <button id="ap-slicer-merge-selected" style="flex:1;padding:4px;font-size:10px;cursor:pointer;background:#334155;color:#fff;border:1px solid #64748b;border-radius:4px;">선택 병합 (${ctx.selectedFrameIds.length}/2)</button>
            <button id="ap-slicer-reset" style="padding:4px 8px;font-size:10px;cursor:pointer;background:#7f1d1d;color:#fecaca;border:1px solid #ef4444;border-radius:4px;">초기화</button>
          </div>
        </div>

        <div style="border-top:1px solid #334155;padding-top:6px;display:flex;flex-direction:column;gap:4px;max-height:135px;overflow-y:auto;">
          <div style="font-size:11px;color:#94a3b8;">행(Row) → 11개 상태 매핑:</div>
          ${rowListHtml}
        </div>

        <button id="ap-slicer-export-recipe" style="padding:7px 10px;cursor:pointer;background:#ca8a04;color:#0f172a;border:1px solid #fde047;border-radius:4px;font-weight:bold;font-size:12px;">
          💾 레시피 저장 (.recipe.json)
        </button>
      </div>

      <div style="background:#020617;padding:10px;border-radius:6px;border:1px solid #334155;display:flex;flex-direction:column;gap:8px;">
        <div id="ap-slicer-status" style="font-size:11px;color:#a7f3d0;background:#0f172a;padding:5px 8px;border-radius:4px;border:1px solid #334155;">
          ${ctx.statusMessage}
        </div>
        <div style="display:grid;grid-template-columns:1fr 220px;gap:8px;align-items:start;">
          <div>
            <div style="font-size:10px;color:#94a3b8;margin-bottom:3px;">원본 오버레이 (초록=채택 · 빨강X=제외 · 노랑=피벗)</div>
            <canvas id="ap-slicer-sheet-canvas" width="420" height="320" style="width:100%;height:auto;background:#0b1120;border:1px solid #1e293b;image-rendering:pixelated;cursor:crosshair;"></canvas>
          </div>
          <div>
            <div style="font-size:10px;color:#94a3b8;margin-bottom:3px;">발바닥 기준선 실시간 재생</div>
            <canvas id="ap-slicer-anim-canvas" width="220" height="220" style="width:100%;height:auto;background:#0b1120;border:1px solid #1e293b;image-rendering:pixelated;"></canvas>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function isValidAnimStateValue(val: string): val is SpriteAnimState {
  return (STANDARD_SPRITE_ANIM_STATES as readonly string[]).includes(val);
}
