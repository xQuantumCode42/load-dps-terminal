import * as vscode from 'vscode';
import { detectDefaultShell, profiles, Shell } from './profiles';

interface Backup { previous?: string | null; installed: string; key: string; target: vscode.ConfigurationTarget }

export class DefaultTerminal {
  constructor(private readonly context: vscode.ExtensionContext, private readonly log: (message: string) => void) {}

  private scope() {
    // The ordinary + action resolves a window default, not an active-document
    // setting. Do not write folder defaults which that action will not consult.
    const config = vscode.workspace.getConfiguration('terminal.integrated');
    const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';
    const key = `defaultProfile.${platform}`;
    const inspected = config.inspect<string | null>(key);
    let target = vscode.ConfigurationTarget.Global;
    let previous = inspected?.globalValue;
    if (inspected?.workspaceValue !== undefined) { target = vscode.ConfigurationTarget.Workspace; previous = inspected.workspaceValue; }
    const store = target === vscode.ConfigurationTarget.Global ? this.context.globalState : this.context.workspaceState;
    const identity = `${key}.${target}`;
    return { config, key, target, previous, store, identity, platform };
  }

  async initialize() {
    if (vscode.env.remoteName || !vscode.workspace.isTrusted) return;
    const scope = this.scope();
    if (!vscode.workspace.getConfiguration('loadDependency').get('autoDefaultTerminal', true)) {
      await this.restore(false);
      return;
    }
    // Legacy initialized=true records only a previous attempt. They must not
    // suppress setup when auto-default is on but the current default is native.
    // The live configuration below is the source of truth for readiness.
    const current = scope.config.get<string | null>(scope.key);
    if (profiles.some(profile => profile.title === current)) return;
    const configured = scope.config.get<Record<string, unknown>>(`profiles.${scope.platform}`)?.[current ?? ''];
    const shell = detectDefaultShell(current, vscode.env.shell, configured);
    if (!shell || (process.platform === 'win32' && shell === 'bash')) {
      await scope.store.update(`${scope.identity}.initialized`, true);
      void vscode.window.showInformationMessage('Load Dependency: your custom terminal was preserved. Choose a supported default to enable refresh with the + button.', 'Choose Default').then(action => {
        if (action) void this.select().catch(error => this.log(`Default setup failed: ${String(error)}`));
      });
      return;
    }
    // Preserve a simple configured executable path (for example portable PowerShell).
    if (configured && typeof (configured as { path?: unknown }).path === 'string')
      await this.context.workspaceState.update(`shellPath.${shell}`, (configured as { path: string }).path);
    await this.install(shell);
    this.log('Ordinary + terminals now use Load Dependency. Previous default saved; restore command is available.');
  }

  async select(requested?: Shell) {
    const available = profiles.filter(profile => process.platform === 'win32' ? profile.shell !== 'bash' : profile.shell === 'bash');
    const selected = requested ? available.find(profile => profile.shell === requested) : await vscode.window.showQuickPick(available.map(profile => ({ ...profile, description: 'Use for the ordinary terminal + button' })), { title: 'Load Dependency: Set Default Terminal' });
    if (!selected) return;
    if (vscode.env.remoteName) throw new Error('Default integration currently supports local VS Code windows only.');
    await this.install(selected.shell);
    await vscode.workspace.getConfiguration('loadDependency').update('autoDefaultTerminal', true, vscode.ConfigurationTarget.Global);
  }

  private async install(shell: Shell) {
    const scope = this.scope();
    const profile = profiles.find(profile => profile.shell === shell)!;
    const current = scope.config.get<string | null>(scope.key);
    const prior = scope.store.get<Backup>(`${scope.identity}.backup`);
    const owned = profiles.some(item => item.title === current);
    // Switching between LD profiles retains the original default. A later explicit
    // enable from a non-LD profile backs up the user's latest choice instead.
    const backup: Backup = owned && prior ? { ...prior, installed: profile.title } : { previous: scope.previous, installed: profile.title, key: scope.key, target: scope.target };
    await scope.store.update(`${scope.identity}.backup`, backup);
    await scope.config.update(scope.key, profile.title, scope.target);
    // VS Code 1.93 debounces its terminal-profile cache refresh by 2 seconds.
    // Configuration.update resolves before that cache is rebuilt; an immediate +
    // can otherwise launch the previous native profile and skip our provider.
    await new Promise(resolve => setTimeout(resolve, 2500));
    await scope.store.update(`${scope.identity}.initialized`, true);
  }

  async restore(disable = true) {
    const scope = this.scope();
    // Restore saved slots independently: a newer workspace override must not hide
    // our global backup. Preserve every slot the user has subsequently changed.
    for (const store of [this.context.globalState, this.context.workspaceState]) {
      for (const entry of store.keys().filter(key => key.startsWith(`${scope.key}.`) && key.endsWith('.backup'))) {
        const backup = store.get<Backup>(entry);
        if (!backup || backup.key !== scope.key || ![vscode.ConfigurationTarget.Global, vscode.ConfigurationTarget.Workspace].includes(backup.target)) continue;
        const config = vscode.workspace.getConfiguration('terminal.integrated');
        const inspected = config.inspect<string | null>(backup.key);
        const current = backup.target === vscode.ConfigurationTarget.Global ? inspected?.globalValue : inspected?.workspaceValue;
        if (current === backup.installed) {
          await config.update(backup.key, backup.previous, backup.target);
          this.log('Previous terminal default restored. Existing terminals were left running.');
        }
        await store.update(entry, undefined);
        await store.update(entry.replace(/\.backup$/, '.initialized'), true);
      }
    }
    await scope.store.update(`${scope.identity}.initialized`, true);
    if (disable) await vscode.workspace.getConfiguration('loadDependency').update('autoDefaultTerminal', false, vscode.ConfigurationTarget.Global);
  }
}
