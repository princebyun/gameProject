import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const BUNDLE_FILES = [
  'AGENTS.md',
  'HANDOFF.md',
  'README.md',
  'package.json',
  'src/core/constants.ts',
  'src/data/assets/types.ts',
  'src/render/sprite/rig/rigTypes.ts'
];

function main() {
  const sections = [
    '# AI_BUNDLE.md — One Piece Grand Voyage Handoff Context Bundle',
    '',
    `Generated at: ${new Date().toISOString()}`,
    ''
  ];

  for (const relPath of BUNDLE_FILES) {
    const absPath = path.join(ROOT, relPath);
    if (!fs.existsSync(absPath)) continue;
    const ext = path.extname(relPath).replace('.', '') || 'text';
    const content = fs.readFileSync(absPath, 'utf-8');
    sections.push(`## File: \`${relPath}\``);
    sections.push(`\`\`\`${ext}`);
    sections.push(content.trimEnd());
    sections.push('```');
    sections.push('');
  }

  const outPath = path.join(ROOT, 'AI_BUNDLE.md');
  fs.writeFileSync(outPath, sections.join('\n'), 'utf-8');
  console.log(`✅ Generated AI_BUNDLE.md (${BUNDLE_FILES.length} core files bundled)`);
}

main();
