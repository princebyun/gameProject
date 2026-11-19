import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BATTLE_CALC_VERSION, FIXED_DT } from '../../src/core/constants';

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (full.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

describe('Pure Simulation Core Architecture Audit', () => {
  it('exposes deterministic BATTLE_CALC_VERSION and FIXED_DT = 1/60', () => {
    expect(BATTLE_CALC_VERSION).toBe('0.6.0');
    expect(FIXED_DT).toBeCloseTo(1 / 60, 8);
  });

  it('contains zero references to DOM, Window, Canvas, or Browser globals in src/core/', () => {
    const coreDir = join(process.cwd(), 'src', 'core');
    const files = collectTsFiles(coreDir);
    expect(files.length).toBeGreaterThan(5);

    const forbiddenPatterns = [
      /\bwindow\b/,
      /\bdocument\b/,
      /\bHTMLElement\b/,
      /\bHTMLCanvasElement\b/,
      /\bCanvasRenderingContext2D\b/,
      /\blocalStorage\b/,
      /\bindexedDB\b/,
      /\bIDBDatabase\b/,
      /\bWebSocket\b/,
      /\bnavigator\b/,
      /\brequestAnimationFrame\b/
    ];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of forbiddenPatterns) {
        expect(
          pattern.test(source),
          `Forbidden DOM/Browser global matching ${pattern} found in ${file}`
        ).toBe(false);
      }
    }
  });
});
