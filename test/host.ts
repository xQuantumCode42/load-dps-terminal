import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(run: () => Promise<boolean>, label: string) {
  for (let i = 0; i < 80; i++) { if (await run()) return; await pause(250); }
  throw new Error(`Timed out: ${label}`);
}

export async function run() {
  const extension = vscode.extensions.getExtension('load-dependency-local.load-dependency');
  assert.ok(extension, 'extension registered');
  await extension.activate();
  const commands = await vscode.commands.getCommands(true);
  for (const name of ['openTerminal', 'refresh', 'diagnostics', 'restartExtensions', 'setDefaultTerminal', 'restoreDefaultTerminal'])
    assert.ok(commands.includes(`loadDependency.${name}`), `${name} registered`);
  console.log('PASS extension activation and command registration');
  if (process.platform !== 'win32') return;
  // Exercise the same built-in command as the ordinary + button, not the LD opener.
  assert.equal(vscode.workspace.getConfiguration('terminal.integrated').get('defaultProfile.windows'), 'Load Dependency: Windows PowerShell');
  await vscode.commands.executeCommand('workbench.action.terminal.new', { cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath });
  await waitFor(async () => vscode.window.terminals.some(item => item.name === 'LD: Windows PowerShell'), 'ordinary + PowerShell creation').catch(error => {
    console.log('Terminal snapshots:', vscode.window.terminals.map(item => ({ name: item.name, keys: Object.keys(item.creationOptions), marker: !!(item.creationOptions as vscode.TerminalOptions).env?.LD_SESSION })));
    throw error;
  });
  const terminal = vscode.window.terminals.find(item => item.name === 'LD: Windows PowerShell');
  assert.ok(terminal, 'PowerShell managed terminal created');
  const storage = path.join(process.env.LD_TEST_PROFILE!, 'User', 'globalStorage', 'load-dependency-local.load-dependency', 'sessions');
  let session = '';
  await waitFor(async () => {
    try {
      const dirs = await fs.readdir(storage);
      for (const dir of dirs) {
        const candidate = path.join(storage, dir);
        try { await fs.access(path.join(candidate, 'status.json')); session = candidate; return true; } catch { /* not started */ }
      }
    } catch { /* startup */ }
    return false;
  }, 'PowerShell bootstrap refresh');
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  terminal.sendText(`[IO.File]::WriteAllText(${q(path.join(session, 'probe.txt'))}, 'ps-ready')`);
  await waitFor(async () => { try { return await fs.readFile(path.join(session, 'probe.txt'), 'utf8') === 'ps-ready'; } catch { return false; } }, 'PowerShell command execution');
  console.log('PASS real managed PowerShell bootstrap and terminal input');
  // Reproduce install -> pi --version in the actual interactive host. No registry or npm writes.
  const psFixture = path.join(session, 'npm-fixture');
  const piBin = path.join(session, 'new-cli-bin');
  await fs.mkdir(psFixture);
  // PowerShell 5.1 needs BOM to decode literal non-ASCII fixture paths correctly.
  await fs.writeFile(path.join(psFixture, 'npm.ps1'), `\uFEFFNew-Item -ItemType Directory -Force -Path ${q(piBin)} | Out-Null\n[IO.File]::WriteAllText(${q(path.join(piBin, 'ld-pi-fixture.cmd'))}, "@echo off\r\necho fixture-pi-1.0\r\n")\n[IO.File]::WriteAllText(${q(path.join(session, 'installed.txt'))}, 'installed')\n$global:LASTEXITCODE=0\n`);
  terminal.sendText(`$global:ldFixturePersisted=@(Get-LDPersistedPath); function global:Get-LDPersistedPath { $global:ldFixturePersisted; if(Test-Path -LiteralPath ${q(path.join(session, 'installed.txt'))}) { ${q(piBin)} } }; function global:npm { & ${q(path.join(psFixture, 'npm.ps1'))} @args }; $env:PATH=${q(psFixture + ';')}+$env:PATH; [IO.File]::WriteAllText(${q(path.join(session, 'fixture-ready.txt'))}, 'ready')`);
  await waitFor(async () => { try { return await fs.readFile(path.join(session, 'fixture-ready.txt'), 'utf8') === 'ready'; } catch { return false; } }, 'PowerShell fake installer ready');
  terminal.sendText('npm install -g @mariozechner/pi-coding-agent');
  await waitFor(async () => { try { await fs.access(path.join(session, 'installed.txt')); return true; } catch { return false; } }, 'PowerShell fake pi installed');
  terminal.sendText(`try { $v = ld-pi-fixture --version; [IO.File]::WriteAllText(${q(path.join(session, 'pi-version.txt'))}, [string]$v) } catch { [IO.File]::WriteAllText(${q(path.join(session, 'pi-version.txt'))}, 'command-not-found') }`);
  await waitFor(async () => { try { return (await fs.readFile(path.join(session, 'pi-version.txt'), 'utf8')).length > 0; } catch { return false; } }, 'PowerShell pi lookup without manual refresh');
  assert.equal(await fs.readFile(path.join(session, 'pi-version.txt'), 'utf8'), 'fixture-pi-1.0');
  console.log('PASS real PowerShell npm global install -> pi --version without ld-refresh');
  // Official-style script installers aren't named package managers. Observe their PATH changes too.
  const scriptBin = path.join(session, 'script-cli-bin');
  const installScript = path.join(session, 'installer.ps1');
  await fs.writeFile(installScript, `\uFEFFNew-Item -ItemType Directory -Force -Path ${q(scriptBin)} | Out-Null\n[IO.File]::WriteAllText(${q(path.join(scriptBin, 'ld-script-fixture.cmd'))}, "@echo off\r\necho script-cli-ready\r\n")\n[IO.File]::WriteAllText(${q(path.join(session, 'script-installed.txt'))}, 'installed')\n`);
  terminal.sendText(`function global:Get-LDPersistedPath { $global:ldFixturePersisted; ${q(piBin)}; if(Test-Path -LiteralPath ${q(path.join(session, 'script-installed.txt'))}) { ${q(scriptBin)} } }; [IO.File]::WriteAllText(${q(path.join(session, 'script-ready.txt'))}, 'ready')`);
  await waitFor(async () => { try { await fs.access(path.join(session, 'script-ready.txt')); return true; } catch { return false; } }, 'PowerShell script installer setup');
  terminal.sendText(`powershell -NoProfile -ExecutionPolicy Bypass -File ${q(installScript)}`);
  await waitFor(async () => { try { await fs.access(path.join(session, 'script-installed.txt')); return true; } catch { return false; } }, 'script installer completion');
  terminal.sendText(`try { $v = ld-script-fixture --version; [IO.File]::WriteAllText(${q(path.join(session, 'script-version.txt'))}, [string]$v) } catch { [IO.File]::WriteAllText(${q(path.join(session, 'script-version.txt'))}, 'command-not-found') }`);
  await waitFor(async () => { try { return (await fs.readFile(path.join(session, 'script-version.txt'), 'utf8')).length > 0; } catch { return false; } }, 'script installer automatic CLI lookup');
  assert.equal(await fs.readFile(path.join(session, 'script-version.txt'), 'utf8'), 'script-cli-ready');
  console.log('PASS PowerShell script installer PATH change -> immediate CLI lookup');
  assert.ok((terminal.creationOptions as vscode.TerminalOptions).env?.LD_SESSION, '+ terminal carries its owned session marker');
  console.log('PASS ordinary + PowerShell terminal has refresh hooks and immediate CLI discovery');
  terminal.dispose();

  await vscode.commands.executeCommand('loadDependency.setDefaultTerminal', 'cmd');
  await vscode.commands.executeCommand('workbench.action.terminal.new', { cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath });
  await waitFor(async () => vscode.window.terminals.some(item => item.name === 'LD: Command Prompt'), 'ordinary + CMD creation');
  const cmd = vscode.window.terminals.find(item => item.name === 'LD: Command Prompt');
  assert.ok(cmd, 'CMD managed terminal created');
  let cmdSession = '';
  await waitFor(async () => {
    for (const dir of await fs.readdir(storage)) {
      const candidate = path.join(storage, dir);
      try { await fs.access(path.join(candidate, 'apply.cmd')); cmdSession = candidate; return true; } catch { /* not CMD */ }
    }
    return false;
  }, 'CMD bootstrap refresh');
  cmd.sendText('ld-refresh');
  cmd.sendText('echo cmd-ready>"%LD_SESSION%\\probe.txt"');
  await waitFor(async () => { try { return (await fs.readFile(path.join(cmdSession, 'probe.txt'), 'utf8')).trim() === 'cmd-ready'; } catch { return false; } }, 'CMD DOSKEY refresh and terminal input');
  console.log('PASS real managed CMD bootstrap and DOSKEY manual refresh');
  // A literal nested %VAR% must reach the package manager unchanged, exactly once.
  const fixture = path.join(cmdSession, 'fixture');
  await fs.mkdir(fixture);
  await fs.writeFile(path.join(fixture, 'npm.cmd'), '@echo off\r\necho once>>"%LD_SESSION%\\count.txt"\r\n<nul set /p "=%~2">"%LD_SESSION%\\args.txt"\r\nif "%~2"=="fail" exit /b 7\r\nexit /b 0\r\n');
  await fs.writeFile(path.join(cmdSession, 'setup.cmd'), `@echo off\r\nset "PATH=${fixture};%PATH%"\r\nset "LD_TEST_TOKEN=%%LD_TEST_SECRET%%"\r\nset "LD_TEST_SECRET=expanded"\r\n`);
  cmd.sendText('"%LD_SESSION%\\setup.cmd"');
  const statusBeforeInstall = await fs.readFile(path.join(cmdSession, 'status.json'), 'utf8');
  cmd.sendText('npm install "%LD_TEST_TOKEN%"');
  await waitFor(async () => { try { await fs.access(path.join(cmdSession, 'args.txt')); return true; } catch { return false; } }, 'CMD installer fixture');
  assert.equal(await fs.readFile(path.join(cmdSession, 'args.txt'), 'utf8'), '%LD_TEST_SECRET%');
  assert.equal((await fs.readFile(path.join(cmdSession, 'count.txt'), 'utf8')).trim(), 'once');
  await waitFor(async () => (await fs.readFile(path.join(cmdSession, 'status.json'), 'utf8')) !== statusBeforeInstall, 'CMD automatic post-install refresh');
  console.log('PASS CMD install preserves literal percent arguments and executes exactly once');
  const statusBeforeFailure = await fs.readFile(path.join(cmdSession, 'status.json'), 'utf8');
  cmd.sendText('npm install fail');
  // Put redirection first: echo 7>file would redirect descriptor 7, not print the exit code.
  cmd.sendText('>"%LD_SESSION%\\exit.txt" echo %ERRORLEVEL%');
  await waitFor(async () => { try { return (await fs.readFile(path.join(cmdSession, 'exit.txt'), 'utf8')).trim().length > 0; } catch { return false; } }, 'CMD failure code');
  assert.equal((await fs.readFile(path.join(cmdSession, 'exit.txt'), 'utf8')).trim(), '7');
  assert.equal(await fs.readFile(path.join(cmdSession, 'status.json'), 'utf8'), statusBeforeFailure);
  console.log('PASS CMD failed installer preserves exit status and does not refresh');
  cmd.dispose();

  if (spawnSync('wsl.exe', ['--exec', 'bash', '--version'], { timeout: 10000 }).status !== 0) {
    console.log('SKIP WSL host test: default distro unavailable'); return;
  }
  const beforeWsl = new Set(await fs.readdir(storage));
  await vscode.commands.executeCommand('loadDependency.setDefaultTerminal', 'wsl');
  await vscode.commands.executeCommand('workbench.action.terminal.new', { cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath });
  await waitFor(async () => vscode.window.terminals.some(item => item.name === 'LD: Ubuntu / WSL'), 'ordinary + WSL creation');
  const wsl = vscode.window.terminals.find(item => item.name === 'LD: Ubuntu / WSL');
  assert.ok(wsl, 'managed WSL terminal created');
  let wslSession = '';
  await waitFor(async () => {
    for (const dir of await fs.readdir(storage)) {
      if (beforeWsl.has(dir)) continue;
      const candidate = path.join(storage, dir);
      try { await fs.access(path.join(candidate, 'status.json')); wslSession = candidate; return true; } catch { /* startup */ }
    }
    return false;
  }, 'WSL bootstrap refresh');
  await waitFor(async () => !!wsl.shellIntegration, 'WSL native shell integration');
  let installReported = false;
  let definitionReported = false;
  const events = vscode.window.onDidEndTerminalShellExecution(event => {
    if (event.terminal === wsl && event.execution.commandLine.value.includes('function pip()') && event.exitCode === 0) definitionReported = true;
    if (event.terminal === wsl && event.execution.commandLine.value.trim() === 'pip install load-dependency-fixture' && event.exitCode === 0) installReported = true;
  });
  try {
    wsl.sendText('HISTFILE=/dev/null; function pip() { return 0; }; printf defined > "$LD_SESSION/defined.txt"');
    await waitFor(async () => { try { return await fs.readFile(path.join(wslSession, 'defined.txt'), 'utf8') === 'defined'; } catch { return false; } }, 'WSL fake installer defined');
    await waitFor(async () => definitionReported, 'WSL fixture setup reaches a completed native prompt');
    wsl.sendText('pip install load-dependency-fixture');
    await waitFor(async () => installReported, 'native successful install event');
    await waitFor(async () => { try { await fs.access(path.join(wslSession, 'refresh.request')); return true; } catch { return false; } }, 'native event refresh queue');
    wsl.sendText('printf wsl-ready > "$LD_SESSION/probe.txt"');
    await waitFor(async () => { try { return await fs.readFile(path.join(wslSession, 'probe.txt'), 'utf8') === 'wsl-ready'; } catch { return false; } }, 'WSL command execution');
    await waitFor(async () => { try { await fs.access(path.join(wslSession, 'refresh.request')); return false; } catch { return true; } }, 'WSL prompt consumes queued refresh');
    console.log('PASS real WSL terminal: native install event, queued refresh and prompt consumption');
  } finally { events.dispose(); wsl.dispose(); }

  const config = vscode.workspace.getConfiguration('terminal.integrated');
  await vscode.commands.executeCommand('loadDependency.restoreDefaultTerminal');
  const currentDefault = () => vscode.workspace.getConfiguration('terminal.integrated').get('defaultProfile.windows');
  assert.equal(currentDefault(), 'Windows PowerShell', 'switching LD shells retains the original default backup');
  assert.equal(vscode.workspace.getConfiguration('loadDependency').get('autoDefaultTerminal'), false);
  console.log('PASS restoring the original default after PowerShell/CMD/WSL switches');

  await vscode.commands.executeCommand('loadDependency.setDefaultTerminal', 'powershell');
  await config.update('defaultProfile.windows', 'Command Prompt', vscode.ConfigurationTarget.Global);
  await vscode.commands.executeCommand('loadDependency.restoreDefaultTerminal');
  assert.equal(currentDefault(), 'Command Prompt', 'a later manual default must not be overwritten on restore');
  console.log('PASS restore preserves a later manual default choice');

  await vscode.commands.executeCommand('loadDependency.setDefaultTerminal', 'powershell');
  await vscode.workspace.getConfiguration('loadDependency').update('autoDefaultTerminal', false, vscode.ConfigurationTarget.Global);
  await waitFor(async () => currentDefault() === 'Command Prompt', 'disabling automatic default restores previous setting');
  console.log('PASS disabling auto-default restores the previous profile');

  await vscode.commands.executeCommand('loadDependency.setDefaultTerminal', 'powershell');
  await vscode.workspace.getConfiguration('terminal.integrated').update('defaultProfile.windows', 'Windows PowerShell', vscode.ConfigurationTarget.Workspace);
  await vscode.commands.executeCommand('loadDependency.restoreDefaultTerminal');
  const layers = vscode.workspace.getConfiguration('terminal.integrated').inspect('defaultProfile.windows');
  assert.equal(layers?.globalValue, 'Command Prompt', 'restore global LD backup even when a workspace override now wins');
  assert.equal(layers?.workspaceValue, 'Windows PowerShell', 'preserve new workspace choice');
  console.log('PASS restore recorded global default underneath a later workspace override');
  await vscode.workspace.getConfiguration('terminal.integrated').update('defaultProfile.windows', undefined, vscode.ConfigurationTarget.Workspace);

  await vscode.workspace.getConfiguration('terminal.integrated').update('defaultProfile.windows', 'Windows PowerShell', vscode.ConfigurationTarget.Workspace);
  await vscode.commands.executeCommand('loadDependency.setDefaultTerminal', 'cmd');
  assert.equal(vscode.workspace.getConfiguration('terminal.integrated').inspect('defaultProfile.windows')?.globalValue, 'Command Prompt', 'workspace setup must leave global value intact');
  await vscode.commands.executeCommand('loadDependency.restoreDefaultTerminal');
  assert.equal(vscode.workspace.getConfiguration('terminal.integrated').inspect('defaultProfile.windows')?.workspaceValue, 'Windows PowerShell');
  console.log('PASS workspace default changes and restores at the original scope');
  await vscode.workspace.getConfiguration('terminal.integrated').update('defaultProfile.windows', undefined, vscode.ConfigurationTarget.Workspace);

  const folders = vscode.workspace.workspaceFolders!;
  // DefaultProfile is a window setting (VS Code rejects folder-scoped writes).
  // Keep a genuine resource-scoped setting as a guard against incidental changes.
  const folderConfig = vscode.workspace.getConfiguration('editor', folders[0].uri);
  await folderConfig.update('tabSize', 7, vscode.ConfigurationTarget.WorkspaceFolder);
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folders[0].uri, 'one.txt')));
  await vscode.commands.executeCommand('loadDependency.setDefaultTerminal', 'powershell');
  assert.equal(vscode.workspace.getConfiguration('editor', folders[0].uri).inspect('tabSize')?.workspaceFolderValue, 7, 'window default setup must not alter folder-specific settings');
  assert.equal(vscode.workspace.getConfiguration('terminal.integrated').inspect('defaultProfile.windows')?.globalValue, 'Load Dependency: Windows PowerShell');
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folders[0].uri, 'two.txt')));
  await vscode.commands.executeCommand('loadDependency.restoreDefaultTerminal');
  assert.equal(vscode.workspace.getConfiguration('editor', folders[0].uri).inspect('tabSize')?.workspaceFolderValue, 7);
  assert.equal(vscode.workspace.getConfiguration('terminal.integrated').inspect('defaultProfile.windows')?.globalValue, 'Command Prompt');
  console.log('PASS window restore survives switching documents and preserves folder settings');

  await vscode.commands.executeCommand('loadDependency.setDefaultTerminal', 'powershell');
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folders[1].uri, 'other.txt')));
  await vscode.commands.executeCommand('loadDependency.restoreDefaultTerminal');
  assert.equal(vscode.workspace.getConfiguration('editor', folders[0].uri).inspect('tabSize')?.workspaceFolderValue, 7);
  assert.equal(vscode.workspace.getConfiguration('terminal.integrated').inspect('defaultProfile.windows')?.globalValue, 'Command Prompt');
  console.log('PASS window restore survives switching workspace folders');
}
