import assert from 'node:assert/strict';
import { detectInstall, shouldRefresh } from '../src/core';
import { shellTests } from './shell';
import { detectDefaultShell } from '../src/profiles';
import { statusLabel, StatusState } from '../src/status';

let passed = 0;
const failures: string[] = [];
export function test(name: string, run: () => void) {
  try { run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}`, error); }
}

for (const [line, expected] of [
  ['winget install --id Git.Git', 'winget'], ['choco upgrade git -y', 'choco'],
  ['npm install -g typescript', 'npm'], ['npm i', 'npm'], ['pnpm add -g pnpm', 'pnpm'],
  ['yarn global add typescript', 'yarn'], ['python -m pip install black', 'pip'],
  ['py -3 -m pip install black', 'pip'], ['sudo apt-get install jq', 'apt-get'],
  ['uv tool install ruff', 'uv'], ['cargo install ripgrep', 'cargo'],
  ['dotnet tool install --global dotnet-ef', 'dotnet'],
  ['"C:\\Program Files\\nodejs\\npm.cmd" install -g foo', 'npm'],
  ['npm run install', undefined], ['echo npm install foo', undefined],
  ['git status', undefined], ['npm install foo && echo ok', undefined],
  ['npm install "a;b"', 'npm'], ['$(echo npm) install x', undefined],
  ['pip list', undefined], ['apt update', undefined], ['winget search git', undefined],
] as const) test(`recognize ${line}`, () => assert.equal(detectInstall(line), expected));

test('refresh only successful enabled recognized executions', () => {
  assert.equal(shouldRefresh('npm install', 0, true), true);
  assert.equal(shouldRefresh('npm install', 1, true), false);
  assert.equal(shouldRefresh('npm install', undefined, true), false);
  assert.equal(shouldRefresh('npm install', 0, false), false);
  assert.equal(shouldRefresh('npm run build', 0, true), false);
});

for (const [title, shellPath, custom, expected] of [
  ['Windows PowerShell', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', undefined, 'powershell'],
  ['PowerShell', 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', undefined, 'pwsh'],
  ['Command Prompt', 'C:\\Windows\\System32\\cmd.exe', undefined, 'cmd'],
  ['Ubuntu (WSL)', 'C:\\Windows\\System32\\wsl.exe', undefined, undefined],
  [null, '/bin/bash', undefined, 'bash'],
  ['Git Bash', 'C:\\Program Files\\Git\\bin\\bash.exe', undefined, undefined],
  ['custom', '/bin/bash', { path: '/opt/custom-shell' }, undefined],
  ['custom', 'C:\\Windows\\System32\\cmd.exe', { path: 'cmd.exe', args: ['/k', 'special.cmd'] }, undefined],
  ['custom', 'C:\\Windows\\System32\\cmd.exe', { path: 'cmd.exe', env: { CUSTOM: 'value' } }, undefined],
  ['custom', '/bin/bash', { path: ['/bin/bash', '/bin/sh'] }, undefined],
  ['custom', '/bin/bash', { path: '/bin/bash', args: [] }, 'bash'],
  ['Command Prompt', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', undefined, 'cmd'],
  ['Ubuntu (WSL)', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', undefined, undefined],
  ['WSL', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', undefined, 'wsl'],
  ['PowerShell', 'C:\\Windows\\System32\\cmd.exe', { source: 'PowerShell' }, 'powershell'],
  ['Command Prompt', 'C:\\Windows\\System32\\cmd.exe', { path: ['${env:windir}\\Sysnative\\cmd.exe', '${env:windir}\\System32\\cmd.exe'], args: [], icon: 'terminal-cmd' }, 'cmd'],
] as const) test(`default profile policy: ${title} ${JSON.stringify(custom ?? '')}`, () => assert.equal(detectDefaultShell(title, shellPath, custom), expected));

const statusBase: StatusState = { settingUp: false, defaultActive: true, autoDefault: true, refreshEnabled: true, activeTerminal: false };
for (const [name, change, expected] of [
  ['configuration in progress', { settingUp: true }, 'setting up'],
  ['initialized history but current native default', { defaultActive: false }, 'not enabled'],
  ['old native terminal with a ready default for new terminals', { activeTerminal: true }, 'unhooked'],
  ['shell not yet confirmed by its readiness marker', { activeTerminal: true, session: { shell: 'cmd', confirmed: false } }, 'loading'],
  ['shell bootstrap did not produce a readiness marker', { activeTerminal: true, session: { shell: 'cmd', confirmed: false, failed: true } }, 'error'],
  ['confirmed managed shell', { activeTerminal: true, session: { shell: 'cmd', confirmed: true } }, 'LD: cmd'],
  ['automatic default switched off', { autoDefault: false, defaultActive: false }, 'off'],
  ['automatic refresh switched off', { refreshEnabled: false }, 'refresh off'],
] as const) test(`truthful status: ${name}`, () => assert.ok(statusLabel({ ...statusBase, ...change }).includes(expected)));

shellTests(test);
console.log(`${passed} passed; ${failures.length} failed`);
if (failures.length) process.exitCode = 1;
