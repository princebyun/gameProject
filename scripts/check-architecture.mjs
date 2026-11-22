import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SRC_ROOT = path.join(ROOT, 'src');

function walkTsFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsFiles(full, out);
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

const toRel = (absPath) => path.relative(ROOT, absPath).split(path.sep).join('/');
const layerOf = (relPath) => relPath.split('/')[1] || 'root';

const FORBIDDEN_CORE_GLOBALS = new Set([
  'window',
  'document',
  'HTMLElement',
  'HTMLCanvasElement',
  'CanvasRenderingContext2D',
  'AudioContext',
  'WebSocket',
  'localStorage',
  'indexedDB',
  'IDBDatabase',
  'navigator',
  'requestAnimationFrame',
  'cancelAnimationFrame'
]);

const FORBIDDEN_CORE_LAYERS = new Set([
  'render',
  'scenes',
  'audio',
  'assets',
  'input',
  'platform',
  'story'
]);

function resolveRelativeImport(fromAbsPath, specifier, knownFilesSet) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromAbsPath), specifier);
  const candidates = [
    base + '.ts',
    base + '.tsx',
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    base
  ];
  for (const cand of candidates) {
    const rel = toRel(cand);
    if (knownFilesSet.has(rel)) {
      return rel;
    }
  }
  return null;
}

function findAllCycles(graph) {
  const visited = new Set();
  const onStack = new Set();
  const stack = [];
  const cycles = [];
  const seenKeys = new Set();

  function dfs(node) {
    visited.add(node);
    onStack.add(node);
    stack.push(node);

    for (const next of graph.get(node) || []) {
      if (!visited.has(next)) {
        dfs(next);
      } else if (onStack.has(next)) {
        const idx = stack.indexOf(next);
        const cycle = stack.slice(idx).concat(next);
        const canonical = [...cycle.slice(0, -1)].sort().join('|');
        if (!seenKeys.has(canonical)) {
          seenKeys.add(canonical);
          cycles.push(cycle);
        }
      }
    }

    stack.pop();
    onStack.delete(node);
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }
  return cycles;
}

function main() {
  const files = walkTsFiles(SRC_ROOT).sort();
  const relFiles = files.map(toRel);
  const knownFilesSet = new Set(relFiles);

  const importGraph = new Map();
  const layerViolations = [];
  const coreDomViolations = [];
  const anyUsages = [];
  const tsSuppressions = [];
  const shadowBlurUsages = [];

  for (const absPath of files) {
    const relPath = toRel(absPath);
    const fromLayer = layerOf(relPath);
    const content = fs.readFileSync(absPath, 'utf-8');
    const sf = ts.createSourceFile(absPath, content, ts.ScriptTarget.Latest, true);
    const deps = new Set();

    // Check TS suppression directives in comments
    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      const m = line.match(/@ts-(ignore|expect-error|nocheck)\b/);
      if (m) {
        tsSuppressions.push(`${relPath}:${idx + 1}: ${m[0]}`);
      }
    });

    const visit = (node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const spec = node.moduleSpecifier.text;
        const target = resolveRelativeImport(absPath, spec, knownFilesSet);
        if (target) {
          deps.add(target);
        } else if (spec.endsWith('.json') && fromLayer !== 'data') {
          layerViolations.push({
            from: relPath,
            to: spec,
            rule: `${fromLayer} cannot import JSON directly outside src/data/`
          });
        }
      } else if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const spec = node.moduleSpecifier.text;
        const target = resolveRelativeImport(absPath, spec, knownFilesSet);
        if (target) {
          deps.add(target);
        }
      } else if (node.kind === ts.SyntaxKind.AnyKeyword) {
        const lc = sf.getLineAndCharacterOfPosition(node.getStart());
        anyUsages.push(`${relPath}:${lc.line + 1}`);
      } else if (
        (fromLayer === 'render' || fromLayer === 'scenes') &&
        ts.isPropertyAccessExpression(node) &&
        node.name.text === 'shadowBlur'
      ) {
        const lc = sf.getLineAndCharacterOfPosition(node.getStart());
        shadowBlurUsages.push(`${relPath}:${lc.line + 1}`);
      } else if (fromLayer === 'core' && ts.isIdentifier(node)) {
        const idText = node.text;
        if (FORBIDDEN_CORE_GLOBALS.has(idText)) {
          // Ignore property names like `obj.document` or parameter/interface field declarations unless standalone global access
          const parent = node.parent;
          const isPropertyAccessTarget =
            parent && ts.isPropertyAccessExpression(parent) && parent.name === node;
          const isPropertyDeclName =
            parent &&
            (ts.isPropertySignature(parent) ||
              ts.isPropertyDeclaration(parent) ||
              ts.isPropertyAssignment(parent)) &&
            parent.name === node;
          if (!isPropertyAccessTarget && !isPropertyDeclName) {
            const lc = sf.getLineAndCharacterOfPosition(node.getStart());
            coreDomViolations.push(`${relPath}:${lc.line + 1} (${idText})`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sf);
    importGraph.set(relPath, [...deps]);

    for (const dep of deps) {
      const toLayer = layerOf(dep);
      if (fromLayer === 'data' && toLayer !== 'data') {
        layerViolations.push({
          from: relPath,
          to: dep,
          rule: `data -> ${toLayer} forbidden`
        });
      }
      if (fromLayer === 'core' && FORBIDDEN_CORE_LAYERS.has(toLayer)) {
        layerViolations.push({
          from: relPath,
          to: dep,
          rule: `core -> ${toLayer} forbidden`
        });
      }
      if (
        (fromLayer === 'render' || fromLayer === 'audio' || fromLayer === 'assets') &&
        toLayer === 'scenes'
      ) {
        layerViolations.push({
          from: relPath,
          to: dep,
          rule: `${fromLayer} -> scenes forbidden`
        });
      }
    }
  }

  const cycles = findAllCycles(importGraph);

  const totalErrors =
    cycles.length +
    layerViolations.length +
    coreDomViolations.length +
    anyUsages.length +
    tsSuppressions.length +
    shadowBlurUsages.length;

  if (totalErrors > 0) {
    console.error(`\n❌ Architecture & Strict Quality Check FAILED (${totalErrors} issue(s)):\n`);
    if (cycles.length > 0) {
      console.error(`  [Circular Dependencies: ${cycles.length}]`);
      for (const c of cycles) console.error(`    - ${c.join(' -> ')}`);
    }
    if (layerViolations.length > 0) {
      console.error(`  [Layer Boundary Violations: ${layerViolations.length}]`);
      for (const v of layerViolations) {
        console.error(`    - (${v.rule}) ${v.from} -> ${v.to}`);
      }
    }
    if (coreDomViolations.length > 0) {
      console.error(`  [Forbidden DOM/Browser Globals in src/core/: ${coreDomViolations.length}]`);
      for (const g of coreDomViolations) console.error(`    - ${g}`);
    }
    if (anyUsages.length > 0) {
      console.error(`  [Forbidden 'any' Keyword in src/: ${anyUsages.length}]`);
      for (const a of anyUsages) console.error(`    - ${a}`);
    }
    if (tsSuppressions.length > 0) {
      console.error(`  [Forbidden @ts-ignore/@ts-expect-error in src/: ${tsSuppressions.length}]`);
      for (const s of tsSuppressions) console.error(`    - ${s}`);
    }
    if (shadowBlurUsages.length > 0) {
      console.error(`  [Forbidden ctx.shadowBlur in render/scenes: ${shadowBlurUsages.length}]`);
      for (const sb of shadowBlurUsages) console.error(`    - ${sb}`);
    }
    process.exit(1);
  }

  console.log('✅ Architecture & Strict Quality Check PASSED (0 issues)!');
  console.log(`   • Scanned TS files in src/: ${relFiles.length}`);
  console.log('   • Circular dependencies: 0 | Layer boundary violations: 0');
  console.log('   • DOM/Browser globals in src/core/: 0 | any / @ts-ignore in src/: 0 | shadowBlur in render/scenes: 0');
}

main();
