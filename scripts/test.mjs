import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
await build({ entryPoints: ['test/run.ts'], bundle: true, platform: 'node',
  target: 'node20', format: 'cjs', outfile: 'dist/test.cjs' });
const result = spawnSync(process.execPath, ['dist/test.cjs'], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
if (process.platform === 'win32' && process.exitCode === 0) {
  const verification = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'test/verify-demo.ps1'], { stdio: 'inherit' });
  if (verification.error) throw verification.error;
  process.exitCode = verification.status ?? 1;
}
