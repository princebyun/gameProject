import type { AssetLoader } from '../../assets/assetLoader';
import type { AudioManager } from '../../audio/audioManager';
import type { FormDefinition, GameDataRegistry } from '../../core/types/dataSchemas';
import type { ProManifestEntry } from '../../data/assets/proAssetManifest';
import {
  STANDARD_SPRITE_ANIM_STATES,
  type SpriteAnimState
} from '../../data/assets/types';

export type PreviewTab = 'SPRITE' | 'TILESET' | 'AUDIO' | 'SLICER';

export interface AssetPreviewUiState {
  activeTab: PreviewTab;
  selectedTargetKey: string;
  selectedFormId: string;
  selectedAnim: SpriteAnimState;
  zoomScale: 1 | 2 | 3;
  toggleHitFlash: boolean;
  toggleArmament: boolean;
  toggleHagoromo: 'NONE' | 'WHITE' | 'BLACK';
  toggleLunarian: boolean;
  toggleConqueror: boolean;
  selectedBiomeId: string;
  lastSfxResultText: string;
  slicerBodyHtml?: string;
}

export interface AssetPreviewHtmlContext {
  state: AssetPreviewUiState;
  unitIds: string[];
  shipIds: string[];
  isShip: boolean;
  forms: FormDefinition[];
  spriteMetaText: string;
  spriteSourceBadge: string;
  biomeSourceBadge: string;
  proSpriteEntry?: ProManifestEntry | null;
  proBiomeEntry?: ProManifestEntry | null;
  gameRegistry: GameDataRegistry;
  assets: AssetLoader;
  audio: AudioManager;
}

function formatProEntryBadgeHtml(entry: ProManifestEntry | null | undefined): string {
  if (!entry) {
    return '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#1e293b;color:#94a3b8;border:1px solid #334155;">PRO: LEGACY_ONLY</span>';
  }
  const statusStyle =
    entry.status === 'VERIFIED'
      ? 'background:#166534;color:#bbf7d0;border:1px solid #4ade80;'
      : entry.status === 'IMPORTED'
        ? 'background:#075985;color:#bae6fd;border:1px solid #38bdf8;'
        : 'background:#334155;color:#cbd5e1;border:1px solid #64748b;';
  const ext = entry.assetPath.split('.').pop()?.toUpperCase() ?? 'N/A';
  const sizeKb = (entry.fileSizeBytes / 1024).toFixed(1);
  const dims =
    entry.dimensions.width > 0 ? `${entry.dimensions.width}×${entry.dimensions.height}` : 'N/A';
  return `<span id="ap-pro-status-badge" style="font-size:10px;padding:2px 7px;border-radius:4px;font-weight:bold;${statusStyle}">PRO ${entry.status} · .${ext} · ${dims} · ${sizeKb} KB (W${entry.wave}/${entry.bundle})</span>`;
}

function badgeColor(source: string): string {
  return source.startsWith('EXTERNAL')
    ? 'background:#166534;color:#bbf7d0;border:1px solid #4ade80;'
    : 'background:#78350f;color:#fde68a;border:1px solid #f59e0b;';
}

function buildSpriteTabHtml(ctx: AssetPreviewHtmlContext): string {
  const { state, unitIds, shipIds, isShip, forms, gameRegistry, spriteMetaText, spriteSourceBadge } = ctx;
  return `
    <div style="display:grid;grid-template-columns:280px 1fr;gap:12px;">
      <div style="background:#1e293b;padding:10px;border-radius:6px;display:flex;flex-direction:column;gap:8px;font-size:12px;">
        <label>캐릭터 / 선박 선택:
          <select id="ap-sel-target" style="width:100%;margin-top:4px;padding:4px;background:#0f172a;color:#f8fafc;border:1px solid #475569;">
            <optgroup label="캐릭터 / 보스 (${unitIds.length}종)">
              ${unitIds
                .map((id) => {
                  const u = gameRegistry.units[id];
                  const val = `unit:${id}`;
                  return `<option value="${val}" ${state.selectedTargetKey === val ? 'selected' : ''}>${u?.name ?? id} (${id})</option>`;
                })
                .join('')}
            </optgroup>
            <optgroup label="선박 (${shipIds.length}종)">
              ${shipIds
                .map((sid) => {
                  const val = `ship:${sid}`;
                  return `<option value="${val}" ${state.selectedTargetKey === val ? 'selected' : ''}>🚢 ${sid}</option>`;
                })
                .join('')}
            </optgroup>
          </select>
        </label>

        ${
          !isShip
            ? `<label>변신 / 각성 폼:
                <select id="ap-sel-form" style="width:100%;margin-top:4px;padding:4px;background:#0f172a;color:#f8fafc;border:1px solid #475569;">
                  <option value="base" ${state.selectedFormId === 'base' ? 'selected' : ''}>기본 폼 (base)</option>
                  ${forms
                    .map(
                      (f) =>
                        `<option value="${f.id}" ${state.selectedFormId === f.id ? 'selected' : ''}>${f.name} (${f.id})</option>`
                    )
                    .join('')}
                </select>
              </label>`
            : ''
        }

        <label>애니메이션 상태 (11종):
          <select id="ap-sel-anim" style="width:100%;margin-top:4px;padding:4px;background:#0f172a;color:#f8fafc;border:1px solid #475569;">
            ${STANDARD_SPRITE_ANIM_STATES.map(
              (st, idx) =>
                `<option value="${st}" ${state.selectedAnim === st ? 'selected' : ''}>Row ${idx}: ${st}</option>`
            ).join('')}
          </select>
        </label>

        <div>
          <div style="margin-bottom:4px;">픽셀 배율:</div>
          <div style="display:flex;gap:6px;">
            ${([1, 2, 3] as const)
              .map(
                (z) =>
                  `<button data-ap-zoom="${z}" style="flex:1;padding:4px;cursor:pointer;border:1px solid #64748b;background:${state.zoomScale === z ? '#0ea5e9' : '#0f172a'};color:#fff;font-weight:bold;">${z}x</button>`
              )
              .join('')}
          </div>
        </div>

        <div style="border-top:1px solid #334155;padding-top:8px;display:flex;flex-direction:column;gap:6px;">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" id="ap-chk-flash" ${state.toggleHitFlash ? 'checked' : ''} /> 피격 80ms 백색 플래시
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" id="ap-chk-armament" ${state.toggleArmament ? 'checked' : ''} /> 무장색 패기 흑화
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" id="ap-chk-lunarian" ${state.toggleLunarian ? 'checked' : ''} /> 루나리아 등 불꽃
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
            <input type="checkbox" id="ap-chk-conqueror" ${state.toggleConqueror ? 'checked' : ''} /> 패왕색 검붉은 번개
          </label>
          <label>동물계 각성 구름 띠:
            <select id="ap-sel-hagoromo" style="width:100%;margin-top:4px;padding:4px;background:#0f172a;color:#f8fafc;border:1px solid #475569;">
              <option value="NONE" ${state.toggleHagoromo === 'NONE' ? 'selected' : ''}>없음</option>
              <option value="WHITE" ${state.toggleHagoromo === 'WHITE' ? 'selected' : ''}>흰색 구름 띠 (기어 5 / 니카)</option>
              <option value="BLACK" ${state.toggleHagoromo === 'BLACK' ? 'selected' : ''}>검은 구름 띠 (각성 루치 / 오로성)</option>
            </select>
          </label>
        </div>
      </div>

      <div style="background:#020617;padding:10px;border-radius:6px;border:1px solid #334155;display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
          <span style="font-size:11px;color:#cbd5e1;">${spriteMetaText}</span>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            ${formatProEntryBadgeHtml(ctx.proSpriteEntry)}
            <span id="ap-sprite-source-badge" style="font-size:11px;padding:2px 8px;border-radius:999px;font-weight:bold;${badgeColor(spriteSourceBadge)}">${spriteSourceBadge}</span>
          </div>
        </div>
        <canvas id="ap-preview-canvas" width="560" height="340" style="width:100%;height:auto;background:#0b1120;border:1px solid #1e293b;image-rendering:pixelated;"></canvas>
      </div>
    </div>
  `;
}

function buildTilesetTabHtml(ctx: AssetPreviewHtmlContext): string {
  const { state, biomeSourceBadge, assets } = ctx;
  const biomeEntries = assets.manifestRegistry.tilesetsFile.biomes;
  const selectedBiome =
    assets.manifestRegistry.biomesById[state.selectedBiomeId] ?? biomeEntries[0];

  return `
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;background:#1e293b;padding:10px;border-radius:6px;">
        <label style="font-size:12px;">바이옴 선택 (${biomeEntries.length}종):
          <select id="ap-sel-biome" style="margin-left:8px;padding:4px 8px;background:#0f172a;color:#f8fafc;border:1px solid #475569;">
            ${biomeEntries
              .map(
                (b) =>
                  `<option value="${b.biomeId}" ${state.selectedBiomeId === b.biomeId ? 'selected' : ''}>[${b.category}] ${b.name} (${b.biomeId})</option>`
              )
              .join('')}
          </select>
        </label>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-size:11px;color:#94a3b8;">${selectedBiome ? `public/${selectedBiome.src} (${selectedBiome.tileSize}px × ${selectedBiome.renderScale}x)` : ''}</span>
          ${formatProEntryBadgeHtml(ctx.proBiomeEntry)}
          <span id="ap-tileset-source-badge" style="font-size:11px;padding:2px 8px;border-radius:999px;font-weight:bold;${badgeColor(biomeSourceBadge)}">${biomeSourceBadge}</span>
        </div>
      </div>
      <canvas id="ap-preview-canvas" width="840" height="360" style="width:100%;height:auto;background:#0b1120;border:1px solid #334155;image-rendering:pixelated;"></canvas>
    </div>
  `;
}

function buildAudioTabHtml(ctx: AssetPreviewHtmlContext): string {
  const { state, assets, audio } = ctx;
  const bgmTracks = assets.manifestRegistry.audioFile.bgmTracks;
  const sfxEntries = assets.manifestRegistry.audioFile.sfxEntries;
  const currentBgmId = audio.getCurrentBgmId();
  const breakFilterOn = audio.engine.isBreakFilterActive();

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div style="background:#1e293b;padding:10px;border-radius:6px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong style="color:#fde047;">🎵 BGM 트랙 (${bgmTracks.length}종)</strong>
          <div style="display:flex;gap:6px;">
            <button id="ap-btn-break-filter" style="padding:3px 8px;font-size:11px;cursor:pointer;border:1px solid #a855f7;background:${breakFilterOn ? '#7e22ce' : '#0f172a'};color:#fff;">
              브레이크 로우패스: ${breakFilterOn ? 'ON' : 'OFF'}
            </button>
            <button id="ap-btn-stop-bgm" style="padding:3px 8px;font-size:11px;cursor:pointer;border:1px solid #ef4444;background:#7f1d1d;color:#fff;">■ 정지</button>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;max-height:320px;overflow-y:auto;">
          ${bgmTracks
            .map((t) => {
              const isPlaying = currentBgmId === t.id;
              const srcKind = audio.engine.getBgmSourceStatus(t.id);
              return `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:${isPlaying ? '#172554' : '#0f172a'};border:1px solid ${isPlaying ? '#38bdf8' : '#334155'};border-radius:4px;font-size:11px;">
                  <div>
                    <div style="font-weight:bold;color:#f8fafc;">${t.name}</div>
                    <div style="color:#94a3b8;">${t.id} · ${t.bpm} BPM · loop ${t.loopStartSec}s–${t.loopEndSec}s</div>
                  </div>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <span style="font-size:10px;padding:1px 6px;border-radius:999px;${badgeColor(srcKind)}">${srcKind}</span>
                    <button data-ap-bgm="${t.id}" style="padding:4px 8px;cursor:pointer;background:#0284c7;color:#fff;border:none;border-radius:4px;">▶ 재생</button>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>

      <div style="background:#1e293b;padding:10px;border-radius:6px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong style="color:#38bdf8;">🔊 표준 SFX (${sfxEntries.length}종)</strong>
          <button id="ap-btn-burst-sfx" style="padding:3px 8px;font-size:11px;cursor:pointer;border:1px solid #f59e0b;background:#92400e;color:#fff;">
            ⚡ 50ms 다단히트 스로틀 테스트
          </button>
        </div>
        <div id="ap-sfx-status" style="font-size:11px;color:#a7f3d0;background:#0f172a;padding:6px 8px;border-radius:4px;margin-bottom:8px;border:1px solid #334155;">
          ${state.lastSfxResultText}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;max-height:285px;overflow-y:auto;">
          ${sfxEntries
            .map((s) => {
              const srcKind = audio.engine.sfx.getSourceStatus(s.id);
              return `
                <button data-ap-sfx="${s.id}" style="text-align:left;padding:6px 8px;cursor:pointer;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:4px;font-size:11px;">
                  <div style="font-weight:bold;color:#fde047;">▶ ${s.name}</div>
                  <div style="font-size:10px;color:#94a3b8;display:flex;justify-content:space-between;margin-top:2px;">
                    <span>${s.id}</span>
                    <span>${srcKind === 'EXTERNAL_OGG' ? 'OGG' : 'SYNTH'}</span>
                  </div>
                </button>
              `;
            })
            .join('')}
        </div>
      </div>
    </div>
  `;
}

export function buildAssetPreviewHtml(ctx: AssetPreviewHtmlContext): string {
  const { state, assets } = ctx;
  const biomeEntries = assets.manifestRegistry.tilesetsFile.biomes;
  const bgmTracks = assets.manifestRegistry.audioFile.bgmTracks;
  const sfxEntries = assets.manifestRegistry.audioFile.sfxEntries;

  const bodyHtml =
    state.activeTab === 'SPRITE'
      ? buildSpriteTabHtml(ctx)
      : state.activeTab === 'TILESET'
        ? buildTilesetTabHtml(ctx)
        : state.activeTab === 'SLICER'
          ? (state.slicerBodyHtml ?? '')
          : buildAudioTabHtml(ctx);

  return `
    <div class="modal-card" style="max-width:960px;width:95%;max-height:92vh;overflow-y:auto;padding:16px;background:#0f172a;border:2px solid #38bdf8;color:#e2e8f0;font-family:monospace;">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #334155;padding-bottom:10px;margin-bottom:12px;">
        <div>
          <h2 style="margin:0;font-size:16px;color:#fde047;">🎨 AssetPreviewScene — 도트 스프라이트 · 바이옴 타일셋 · 오디오 · 슬라이서</h2>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px;">외부 에셋(public/assets/) 자동 핫스왑 & 비규격 시트 슬라이서(.recipe.json)</div>
        </div>
        <button id="btn-close-asset-preview" style="padding:6px 12px;background:#dc2626;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">✕ 닫기</button>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
        <button data-ap-tab="SPRITE" style="padding:6px 12px;cursor:pointer;border-radius:4px;font-weight:bold;border:1px solid #38bdf8;background:${state.activeTab === 'SPRITE' ? '#0284c7' : '#1e293b'};color:#fff;">
          🧍 스프라이트 & 11상태 (${assets.manifestRegistry.spritesFile.entries.length}종)
        </button>
        <button data-ap-tab="TILESET" style="padding:6px 12px;cursor:pointer;border-radius:4px;font-weight:bold;border:1px solid #38bdf8;background:${state.activeTab === 'TILESET' ? '#0284c7' : '#1e293b'};color:#fff;">
          🗺 바이옴 타일셋 (${biomeEntries.length}종)
        </button>
        <button data-ap-tab="AUDIO" style="padding:6px 12px;cursor:pointer;border-radius:4px;font-weight:bold;border:1px solid #38bdf8;background:${state.activeTab === 'AUDIO' ? '#0284c7' : '#1e293b'};color:#fff;">
          🎵 레트로 BGM(${bgmTracks.length}) · SFX(${sfxEntries.length})
        </button>
        <button data-ap-tab="SLICER" style="padding:6px 12px;cursor:pointer;border-radius:4px;font-weight:bold;border:1px solid #14b8a6;background:${state.activeTab === 'SLICER' ? '#0f766e' : '#1e293b'};color:#fff;">
          ✂ 시트 임포트 / 슬라이서
        </button>
      </div>

      ${bodyHtml}
    </div>
  `;
}
