import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  protocol
} from 'electron';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { AtomicNodeFileStore } from '../src/platform/storage/atomicNodeFileStore';
import type { ElectronDisplayMode } from '../src/platform/storage/electronFileStorageAdapter';
import { ALL_SAVE_SLOTS } from '../src/platform/storage/storageAdapter';

// Ensure %APPDATA%\OnePieceResonance\saves\ directory name on Windows
app.setName('OnePieceResonance');

// Register custom privileged scheme `app://resonance` before app ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

let mainWindow: BrowserWindow | null = null;
let currentDisplayMode: ElectronDisplayMode = 'windowed';
let fileStore: AtomicNodeFileStore | null = null;

function getSaveFileStore(): AtomicNodeFileStore {
  if (!fileStore) {
    const appDataRoot = app.getPath('appData');
    const savesDir = path.join(appDataRoot, 'OnePieceResonance', 'saves');
    fileStore = new AtomicNodeFileStore(savesDir);
  }
  return fileStore;
}

function getMimeType(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
    case '.webmanifest':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.ico':
      return 'image/x-icon';
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}

function registerCustomAppProtocol(): void {
  const distElectronRoot = path.resolve(__dirname, '..', '..', 'dist-electron');

  protocol.handle('app', async (request) => {
    const parsedUrl = new URL(request.url);
    let relativePath = decodeURIComponent(parsedUrl.pathname);
    if (!relativePath || relativePath === '/' || relativePath === '') {
      relativePath = '/index.html';
    }

    const safeRelative = path
      .normalize(relativePath)
      .replace(/^(\.\.(\/|\\|$))+/, '');
    const candidatePath = path.join(distElectronRoot, safeRelative);

    // Prevent directory traversal outside dist-electron
    if (!candidatePath.startsWith(distElectronRoot)) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      const data = await fs.readFile(candidatePath);
      const mimeType = getMimeType(path.extname(candidatePath));
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch {
      // SPA fallback to index.html
      try {
        const fallbackIndex = path.join(distElectronRoot, 'index.html');
        const indexData = await fs.readFile(fallbackIndex);
        return new Response(indexData, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      } catch {
        return new Response('Not Found', { status: 404 });
      }
    }
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle('save:read', async (_event, key: string) => {
    return getSaveFileStore().readRaw(key);
  });

  ipcMain.handle(
    'save:write',
    async (_event, key: string, jsonContent: string) => {
      await getSaveFileStore().writeRawAtomically(key, jsonContent);
      return true;
    }
  );

  ipcMain.handle('save:list', async () => {
    return getSaveFileStore().listSlots(ALL_SAVE_SLOTS);
  });

  ipcMain.handle('save:delete', async (_event, key: string) => {
    return getSaveFileStore().deleteKey(key);
  });

  ipcMain.handle(
    'dialog:exportSave',
    async (_event, defaultFilename: string, jsonContent: string) => {
      if (!mainWindow) {
        return { exported: false };
      }
      const res = await dialog.showSaveDialog(mainWindow, {
        title: '원피스 그랜드 보야지 — 세이브 백업 내보내기 (.op-save.json)',
        defaultPath: defaultFilename,
        filters: [
          {
            name: 'One Piece Save Backup (*.op-save.json)',
            extensions: ['op-save.json', 'json']
          }
        ]
      });
      if (res.canceled || !res.filePath) {
        return { exported: false };
      }
      await AtomicNodeFileStore.writeExplicitPathAtomically(
        res.filePath,
        jsonContent
      );
      return { exported: true, filePath: res.filePath };
    }
  );

  ipcMain.handle('dialog:importSave', async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      title: '원피스 그랜드 보야지 — 세이브 백업 불러오기 (.op-save.json)',
      properties: ['openFile'],
      filters: [
        {
          name: 'One Piece Save Backup (*.op-save.json)',
          extensions: ['op-save.json', 'json']
        }
      ]
    });
    if (res.canceled || res.filePaths.length === 0) {
      return null;
    }
    const chosenPath = res.filePaths[0];
    const jsonContent = await fs.readFile(chosenPath, { encoding: 'utf-8' });
    return {
      filename: path.basename(chosenPath),
      jsonContent
    };
  });

  ipcMain.handle(
    'window:setDisplayMode',
    (_event, mode: ElectronDisplayMode): ElectronDisplayMode => {
      if (!mainWindow) return currentDisplayMode;
      currentDisplayMode = mode;
      if (mode === 'fullscreen') {
        mainWindow.setFullScreen(true);
      } else if (mode === 'borderless') {
        mainWindow.setFullScreen(false);
        mainWindow.setMenuBarVisibility(false);
        mainWindow.maximize();
      } else {
        mainWindow.setFullScreen(false);
        if (mainWindow.isMaximized()) {
          mainWindow.unmaximize();
        }
        mainWindow.setSize(1280, 720, true);
        mainWindow.center();
      }
      return currentDisplayMode;
    }
  );

  ipcMain.handle('window:getDisplayMode', (): ElectronDisplayMode => {
    if (mainWindow?.isFullScreen()) {
      return 'fullscreen';
    }
    return currentDisplayMode;
  });

  ipcMain.handle('window:quit', () => {
    app.quit();
  });
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title: 'One Piece Grand Voyage — 2D Pixel Action RPG',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  void mainWindow.loadURL('app://resonance/index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  void app.whenReady().then(() => {
    registerCustomAppProtocol();
    registerIpcHandlers();
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
