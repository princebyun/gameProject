import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { SaveEnvelope } from '../core/save/schema';
import type { ElectronPreloadBridge } from './storage/electronFileStorageAdapter';
import {
  downloadSaveEnvelopeAsJson,
  formatSaveExportFilename
} from './storage/saveFileIO';

export interface SaveExportResult {
  exported: boolean;
  filename: string;
  jsonContent: string;
  nativePathOrUri?: string;
}

export interface SaveImportPayload {
  filename: string;
  jsonContent: string;
}

export interface FileTransferAdapter {
  exportSaveEnvelope(envelope: SaveEnvelope): Promise<SaveExportResult>;
  importSaveEnvelopeFile(): Promise<SaveImportPayload | null>;
}

function promptBrowserFileInput(accept = '.op-save.json,.json'): Promise<SaveImportPayload | null> {
  if (typeof document === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      try {
        const text = await file.text();
        resolve({
          filename: file.name,
          jsonContent: text
        });
      } catch {
        resolve(null);
      } finally {
        input.remove();
      }
    };
    document.body.appendChild(input);
    input.click();
  });
}

export class WebFileTransferAdapter implements FileTransferAdapter {
  public async exportSaveEnvelope(
    envelope: SaveEnvelope
  ): Promise<SaveExportResult> {
    const filename = formatSaveExportFilename(envelope);
    const jsonContent = downloadSaveEnvelopeAsJson(envelope);
    return {
      exported: true,
      filename,
      jsonContent
    };
  }

  public async importSaveEnvelopeFile(): Promise<SaveImportPayload | null> {
    return promptBrowserFileInput();
  }
}

export class ElectronFileTransferAdapter implements FileTransferAdapter {
  private readonly bridge: ElectronPreloadBridge;

  constructor(bridge?: ElectronPreloadBridge) {
    const resolved =
      bridge ??
      (typeof window !== 'undefined' ? window.opElectronBridge : undefined);
    if (!resolved) {
      throw new Error(
        'ElectronFileTransferAdapter requires window.opElectronBridge or an injected ElectronPreloadBridge.'
      );
    }
    this.bridge = resolved;
  }

  public async exportSaveEnvelope(
    envelope: SaveEnvelope
  ): Promise<SaveExportResult> {
    const filename = formatSaveExportFilename(envelope);
    const jsonContent = JSON.stringify(envelope, null, 2);
    const res = await this.bridge.dialogExportSave(filename, jsonContent);
    return {
      exported: res.exported,
      filename,
      jsonContent,
      nativePathOrUri: res.filePath
    };
  }

  public async importSaveEnvelopeFile(): Promise<SaveImportPayload | null> {
    return this.bridge.dialogImportSave();
  }
}

export class CapacitorFileTransferAdapter implements FileTransferAdapter {
  public async exportSaveEnvelope(
    envelope: SaveEnvelope
  ): Promise<SaveExportResult> {
    const filename = formatSaveExportFilename(envelope);
    const jsonContent = JSON.stringify(envelope, null, 2);
    try {
      const writeRes = await Filesystem.writeFile({
        path: filename,
        data: jsonContent,
        directory: Directory.Cache,
        encoding: Encoding.UTF8
      });
      await Share.share({
        title: 'One Piece Grand Voyage — 세이브 백업 (.op-save.json)',
        text: `원피스 그랜드 보야지 세이브 백업 파일 (${filename})`,
        url: writeRes.uri,
        dialogTitle: '세이브 백업 파일 공유 / 저장'
      });
      return {
        exported: true,
        filename,
        jsonContent,
        nativePathOrUri: writeRes.uri
      };
    } catch {
      // Fallback to standard download if Share is cancelled or unavailable in WebView preview
      downloadSaveEnvelopeAsJson(envelope);
      return {
        exported: true,
        filename,
        jsonContent
      };
    }
  }

  public async importSaveEnvelopeFile(): Promise<SaveImportPayload | null> {
    return promptBrowserFileInput();
  }
}
