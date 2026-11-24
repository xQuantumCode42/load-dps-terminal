import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
await build({ entryPoints: ['test/run.ts'], bundle: true, platform: 'node',
  target: 'node20', format: 'cjs', outfile: 'dist/test.cjs' });
const result = spawnSync(process.execPath, ['dist/test.cjs'], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
