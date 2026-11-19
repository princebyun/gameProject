import { contextBridge, ipcRenderer } from 'electron';
import type {
  ElectronDisplayMode,
  ElectronPreloadBridge
} from '../src/platform/storage/electronFileStorageAdapter';

const WHITELISTED_CHANNELS = {
  SAVE_READ: 'save:read',
  SAVE_WRITE: 'save:write',
  SAVE_LIST: 'save:list',
  SAVE_DELETE: 'save:delete',
  DIALOG_EXPORT_SAVE: 'dialog:exportSave',
  DIALOG_IMPORT_SAVE: 'dialog:importSave',
  WINDOW_SET_DISPLAY_MODE: 'window:setDisplayMode',
  WINDOW_GET_DISPLAY_MODE: 'window:getDisplayMode',
  WINDOW_QUIT: 'window:quit'
} as const;

const preloadBridge: ElectronPreloadBridge = {
  isElectron: true,
  saveRead(key: string): Promise<string | null> {
    return ipcRenderer.invoke(WHITELISTED_CHANNELS.SAVE_READ, key);
  },
  saveWrite(key: string, jsonContent: string): Promise<boolean> {
    return ipcRenderer.invoke(WHITELISTED_CHANNELS.SAVE_WRITE, key, jsonContent);
  },
  saveList(): Promise<Record<string, string | null>> {
    return ipcRenderer.invoke(WHITELISTED_CHANNELS.SAVE_LIST);
  },
  saveDelete(key: string): Promise<boolean> {
    return ipcRenderer.invoke(WHITELISTED_CHANNELS.SAVE_DELETE, key);
  },
  dialogExportSave(
    defaultFilename: string,
    jsonContent: string
  ): Promise<{ exported: boolean; filePath?: string }> {
    return ipcRenderer.invoke(
      WHITELISTED_CHANNELS.DIALOG_EXPORT_SAVE,
      defaultFilename,
      jsonContent
    );
  },
  dialogImportSave(): Promise<{ filename: string; jsonContent: string } | null> {
    return ipcRenderer.invoke(WHITELISTED_CHANNELS.DIALOG_IMPORT_SAVE);
  },
  windowSetDisplayMode(mode: ElectronDisplayMode): Promise<ElectronDisplayMode> {
    return ipcRenderer.invoke(WHITELISTED_CHANNELS.WINDOW_SET_DISPLAY_MODE, mode);
  },
  windowGetDisplayMode(): Promise<ElectronDisplayMode> {
    return ipcRenderer.invoke(WHITELISTED_CHANNELS.WINDOW_GET_DISPLAY_MODE);
  },
  windowQuit(): Promise<void> {
    return ipcRenderer.invoke(WHITELISTED_CHANNELS.WINDOW_QUIT);
  }
};

contextBridge.exposeInMainWorld('opElectronBridge', preloadBridge);
