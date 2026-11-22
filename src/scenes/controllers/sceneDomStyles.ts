const SCENE_STYLE_ELEMENT_ID = 'opgv-scene-manager-styles';

export const SCENE_MANAGER_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 100dvw;
    height: 100dvh;
    background: #070b12;
    color: #e2e8f0;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    overflow: hidden;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    overscroll-behavior: none;
  }
  #app {
    position: relative;
    width: 100dvw;
    height: 100dvh;
    overflow: hidden;
  }
  .hud-drawer-toggle-btn {
    position: fixed;
    top: calc(env(safe-area-inset-top, 0px) + 6px);
    right: calc(env(safe-area-inset-right, 0px) + 6px);
    z-index: 65;
    background: rgba(15, 23, 42, 0.86);
    color: #fde047;
    border: 1.5px solid #38bdf8;
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 12px;
    font-weight: 700;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
  }
  .top-bar {
    position: fixed;
    top: calc(env(safe-area-inset-top, 0px) + 40px);
    left: calc(env(safe-area-inset-left, 0px) + 8px);
    right: calc(env(safe-area-inset-right, 0px) + 8px);
    z-index: 60;
    display: none;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 8px 10px;
    background: rgba(15, 23, 42, 0.94);
    border: 1.5px solid #38bdf8;
    border-radius: 8px;
    font-size: 12px;
    max-height: 44dvh;
    overflow-y: auto;
    touch-action: pan-y;
  }
  .top-bar.open {
    display: flex;
  }
  .top-bar-group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .brand-title {
    font-weight: 700;
    color: #facc15;
    letter-spacing: 0.4px;
    margin-right: 4px;
  }
  .net-badge {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    background: #064e3b;
    color: #6ee7b7;
    border: 1px solid #10b981;
  }
  .net-badge.offline {
    background: #78350f;
    color: #fcd34d;
    border-color: #f59e0b;
  }
  select, button, input, textarea {
    background: #1e293b;
    color: #f8fafc;
    border: 1px solid #334155;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 12px;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  button:hover:not(:disabled) {
    background: #334155;
    border-color: #38bdf8;
  }
  .btn-tab-active {
    background: #0284c7;
    border-color: #38bdf8;
    font-weight: 700;
  }
  .btn-showcase {
    background: #1e1b4b;
    border-color: #818cf8;
    color: #e0e7ff;
    font-size: 11px;
  }
  .btn-danger {
    background: #7f1d1d;
    border-color: #ef4444;
    color: #fecaca;
  }
  .workspace-main {
    position: fixed;
    inset: 0;
    width: 100dvw;
    height: 100dvh;
    overflow: hidden;
  }
  .canvas-stage-col {
    position: fixed;
    inset: 0;
    width: 100dvw;
    height: 100dvh;
    overflow: hidden;
  }
  .canvas-wrapper {
    position: fixed;
    inset: 0;
    width: 100dvw;
    height: 100dvh;
    border: none;
    border-radius: 0;
    overflow: hidden;
    background: #070b12;
  }
  .canvas-wrapper canvas {
    width: 100%;
    height: 100%;
    display: block;
    image-rendering: pixelated;
    touch-action: none;
    user-select: none;
  }
  .showcase-bar {
    position: fixed;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 6px);
    left: calc(env(safe-area-inset-left, 0px) + 8px);
    right: calc(env(safe-area-inset-right, 0px) + 8px);
    z-index: 58;
    display: none;
    flex-wrap: wrap;
    gap: 5px;
    padding: 6px;
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.92);
    border: 1px solid #334155;
    justify-content: center;
  }
  .showcase-bar.open {
    display: flex;
  }
  .mobile-gamepad-dock {
    display: none !important;
  }
  .side-drawer {
    position: fixed;
    top: calc(env(safe-area-inset-top, 0px) + 40px);
    right: calc(env(safe-area-inset-right, 0px) + 8px);
    bottom: calc(env(safe-area-inset-bottom, 0px) + 46px);
    width: min(350px, 86dvw);
    z-index: 59;
    display: none;
    background: rgba(15, 23, 42, 0.96);
    border: 1.5px solid #38bdf8;
    border-radius: 8px;
    padding: 10px;
    font-size: 12px;
    overflow-y: auto;
    touch-action: pan-y;
    flex-direction: column;
    gap: 8px;
  }
  .side-drawer.open {
    display: flex;
  }
  .config-card {
    background: #162032;
    border: 1px solid #26354d;
    border-radius: 5px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .config-card h4 {
    font-size: 12px;
    color: #38bdf8;
    margin-bottom: 2px;
  }
  .field-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .field-row label {
    color: #94a3b8;
    font-size: 11px;
  }
  .combat-log-box {
    height: 115px;
    overflow-y: auto;
    background: #090d16;
    border: 1px solid #1e293b;
    border-radius: 4px;
    padding: 6px;
    font-family: monospace;
    font-size: 11px;
    color: #cbd5e1;
  }
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.78);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 12px;
  }
  .modal-backdrop.open {
    display: flex;
  }
  .modal-box {
    background: #0f172a;
    border: 1px solid #38bdf8;
    border-radius: 8px;
    padding: 16px;
    width: 100%;
    max-width: 600px;
    max-height: 90vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .slot-card {
    background: #162032;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .drop-zone {
    border: 2px dashed #38bdf8;
    border-radius: 6px;
    padding: 12px;
    text-align: center;
    background: rgba(2, 132, 199, 0.10);
    font-size: 11px;
    color: #bae6fd;
  }
  .ios-install-banner {
    display: none;
    background: #1e1b4b;
    border-top: 1px solid #818cf8;
    padding: 6px 12px;
    font-size: 11px;
    color: #e0e7ff;
    align-items: center;
    justify-content: space-between;
  }
  .endgame-modal-box {
    max-width: 740px;
    width: 94vw;
    max-height: 88vh;
    overflow-y: auto;
  }
  .endgame-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 10px;
  }
  .endgame-mode-card {
    background: #0f172a;
    border: 1.5px solid #334155;
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .impel-draft-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .impel-draft-card {
    background: #0f172a;
    border: 1.5px solid #64748b;
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
  }
  @media (max-width: 600px) {
    .mobile-gamepad-dock {
      display: flex;
    }
    .side-drawer {
      max-width: 100%;
    }
    .endgame-modal-box {
      width: 96vw;
      padding: 10px;
    }
    .impel-draft-grid {
      grid-template-columns: 1fr;
    }
  }
`;

export function injectSceneManagerStyles(doc: Document): void {
  if (doc.getElementById(SCENE_STYLE_ELEMENT_ID)) return;
  const style = doc.createElement('style');
  style.id = SCENE_STYLE_ELEMENT_ID;
  style.textContent = SCENE_MANAGER_CSS;
  doc.head.appendChild(style);
}
