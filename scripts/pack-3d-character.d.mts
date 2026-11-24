export interface ParsedPack3dArgs {
  unit: string;
  inputDir: string;
  outputPath: string;
  rotateY180: boolean;
  maxTexSize: number;
  dryRun: boolean;
}

export function parsePack3dArgs(argv: string[], rootDir?: string): ParsedPack3dArgs;
export function buildBlenderCommandArgs(
  parsed: ParsedPack3dArgs,
  scriptPath: string
): string[];
export function findBlenderExecutable(options?: {
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  existsFn?: (p: string) => boolean;
  readdirFn?: (p: string) => string[];
  probeCommandFn?: (cmd: string) => boolean;
}): string | null;
export function formatMissingBlenderMessage(
  parsed: ParsedPack3dArgs,
  blenderArgs: string[]
): string;
export function runPack3dCharacter(
  argv?: string[],
  deps?: {
    rootDir?: string;
    findBlender?: () => string | null;
  }
): {
  ok: boolean;
  reason: string;
  parsed: ParsedPack3dArgs;
  blenderBin?: string;
  blenderArgs: string[];
  message: string;
};
