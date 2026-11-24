import { build } from 'esbuild';
await build({ entryPoints: ['src/extension.ts'], bundle: true, platform: 'node',
  target: 'node20', format: 'cjs', external: ['vscode'], outfile: 'dist/extension.cjs', sourcemap: true });
