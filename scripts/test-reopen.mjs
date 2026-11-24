import { build } from 'esbuild';
import { runTests } from '@vscode/test-electron';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

await import('./build.mjs');
await build({ entryPoints: ['test/reopen.ts'], bundle: true, platform: 'node', target: 'node20', format: 'cjs', external: ['vscode'], outfile: 'dist/reopen.cjs' });
delete process.env.ELECTRON_RUN_AS_NODE;
const profile = resolve('.test-profile', randomUUID());
mkdirSync(resolve(profile, 'User'), { recursive: true });
const settingsFile = resolve(profile, 'User/settings.json');
writeFileSync(settingsFile, JSON.stringify({ 'terminal.integrated.defaultProfile.windows': 'Command Prompt' }));
for (const phase of ['seed', 'verify']) {
  // All post-seed setting changes use VS Code's configuration API inside the
  // first host, so cached application settings and disk agree on the next boot.
  await runTests({ version: '1.93.1', vscodeExecutablePath: process.env.VSCODE_EXECUTABLE,
    extensionDevelopmentPath: resolve('.'), extensionTestsPath: resolve('dist/reopen.cjs'),
    extensionTestsEnv: { LD_REOPEN_PHASE: phase, LD_TEST_PROFILE: profile },
    launchArgs: ['--disable-gpu', '--skip-welcome', '--skip-release-notes', '--disable-extensions', '--disable-workspace-trust',
      `--user-data-dir=${profile}`, `--extensions-dir=${resolve('.test-extensions')}`],
  });
}
