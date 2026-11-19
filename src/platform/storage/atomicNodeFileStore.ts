import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export interface AtomicWriteResult {
  filePath: string;
  tempPathUsed: string;
}

export function sanitizeStorageFileKey(rawKey: string): string {
  const cleaned = rawKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!cleaned || cleaned.length === 0) {
    throw new Error(`Invalid storage key: "${rawKey}"`);
  }
  return cleaned;
}

/**
 * Node.js Atomic JSON file store used by the Electron Main Process
 * (%APPDATA%\OnePieceResonance\saves\) and Vitest verification suites.
 *
 * Guarantees crash-safe persistence by writing to a sibling `.tmp` file first
 * and performing an atomic `fs.rename` swap over the target `.json` file.
 */
export class AtomicNodeFileStore {
  private readonly baseDir: string;
  private writeCounter = 0;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
  }

  public getBaseDir(): string {
    return this.baseDir;
  }

  public resolveKeyFilePath(key: string): string {
    const safeKey = sanitizeStorageFileKey(key);
    return path.join(this.baseDir, `${safeKey}.json`);
  }

  public async ensureDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  /**
   * Atomically writes `jsonContent` to `<baseDir>/<key>.json` by first writing
   * to `<baseDir>/<key>.json.tmp.<pid>.<counter>` and then calling `fs.rename`.
   */
  public async writeRawAtomically(
    key: string,
    jsonContent: string
  ): Promise<AtomicWriteResult> {
    await this.ensureDir();
    const targetPath = this.resolveKeyFilePath(key);
    this.writeCounter += 1;
    const tempPath = `${targetPath}.tmp.${process.pid}.${Date.now()}_${this.writeCounter}`;

    try {
      await fs.writeFile(tempPath, jsonContent, { encoding: 'utf-8' });
      await fs.rename(tempPath, targetPath);
      return {
        filePath: targetPath,
        tempPathUsed: tempPath
      };
    } catch (err) {
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup failure if temp file was never created
      }
      throw err;
    }
  }

  /**
   * Atomically writes arbitrary UTF-8 content to an explicit absolute file path
   * (used by Electron native Save Dialog export).
   */
  public static async writeExplicitPathAtomically(
    absoluteFilePath: string,
    utf8Content: string
  ): Promise<AtomicWriteResult> {
    const resolved = path.resolve(absoluteFilePath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    const tempPath = `${resolved}.tmp.${process.pid}.${Date.now()}`;
    try {
      await fs.writeFile(tempPath, utf8Content, { encoding: 'utf-8' });
      await fs.rename(tempPath, resolved);
      return {
        filePath: resolved,
        tempPathUsed: tempPath
      };
    } catch (err) {
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore
      }
      throw err;
    }
  }

  public async readRaw(key: string): Promise<string | null> {
    const targetPath = this.resolveKeyFilePath(key);
    try {
      const content = await fs.readFile(targetPath, { encoding: 'utf-8' });
      return content;
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === 'ENOENT'
      ) {
        return null;
      }
      throw err;
    }
  }

  public async deleteKey(key: string): Promise<boolean> {
    const targetPath = this.resolveKeyFilePath(key);
    try {
      await fs.unlink(targetPath);
      return true;
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === 'ENOENT'
      ) {
        return false;
      }
      throw err;
    }
  }

  public async listSlots(slotKeys: readonly string[]): Promise<Record<string, string | null>> {
    const out: Record<string, string | null> = {};
    for (const key of slotKeys) {
      out[key] = await this.readRaw(key);
    }
    return out;
  }
}
