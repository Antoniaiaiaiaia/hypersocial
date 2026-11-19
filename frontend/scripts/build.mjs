// Builds each MV3 entry as a self-contained IIFE (content scripts cannot be ES modules).
import { build } from 'vite';
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'dist');
rmSync(out, { recursive: true, force: true });

const entries = { 'main-world': 'src/main-world.ts', content: 'src/content/index.ts', background: 'src/background.ts', popup: 'src/popup.ts' };
for (const [name, file] of Object.entries(entries)) {
  await build({
    root, configFile: false, logLevel: 'warn', publicDir: false,
    build: {
      outDir: out, emptyOutDir: false, minify: false, target: 'chrome120',
      lib: { entry: resolve(root, file), formats: ['iife'], name: `hs_${name.replace('-', '_')}`, fileName: () => `${name}.js` },
    },
  });
}
cpSync(resolve(root, 'public'), out, { recursive: true });
console.log('built', out);
