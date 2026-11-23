export function validateProManifest(rootDir?: string): Promise<{
  errors: string[];
  manifest: unknown | null;
}>;
export function verifyManifestEntries(
  rootDir: string,
  targetIds: string[]
): Promise<string[]>;
export function syncProManifestFiles(rootDir?: string): Promise<unknown>;
export function printStatusReport(manifest: unknown): void;
