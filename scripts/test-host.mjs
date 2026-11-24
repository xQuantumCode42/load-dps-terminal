import { build } from 'esbuild';
import { runTests } from '@vscode/test-electron';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

await import('./build.mjs');
await build({ entryPoints: ['test/host.ts'], bundle: true, platform: 'node', target: 'node20',
  format: 'cjs', external: ['vscode'], outfile: 'dist/host.cjs' });
const root = resolve('.');
// Codex and some Electron launchers export this; the test process must be a GUI app.
delete process.env.ELECTRON_RUN_AS_NODE;
const profile = resolve('.test-profile', randomUUID());
const fixtureWorkspace = resolve('.test-workspace', randomUUID());
mkdirSync(profile, { recursive: true });
mkdirSync(resolve(profile, 'User'), { recursive: true });
// Seed only the isolated profile, never the daily user's terminal defaults.
writeFileSync(resolve(profile, 'User/settings.json'), JSON.stringify({
  // Same cwd for both test folders avoids the native multi-root cwd picker.
  'terminal.integrated.cwd': resolve(fixtureWorkspace, 'a'),
  'terminal.integrated.defaultProfile.windows': 'Windows PowerShell',
  'terminal.integrated.profiles.windows': {
    'Windows PowerShell': { path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' },
  },
}));
mkdirSync('.test-extensions', { recursive: true });
mkdirSync(resolve(fixtureWorkspace, 'a'), { recursive: true });
mkdirSync(resolve(fixtureWorkspace, 'b'), { recursive: true });
writeFileSync(resolve(fixtureWorkspace, 'a/one.txt'), 'one');
writeFileSync(resolve(fixtureWorkspace, 'a/two.txt'), 'two');
writeFileSync(resolve(fixtureWorkspace, 'b/other.txt'), 'other');
writeFileSync(resolve(fixtureWorkspace, 'test.code-workspace'), JSON.stringify({ folders: [{ path: 'a' }, { path: 'b' }] }));
await runTests({
  version: '1.93.1', vscodeExecutablePath: process.env.VSCODE_EXECUTABLE,
  extensionDevelopmentPath: root, extensionTestsPath: resolve('dist/host.cjs'),
  extensionTestsEnv: { LD_TEST_PROFILE: profile },
  launchArgs: [
  '--disable-gpu', '--skip-welcome', '--skip-release-notes', '--disable-updates',
  '--disable-extensions', '--disable-workspace-trust',
  `--user-data-dir=${profile}`, `--extensions-dir=${resolve('.test-extensions')}`,
  resolve(fixtureWorkspace, 'test.code-workspace'),
  ],
});
