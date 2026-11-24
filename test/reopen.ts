import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export async function run() {
  const extension = vscode.extensions.getExtension('load-dependency-local.load-dependency');
  assert.ok(extension);
  await extension.activate();
  if (process.env.LD_REOPEN_PHASE === 'seed') {
    await vscode.commands.executeCommand('loadDependency.restoreDefaultTerminal');
    assert.equal(vscode.workspace.getConfiguration('terminal.integrated').get('defaultProfile.windows'), 'Command Prompt');
    // Re-enable with an unsupported temporary profile, then select native CMD.
    // This seeds the real legacy shape (initialized=true, no saved LD backup)
    // without editing SQLite or stale on-disk application settings externally.
    await vscode.workspace.getConfiguration('terminal.integrated').update('defaultProfile.windows', 'LD Reopen Fixture', vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('loadDependency').update('autoDefaultTerminal', true, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('terminal.integrated').update('defaultProfile.windows', 'Command Prompt', vscode.ConfigurationTarget.Global);
    assert.equal(vscode.workspace.getConfiguration('loadDependency').get('autoDefaultTerminal'), true);
    assert.equal(vscode.workspace.getConfiguration('terminal.integrated').get('defaultProfile.windows'), 'Command Prompt');
    console.log('PASS saved a real initialized state with auto-default on and a native default via configuration API');
    return;
  }
  console.log('Reopen auto-default:', vscode.workspace.getConfiguration('loadDependency').get('autoDefaultTerminal'), 'default:', vscode.workspace.getConfiguration('terminal.integrated').get('defaultProfile.windows'));
  assert.equal(vscode.workspace.getConfiguration('terminal.integrated').get('defaultProfile.windows'), 'Load Dependency: Command Prompt', 'an old initialized flag must not prevent current enabled default setup');
  await vscode.commands.executeCommand('workbench.action.terminal.new');
  const terminal = vscode.window.terminals.find(item => (item.creationOptions as vscode.TerminalOptions).env?.LD_SESSION);
  assert.ok(terminal, 'ordinary + after reopen must create an owned terminal');
  const session = (terminal.creationOptions as vscode.TerminalOptions).env!.LD_SESSION!;
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try { ready = (await fs.readFile(path.join(session, 'status.json'), 'utf8')).includes('refreshed'); } catch { /* bootstrap */ }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(ready, 'shell bootstrap must report refresh completion after reopening');
    console.log('PASS reopen with initialized=true, native default and auto-default=true -> hooked + terminal');
  } finally { terminal.dispose(); }
  await vscode.commands.executeCommand('loadDependency.restoreDefaultTerminal');
  assert.equal(vscode.workspace.getConfiguration('terminal.integrated').get('defaultProfile.windows'), 'Command Prompt', 'rewrapping on startup must preserve the latest native choice for restore');
  console.log('PASS restore after cold rewrap retains the latest native shell choice');
}
