import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

type Test = (name: string, run: () => void) => void;
const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
function ps(script: string) {
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(`$ErrorActionPreference='Stop'; ${script}`, 'utf16le').toString('base64')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout.trim();
}

export function shellTests(test: Test) {
  if (process.platform !== 'win32') return;
  const lib = quote(resolve('shell/windows-path.ps1'));
  test('PATH merge retains virtualenv precedence, adds persisted paths, removes deleted paths and duplicates', () => {
    const output = ps(`. ${lib}; Merge-LDPath 'C:\\venv;C:\\Windows;C:\\Old;C:\\Windows' @('C:\\Windows','C:\\Old') @('C:\\Windows','C:\\New')`);
    assert.equal(output, 'C:\\venv;C:\\Windows;C:\\New');
  });
  test('PATH merge treats case and trailing slashes as equal', () => {
    assert.equal(ps(`. ${lib}; Merge-LDPath 'C:\\VENV;C:\\Tools\\' @() @('c:\\tools','C:\\New')`), 'C:\\VENV;C:\\Tools\\;C:\\New');
  });
  test('same PowerShell process discovers a CLI after PATH merge', () => {
    const folder = mkdtempSync(join(tmpdir(), 'ld-test-'));
    try {
      writeFileSync(join(folder, 'ld-probe.cmd'), '@echo off\r\necho cli-ready\r\n');
      const output = ps(`. ${lib}; $env:PATH = Merge-LDPath $env:PATH @() @(${quote(folder)}); & ld-probe.cmd`);
      assert.equal(output, 'cli-ready');
    } finally { rmSync(folder, { recursive: true, force: true }); }
  });
  test('CMD refresh assignment preserves special characters without executing them', () => {
    const folder = mkdtempSync(join(tmpdir(), 'ld-cmd-'));
    try {
      const special = join(folder, '百分比% & bang! (tools)');
      mkdirSync(special);
      const outputFile = join(folder, 'refresh.cmd');
      ps(`. ${lib}; Write-LDCmdPath ${quote(special)} ${quote(outputFile)}`);
      const result = spawnSync('cmd.exe', ['/d', '/v:off', '/s', '/c', `"call "${outputFile}" && set PATH"`], { encoding: 'utf8', windowsVerbatimArguments: true });
      assert.equal(result.status, 0, result.stderr);
      // CMD may use a legacy code page; verify by executing a CLI from the directory instead.
      writeFileSync(join(special, 'ld-special.cmd'), '@echo off\r\necho special-ready\r\n');
      const run = spawnSync('cmd.exe', ['/d', '/v:off', '/s', '/c', `"chcp 65001 >nul & call "${outputFile}" & ld-special.cmd"`], { encoding: 'utf8', windowsVerbatimArguments: true });
      assert.equal(run.stdout.trim(), 'special-ready', run.stderr);
    } finally { rmSync(folder, { recursive: true, force: true }); }
  });
  test('CMD rejects quotes/newlines in PATH rather than generating executable assignments', () => {
    assert.equal(ps(`. ${lib}; try { Write-LDCmdPath 'C:\\bad" & echo nope' 'unused.cmd'; 'accepted' } catch { 'rejected' }`), 'rejected');
  });
  test('PowerShell prompt refreshes after an install and preserves the original prompt', () => {
    const folder = mkdtempSync(join(tmpdir(), 'ld-prompt-'));
    try {
      writeFileSync(join(folder, 'ld-prompt-probe.cmd'), '@echo off\r\necho prompt-ready\r\n');
      const output = ps(`$env:LD_SESSION=${quote(folder)}; $env:LD_ENABLED='1'; function global:prompt { 'original-prompt' }; . ${quote(resolve('shell/powershell.ps1'))}; function Get-LDPersistedPath { ${quote(folder)} }; Add-History -InputObject ([pscustomobject]@{CommandLine='winget install fixture'; ExecutionStatus='Completed'; StartExecutionTime=[datetime]::Now; EndExecutionTime=[datetime]::Now}); prompt; & ld-prompt-probe.cmd`);
      assert.ok(output.includes('original-prompt'), output);
      assert.ok(output.endsWith('prompt-ready'), output);
    } finally { rmSync(folder, { recursive: true, force: true }); }
  });
  test('PowerShell original prompt still sees a native command failure', () => {
    const folder = mkdtempSync(join(tmpdir(), 'ld-failure-'));
    try {
      const output = ps(`$env:LD_SESSION=${quote(folder)}; $env:LD_ENABLED='1'; function global:prompt { "success:$? native:$global:LASTEXITCODE" }; . ${quote(resolve('shell/powershell.ps1'))}; & cmd.exe /d /c exit 7; prompt`);
      assert.ok(output.endsWith('success:False native:7'), output);
    } finally { rmSync(folder, { recursive: true, force: true }); }
  });
  test('disabled PowerShell auto-refresh does not apply a later persisted PATH change', () => {
    const folder = mkdtempSync(join(tmpdir(), 'ld-disabled-'));
    try {
      writeFileSync(join(folder, 'ld-disabled-probe.cmd'), '@echo off\r\necho unexpected\r\n');
      const output = ps(`$env:LD_SESSION=${quote(folder)}; $env:LD_ENABLED='0'; function global:prompt { 'prompt' }; . ${quote(resolve('shell/powershell.ps1'))}; function Get-LDPersistedPath { ${quote(folder)} }; prompt; if (Get-Command ld-disabled-probe -ErrorAction SilentlyContinue) { 'unexpected' } else { 'not-refreshed' }`);
      assert.ok(output.endsWith('not-refreshed'), output);
    } finally { rmSync(folder, { recursive: true, force: true }); }
  });
  test('CMD post-command hook refreshes the parent PATH and preserves failed exit codes', () => {
    const folder = mkdtempSync(join(tmpdir(), 'ld-bridge-'));
    try {
      const adapters = join(folder, 'shell');
      cpSync(resolve('shell'), adapters, { recursive: true });
      // Substitute only the registry reader. The hook, merger and batch assignment remain real.
      writeFileSync(join(adapters, 'windows-path.ps1'), readFileSync(join(adapters, 'windows-path.ps1'), 'utf8') + '\nfunction Get-LDPersistedPath { $env:LD_TEST_NEW }\n');
      const newBin = join(folder, 'new-bin'); mkdirSync(newBin);
      writeFileSync(join(newBin, 'ld-new.cmd'), '@echo off\r\necho bridge-ready\r\n');
      writeFileSync(join(folder, 'winget.cmd'), '@echo off\r\necho once>>"%LD_SESSION%\\count.txt"\r\nif "%~2"=="fail" exit /b 7\r\nexit /b 0\r\n');
      const runner = join(folder, 'runner.cmd');
      writeFileSync(runner, `@echo off\r\ncall winget install fixture\r\ncall "${join(adapters, 'cmd-after.cmd')}"\r\ncall ld-new.cmd\r\ncall winget install fail\r\ncall "${join(adapters, 'cmd-after.cmd')}"\r\nexit /b %errorlevel%\r\n`);
      const result = spawnSync('cmd.exe', ['/d', '/v:off', '/s', '/c', `""${runner}""`], { encoding: 'utf8', windowsVerbatimArguments: true, env: { ...process.env, PATH: `${folder};${process.env.PATH}`, LD_SESSION: folder, LD_SHELL_DIR: adapters, LD_ENABLED: '1', LD_TEST_NEW: newBin } });
      assert.equal(result.status, 7, result.stderr);
      assert.ok(result.stdout.includes('bridge-ready'), result.stdout + result.stderr);
      assert.equal(readFileSync(join(folder, 'count.txt'), 'utf8').trim(), 'once\r\nonce');
    } finally { rmSync(folder, { recursive: true, force: true }); }
  });
  const wsl = spawnSync('wsl.exe', ['--exec', 'bash', '--version'], { encoding: 'utf8', timeout: 10000 });
  const gitBash = 'C:/Program Files/Git/bin/bash.exe';
  const hasWsl = wsl.status === 0;
  if (!hasWsl && !existsSync(gitBash)) { console.log('SKIP Bash adapter: no accessible Bash runtime'); return; }
  for (const fail of [false, true]) test(`real ${hasWsl ? 'WSL' : 'Git Bash'} prompt ${fail ? 'does not refresh a failed install' : 'refreshes a successful install and preserves existing hooks'}`, () => {
    const folder = mkdtempSync(join(tmpdir(), 'ld-bash-'));
    const linux = (value: string) => hasWsl
      ? spawnSync('wsl.exe', ['--exec', 'wslpath', '-a', '-u', value], { encoding: 'utf8' }).stdout.trim()
      : value.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`);
    try {
      const home = linux(folder);
      const bin = join(folder, 'fixture-bin'); mkdirSync(bin);
      writeFileSync(join(bin, 'pip'), '#!/bin/bash\nmkdir -p "$HOME/.local/bin"\nprintf \'#!/bin/bash\\necho bash-ready\\n\' > "$HOME/.local/bin/ld-bash-probe"\nchmod +x "$HOME/.local/bin/ld-bash-probe"\n' + (fail ? 'exit 7\n' : 'exit 0\n'));
      writeFileSync(join(folder, '.bashrc'), 'PROMPT_COMMAND=(\'printf hook-ran > "$LD_SESSION/hook.txt"\')\n');
      const args = ['--noprofile', '--init-file', linux(resolve('shell/bash.bash')), '-i'];
      const assignments = [`HOME=${home}`, `LD_SESSION=${home}`, 'LD_ENABLED=1', `PATH=${linux(bin)}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`, 'HISTFILE=/dev/null'];
      const input = `chmod +x "$HOME/fixture-bin/pip"\npip install fixture\n${fail ? 'if command -v ld-bash-probe >/dev/null; then echo unexpected; else echo failed-not-refreshed; fi' : 'ld-bash-probe'} > "$LD_SESSION/result.txt"\nexit\n`;
      const result = hasWsl
        ? spawnSync('wsl.exe', ['--exec', 'env', ...assignments, 'bash', ...args], { input, encoding: 'utf8', timeout: 20000 })
        : spawnSync(gitBash, args, { input, encoding: 'utf8', timeout: 20000, env: { ...process.env, HOME: home, LD_SESSION: home, LD_ENABLED: '1', HISTFILE: '/dev/null', PATH: `${linux(bin)}:/usr/bin:/bin` } });
      assert.equal(result.status, 0, result.stderr || String(result.error));
      assert.equal(readFileSync(join(folder, 'result.txt'), 'utf8').trim(), fail ? 'failed-not-refreshed' : 'bash-ready', result.stderr);
      assert.equal(readFileSync(join(folder, 'hook.txt'), 'utf8'), 'hook-ran');
    } finally { rmSync(folder, { recursive: true, force: true }); }
  });
}
