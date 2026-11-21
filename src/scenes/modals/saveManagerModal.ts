import { canEnterOnlineBattle } from '../../core/save/antiCheat';
import type { SaveEnvelope, SaveSlotId } from '../../core/save/schema';
import type { GameDataRegistry } from '../../core/types/dataSchemas';
import type { RpgCampaignState, RpgDataRegistry } from '../../core/types/rpgSchemas';
import type { PlatformBridge } from '../../platform/platformBridge';
import {
  parseAndValidateImportedSaveJson,
  type ImportedSavePreview
} from '../../platform/storage/saveFileIO';
import {
  ALL_SAVE_SLOTS,
  type SaveStorageAdapter
} from '../../platform/storage/storageAdapter';

export interface SaveManagerModalContext {
  saveModalEl: HTMLElement;
  storage: SaveStorageAdapter;
  platformBridge: PlatformBridge;
  campaign: RpgCampaignState;
  rpgRegistry: RpgDataRegistry;
  gameRegistry: GameDataRegistry;
  getPendingImportPreview: () => ImportedSavePreview | null;
  setPendingImportPreview: (preview: ImportedSavePreview | null) => void;
  getPendingImportTargetSlot: () => SaveSlotId;
  setPendingImportTargetSlot: (slot: SaveSlotId) => void;
  buildCurrentSaveEnvelope: (slotId: SaveSlotId) => SaveEnvelope;
  saveToSlot: (slotId: SaveSlotId) => Promise<SaveEnvelope>;
  applyLoadedEnvelope: (envelope: SaveEnvelope) => void;
  syncLogsDom: () => void;
}

export function createSaveManagerModalElement(): HTMLElement {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.id = 'save-manager-modal';
  return modal;
}

export async function renderSaveManagerModal(
  ctx: SaveManagerModalContext,
  errorMessage?: string
): Promise<void> {
  const {
    saveModalEl,
    storage,
    platformBridge,
    campaign,
    rpgRegistry,
    gameRegistry
  } = ctx;

  const slots = await storage.listAllSlots();
  const onlineCheck = canEnterOnlineBattle(
    ctx.buildCurrentSaveEnvelope('auto'),
    rpgRegistry,
    gameRegistry
  );
  const pendingPreview = ctx.getPendingImportPreview();
  const targetSlot = ctx.getPendingImportTargetSlot();

  const slotCardsHtml = ALL_SAVE_SLOTS.map((slotId) => {
    const env = slots[slotId];
    const title =
      slotId === 'auto'
        ? '🔄 AUTO 슬롯 (자동 저장)'
        : `💾 ${slotId.toUpperCase()} 슬롯`;

    if (!env) {
      return `<div class="slot-card">
        <div class="field-row">
          <strong style="color:#94a3b8;">${title} — [비어 있음]</strong>
          <div>
            ${
              slotId !== 'auto'
                ? `<button data-save-slot="${slotId}" class="btn-tab-active">현재 진행 저장</button>`
                : ''
            }
          </div>
        </div>
      </div>`;
    }

    const sum = env.meta.summary;
    const ac = env.meta.antiCheat;
    const badgeHtml = ac.isTampered
      ? `<span style="color:#f87171;font-weight:bold;">⚠ 비공식 수정 데이터 (${ac.violationCodes.join(', ')})</span>`
      : `<span style="color:#4ade80;">✓ 무결성 검증 완료 (온라인 가능)</span>`;

    return `<div class="slot-card">
      <div class="field-row">
        <strong style="color:#fde047;">${title}</strong>
        <span style="font-size:10px;color:#94a3b8;">${env.meta.savedAt.slice(0, 19).replace('T', ' ')}</span>
      </div>
      <div style="font-size:11px;color:#e2e8f0;">
        해역: <strong style="color:#38bdf8;">${sum.currentZoneName}</strong> | 선장 Lv.${sum.captainLevel} | 동료 ${sum.crewCount}명 | 클리어 ${sum.completedEpisodeCount}개
      </div>
      <div style="font-size:11px;color:#f97316;">
        총 현상금: ฿ ${sum.bounty.toLocaleString()} | ${badgeHtml}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:2px;">
        ${
          slotId !== 'auto'
            ? `<button data-save-slot="${slotId}" class="btn-tab-active">덮어쓰기 저장</button>`
            : ''
        }
        <button data-load-slot="${slotId}">📂 불러오기</button>
        <button data-export-slot="${slotId}">📤 JSON 내보내기</button>
        <button data-delete-slot="${slotId}" class="btn-danger">🗑 삭제</button>
      </div>
    </div>`;
  }).join('');

  const previewHtml = pendingPreview
    ? `<div class="slot-card" style="border:2px solid ${
        pendingPreview.antiCheat.isTampered ? '#ef4444' : '#22c55e'
      };background:#1e1b4b;">
        <h4 style="color:#fde047;">🔍 JSON 가져오기 덮어쓰기 전 미리보기 확인</h4>
        <div style="font-size:11px;">
          대상 슬롯: <strong>${targetSlot.toUpperCase()}</strong> |
          해역: <strong>${pendingPreview.envelope.meta.summary.currentZoneName}</strong> |
          현상금: <strong>฿ ${pendingPreview.envelope.meta.summary.bounty.toLocaleString()}</strong> |
          플레이 시간: <strong>${pendingPreview.envelope.meta.playTimeSec}초</strong>
        </div>
        <div style="font-size:11px;color:${
          pendingPreview.antiCheat.isTampered ? '#fca5a5' : '#4ade80'
        };">
          무결성/합법성 상태: ${
            pendingPreview.antiCheat.isTampered
              ? `⚠ 비공식 수정 데이터 감지 [${pendingPreview.antiCheat.violationCodes.join(', ')}] — 싱글 플레이는 가능하나 통신 대전이 제한됩니다.`
              : '✓ 정상 세이브 데이터 (HMAC-SHA256 서명 및 게임 규칙 합법성 통과)'
          }
        </div>
        <div style="display:flex;gap:8px;margin-top:4px;">
          <button id="btn-confirm-import" class="btn-tab-active">✓ 확인 및 슬롯에 복원 적용</button>
          <button id="btn-cancel-import">취소</button>
        </div>
      </div>`
    : '';

  saveModalEl.innerHTML = `
    <div class="modal-box" role="dialog" aria-label="세이브 및 JSON 백업 관리">
      <div class="field-row">
        <h3 style="color:#fde047;font-size:15px;">💾 모험 기록 저장 / 불러오기</h3>
        <button id="btn-close-save-modal">닫기</button>
      </div>

      <div style="font-size:11px;color:${onlineCheck.allowed ? '#4ade80' : '#f87171'};">
        온라인 통신 대전 상태: ${
          onlineCheck.allowed
            ? '✓ 정상 (온라인 대전 참가 가능)'
            : `⚠ 제한됨 (${onlineCheck.reasons[0]})`
        }
      </div>

      ${
        errorMessage
          ? `<div style="background:#7f1d1d;border:1px solid #ef4444;color:#fecaca;padding:8px;border-radius:4px;font-size:11px;">❌ ${errorMessage}</div>`
          : ''
      }

      ${previewHtml}

      <div style="display:flex;flex-direction:column;gap:8px;">
        ${slotCardsHtml}
      </div>

      <details class="slot-card" ${pendingPreview || errorMessage ? 'open' : ''}>
        <summary style="cursor:pointer;color:#38bdf8;font-size:12px;font-weight:700;">
          📦 백업 파일(.json) 복원 및 개발자 검증 도구 열기
        </summary>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">
          <div class="field-row">
            <label>복원할 대상 슬롯:</label>
            <select id="sel-import-target-slot">
              <option value="slot_1" ${targetSlot === 'slot_1' ? 'selected' : ''}>SLOT_1</option>
              <option value="slot_2" ${targetSlot === 'slot_2' ? 'selected' : ''}>SLOT_2</option>
              <option value="slot_3" ${targetSlot === 'slot_3' ? 'selected' : ''}>SLOT_3</option>
              <option value="auto" ${targetSlot === 'auto' ? 'selected' : ''}>AUTO</option>
            </select>
            <button id="btn-native-file-import" class="btn-showcase">📂 백업 파일 선택 (.op-save.json)</button>
            <input type="file" id="inp-import-file" accept=".json,.op-save.json" />
          </div>
          <div id="save-drop-zone" class="drop-zone">
            여기에 .op-save.json 백업 파일을 드래그하거나 아래에 JSON을 붙여넣으세요.
          </div>
          <textarea id="txt-import-json" rows="3" placeholder="JSON 백업 데이터를 붙여넣어 복원할 수 있습니다." style="width:100%;font-family:monospace;font-size:10px;"></textarea>
          <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:space-between;">
            <div style="display:flex;gap:6px;">
              <button id="btn-fill-current-json" class="btn-showcase">📋 현재 세이브 JSON 복사</button>
              <button id="btn-simulate-tamper" class="btn-danger">🧪 변조 시뮬레이션 (개발자용)</button>
            </div>
            <button id="btn-parse-import-json" class="btn-tab-active">🔍 JSON 확인 및 복원 미리보기</button>
          </div>
          <div style="display:flex;justify-content:flex-start;margin-top:4px;">
            <button id="btn-clear-all-idb" class="btn-danger">🧹 전체 저장 슬롯 초기화</button>
          </div>
        </div>
      </details>

      <div style="display:flex;justify-content:flex-end;margin-top:4px;">
        <button id="btn-close-save-modal-bottom" class="btn-tab-active">닫기</button>
      </div>
    </div>
  `;

  saveModalEl.classList.add('open');

  const closeSaveModal = () => {
    ctx.setPendingImportPreview(null);
    saveModalEl.classList.remove('open');
  };
  saveModalEl
    .querySelector('#btn-close-save-modal')
    ?.addEventListener('click', closeSaveModal);
  saveModalEl
    .querySelector('#btn-close-save-modal-bottom')
    ?.addEventListener('click', closeSaveModal);

  saveModalEl
    .querySelectorAll<HTMLButtonElement>('[data-save-slot]')
    .forEach((btn) => {
      btn.addEventListener('click', async () => {
        const slotId = btn.dataset.saveSlot as SaveSlotId;
        await ctx.saveToSlot(slotId);
        await renderSaveManagerModal(ctx);
      });
    });

  saveModalEl
    .querySelectorAll<HTMLButtonElement>('[data-load-slot]')
    .forEach((btn) => {
      btn.addEventListener('click', async () => {
        const slotId = btn.dataset.loadSlot as SaveSlotId;
        const env = await storage.loadSlot(slotId);
        if (env) {
          ctx.applyLoadedEnvelope(env);
          closeSaveModal();
        }
      });
    });

  saveModalEl
    .querySelectorAll<HTMLButtonElement>('[data-export-slot]')
    .forEach((btn) => {
      btn.addEventListener('click', async () => {
        const slotId = btn.dataset.exportSlot as SaveSlotId;
        const env = await storage.loadSlot(slotId);
        if (env) {
          const expRes = await platformBridge.fileTransfer.exportSaveEnvelope(env);
          const txtArea = saveModalEl.querySelector(
            '#txt-import-json'
          ) as HTMLTextAreaElement | null;
          if (txtArea) txtArea.value = expRes.jsonContent;
          if (expRes.exported) {
            campaign.voyageLog.push(
              `[JSON Export] 슬롯 [${slotId}] 백업 파일(${expRes.filename})을 내보냈습니다.`
            );
            ctx.syncLogsDom();
          }
        }
      });
    });

  saveModalEl
    .querySelectorAll<HTMLButtonElement>('[data-delete-slot]')
    .forEach((btn) => {
      btn.addEventListener('click', async () => {
        const slotId = btn.dataset.deleteSlot as SaveSlotId;
        await storage.deleteSlot(slotId);
        await renderSaveManagerModal(ctx);
      });
    });

  saveModalEl
    .querySelector('#btn-clear-all-idb')
    ?.addEventListener('click', async () => {
      await storage.clearAllSlots();
      campaign.voyageLog.push('[IndexedDB 초기화] 모든 세이브 슬롯이 초기화되었습니다.');
      await renderSaveManagerModal(ctx);
    });

  const selTarget = saveModalEl.querySelector(
    '#sel-import-target-slot'
  ) as HTMLSelectElement;
  selTarget?.addEventListener('change', () => {
    ctx.setPendingImportTargetSlot(selTarget.value as SaveSlotId);
  });

  const handleRawImportText = async (text: string) => {
    try {
      ctx.setPendingImportPreview(
        parseAndValidateImportedSaveJson(text, rpgRegistry, gameRegistry)
      );
      await renderSaveManagerModal(ctx);
    } catch (err) {
      ctx.setPendingImportPreview(null);
      const msg =
        err instanceof Error ? err.message : '알 수 없는 JSON 가져오기 오류';
      await renderSaveManagerModal(ctx, msg);
    }
  };

  const fileInp = saveModalEl.querySelector('#inp-import-file') as HTMLInputElement;
  fileInp?.addEventListener('change', async () => {
    const file = fileInp.files?.[0];
    if (!file) return;
    const text = await file.text();
    await handleRawImportText(text);
  });

  saveModalEl
    .querySelector('#btn-native-file-import')
    ?.addEventListener('click', async () => {
      const picked = await platformBridge.fileTransfer.importSaveEnvelopeFile();
      if (picked) {
        await handleRawImportText(picked.jsonContent);
      }
    });

  const dropZone = saveModalEl.querySelector('#save-drop-zone') as HTMLElement;
  dropZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#facc15';
  });
  dropZone?.addEventListener('dragleave', () => {
    dropZone.style.borderColor = '#38bdf8';
  });
  dropZone?.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#38bdf8';
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const text = await file.text();
    await handleRawImportText(text);
  });

  const txtArea = saveModalEl.querySelector(
    '#txt-import-json'
  ) as HTMLTextAreaElement;

  saveModalEl
    .querySelector('#btn-fill-current-json')
    ?.addEventListener('click', () => {
      const env = ctx.buildCurrentSaveEnvelope(ctx.getPendingImportTargetSlot());
      txtArea.value = JSON.stringify(env, null, 2);
    });

  saveModalEl
    .querySelector('#btn-simulate-tamper')
    ?.addEventListener('click', () => {
      const env = ctx.buildCurrentSaveEnvelope(ctx.getPendingImportTargetSlot());
      env.payload.economy.berry += 1;
      env.payload.world.currentZoneId = 'new_world';
      txtArea.value = JSON.stringify(env, null, 2);
    });

  saveModalEl
    .querySelector('#btn-parse-import-json')
    ?.addEventListener('click', async () => {
      await handleRawImportText(txtArea.value);
    });

  saveModalEl
    .querySelector('#btn-confirm-import')
    ?.addEventListener('click', async () => {
      const preview = ctx.getPendingImportPreview();
      if (!preview) return;
      const slot = ctx.getPendingImportTargetSlot();
      const env = preview.envelope;
      env.meta.slotId = slot;
      await storage.saveSlot(slot, env);
      ctx.applyLoadedEnvelope(env);
      ctx.setPendingImportPreview(null);
      await renderSaveManagerModal(ctx);
    });

  saveModalEl
    .querySelector('#btn-cancel-import')
    ?.addEventListener('click', async () => {
      ctx.setPendingImportPreview(null);
      await renderSaveManagerModal(ctx);
    });
}
