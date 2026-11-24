import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs, existsSync } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { detectInstall, shouldRefresh } from './core';
import { profiles, Shell } from './profiles';
import { DefaultTerminal } from './default-terminal';
import { statusLabel } from './status';

const exec = promisify(execFile);
interface Session { directory: string; shell: Shell; lastStatus?: string; native: boolean; createdAt: number; autoRefresh: boolean; startupFailed?: boolean }

export async function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('Load Dependency');
  const status = vscode.window.createStatusBarItem('loadDependency.status', vscode.StatusBarAlignment.Right, 50);
  status.name = 'Load Dependency';
  const sessions = new Map<vscode.Terminal, Session>();
  const pending = new Map<string, Session>();
  const seen = new WeakSet<vscode.TerminalShellExecution>();
  let defaultOperations = 0;
  let disposed = false;
  const enabled = () => vscode.workspace.getConfiguration('loadDependency').get<boolean>('enabled', true);
  const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';
  const defaultProfile = () => vscode.workspace.getConfiguration('terminal.integrated').get<string>(`defaultProfile.${platform}`);
  const hasDefault = () => profiles.some(profile => profile.title === defaultProfile());
  const report = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`Error: ${message}`);
    void vscode.window.showErrorMessage(`Load Dependency: ${message}`);
  };
  const updateStatus = () => {
    const terminal = vscode.window.activeTerminal;
    const session = terminal && sessions.get(terminal);
    const defaultActive = hasDefault();
    const label = statusLabel({ settingUp: defaultOperations > 0, defaultActive,
      autoDefault: vscode.workspace.getConfiguration('loadDependency').get('autoDefaultTerminal', true),
      refreshEnabled: session?.autoRefresh ?? enabled(), activeTerminal: !!terminal,
      session: session ? { shell: session.shell, confirmed: !!session.lastStatus, failed: session.startupFailed } : undefined });
    status.text = `${defaultOperations || session && !session.lastStatus && !session.startupFailed ? '$(sync~spin)' : '$(terminal)'} ${label}`;
    status.tooltip = session
      ? `${session.lastStatus ? 'Shell refresh confirmed' : session.startupFailed ? 'No shell readiness marker received; open status for diagnosis' : 'Waiting for the shell bootstrap to confirm readiness'}; ${session.native ? 'native events connected' : 'native events unavailable'}. Click for status.`
      : defaultOperations ? 'Preparing terminal profiles. This setup indicator is brief.' : defaultActive ? 'New + terminals will include refresh hooks. The selected existing terminal is not hooked; press + to create a new one.' : 'Automatic default is not active. Click to select a supported default terminal.';
    status.command = session || defaultActive ? 'loadDependency.diagnostics' : 'loadDependency.setDefaultTerminal';
    status.show();
  };

  async function queue(terminal: vscode.Terminal) {
    const session = sessions.get(terminal);
    if (!session) return false;
    await fs.writeFile(path.join(session.directory, 'refresh.request'), 'refresh\n', { mode: 0o600 });
    output.appendLine(`${session.shell}: refresh queued; applies at the next shell hook. CMD: next wrapped install or ld-refresh.`);
    return true;
  }

  async function prepareTerminal(shell: Shell): Promise<{ options: vscode.TerminalOptions; session: Session }> {
    if (!vscode.workspace.isTrusted) throw new Error('Open a trusted workspace to create managed terminals.');
    if (vscode.env.remoteName) throw new Error('This preview targets local VS Code terminals. Open a local window, then choose Ubuntu / WSL.');
    if (process.platform === 'win32' && shell === 'bash') throw new Error('The Bash profile is for Linux/macOS. On Windows select Ubuntu / WSL.');
    if (process.platform !== 'win32' && shell !== 'bash') throw new Error('This terminal profile requires Windows.');
    const selected = profiles.find(profile => profile.shell === shell)!;
    const directory = path.join(context.globalStorageUri.fsPath, 'sessions', randomUUID());
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const shellDirectory = path.join(directory, 'shell');
    const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
    const env: Record<string, string> = {
      LD_SESSION: directory, LD_SHELL_DIR: shellDirectory, LD_ENABLED: enabled() ? '1' : '0',
    };
    // Older VS Code releases keep these scripts in browser/media; newer ones use common/scripts.
    const integrationName = shell === 'powershell' || shell === 'pwsh' ? 'shellIntegration.ps1' : 'shellIntegration-bash.sh';
    const integration = ['common/scripts', 'browser/media']
      .map(folder => path.join(vscode.env.appRoot, 'out/vs/workbench/contrib/terminal', folder, integrationName))
      .find(candidate => existsSync(candidate));
    if (integration) env.LD_VSCODE_INTEGRATION = integration;
    let shellPath: string;
    let shellArgs: string[];
    try {
      await fs.cp(context.asAbsolutePath('shell'), shellDirectory, { recursive: true });
      const remembered = context.workspaceState.get<string>(`shellPath.${shell}`);
      if (shell === 'powershell' || shell === 'pwsh') {
        shellPath = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
        if (shell === 'pwsh') {
          const standard = path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe');
          shellPath = remembered && existsSync(remembered) ? remembered : existsSync(standard) ? standard : (await exec('where.exe', ['pwsh.exe'], { timeout: 5000, windowsHide: true })).stdout.trim().split(/\r?\n/)[0];
        }
        shellArgs = ['-NoLogo', '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', path.join(shellDirectory, 'powershell.ps1')];
      } else if (shell === 'cmd') {
        shellPath = path.join(systemRoot, 'System32', 'cmd.exe');
        // CMD shellArgs are a raw string: CRT backslash-escaping of quotes is incorrect for CMD.
        shellArgs = [];
      } else if (shell === 'wsl') {
        shellPath = path.join(systemRoot, 'System32', 'wsl.exe');
        const convert = async (value: string) => (await exec(shellPath, ['--exec', 'wslpath', '-a', '-u', value], { timeout: 15000, windowsHide: true, encoding: 'utf8' })).stdout.trim();
        const linuxSession = await convert(directory);
        const linuxShell = await convert(shellDirectory);
        if (!linuxSession.startsWith('/') || !linuxShell.startsWith('/')) throw new Error('WSL did not return an absolute Linux path.');
        const integrationArgs = integration ? [`LD_VSCODE_INTEGRATION=${await convert(integration)}`] : [];
        shellArgs = ['--exec', 'env', `LD_SESSION=${linuxSession}`, `LD_SHELL_DIR=${linuxShell}`, `LD_ENABLED=${env.LD_ENABLED}`, ...integrationArgs, 'TERM_PROGRAM=vscode', 'bash', '--init-file', `${linuxShell}/bash.bash`, '-i'];
      } else {
        shellPath = '/bin/bash';
        shellArgs = ['--init-file', path.join(shellDirectory, 'bash.bash'), '-i'];
      }
      if (remembered && existsSync(remembered)) shellPath = remembered;
      if (shell === 'cmd' && /["\r\n%]/.test(shellDirectory)) throw new Error('CMD session path contains unsupported quoting characters.');
      const options: vscode.TerminalOptions = {
        name: `LD: ${selected.label}`, shellPath,
        shellArgs: shell === 'cmd' ? `/d /v:off /k ""${path.join(shellDirectory, 'cmd-init.cmd')}""` : shellArgs,
        env,
      };
      const session: Session = { directory, shell, native: false, createdAt: Date.now(), autoRefresh: env.LD_ENABLED === '1' };
      pending.set(directory, session);
      return { options, session };
    } catch (error) {
      await fs.rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  function track(terminal: vscode.Terminal, session: Session) {
    pending.delete(session.directory);
    sessions.set(terminal, session);
    session.native = !!terminal.shellIntegration;
    output.appendLine(`${session.shell}: terminal initialized through the shared profile bootstrap.`);
    updateStatus();
  }

  async function openTerminal(requested?: Shell) {
    const available = profiles.filter(profile => process.platform === 'win32' ? profile.shell !== 'bash' : profile.shell === 'bash');
    const selected = requested ? available.find(profile => profile.shell === requested) : await vscode.window.showQuickPick(available, { title: 'Load Dependency: Open Terminal' });
    if (!selected) return;
    const prepared = await prepareTerminal(selected.shell);
    const terminal = vscode.window.createTerminal(prepared.options);
    track(terminal, prepared.session);
    terminal.show();
  }

  const defaults = new DefaultTerminal(context, message => output.appendLine(message));
  async function changeDefault(work: () => Promise<void>) {
    defaultOperations++;
    updateStatus();
    try { await work(); }
    finally { defaultOperations--; updateStatus(); }
  }

  context.subscriptions.push(output, status,
    vscode.commands.registerCommand('loadDependency.setDefaultTerminal', (shell?: Shell) => changeDefault(() => defaults.select(shell)).catch(report)),
    vscode.commands.registerCommand('loadDependency.restoreDefaultTerminal', () => changeDefault(() => defaults.restore()).catch(report)),
    vscode.commands.registerCommand('loadDependency.openTerminal', (shell?: Shell) => openTerminal(shell).catch(report)),
    vscode.commands.registerCommand('loadDependency.refresh', async () => {
      try {
        const terminal = vscode.window.activeTerminal;
        if (!terminal || !await queue(terminal)) {
          void vscode.window.showInformationMessage('Select a Load Dependency default terminal, then press + to open a new terminal.');
        } else {
          void vscode.window.showInformationMessage('PATH refresh queued. Applies at the next prompt; in CMD run ld-refresh when idle.');
        }
      } catch (error) { report(error); }
    }),
    vscode.commands.registerCommand('loadDependency.diagnostics', () => {
      output.appendLine(`Load Dependency ${context.extension.packageJSON.version} (${context.extension.packageJSON.previewBuild ?? 'legacy preview'}).`);
      output.appendLine(`Default profile: ${defaultProfile() ?? '(automatic native default)'}. LD profile active: ${hasDefault() ? 'yes' : 'no'}. Auto-default setting: ${vscode.workspace.getConfiguration('loadDependency').get('autoDefaultTerminal', true) ? 'on' : 'off'}.`);
      output.appendLine(`Auto refresh for new terminals: ${enabled() ? 'on' : 'off'}. Managed terminals: ${sessions.size}.`);
      output.appendLine('The normal + button uses the configured default profile. Set Default Terminal changes it; Restore Previous Default Terminal restores the saved setting.');
      const activeSession = vscode.window.activeTerminal && sessions.get(vscode.window.activeTerminal);
      output.appendLine(`Active terminal hook: ${activeSession?.lastStatus ? 'confirmed by shell readiness marker' : activeSession ? 'not yet confirmed by the shell' : 'not loaded; use a new + terminal'}.`);
      for (const session of sessions.values()) output.appendLine(`${session.shell}: native events ${session.native ? 'connected' : 'unavailable; adapter fallback'}; ${session.lastStatus ?? 'shell startup not confirmed'}.`);
      output.appendLine('Preview: PATH/cache only. CMD wrappers cover simple interactive installs. WSL supports standard ~/.local/bin and ~/.cargo/bin; version-manager scripts need manual activation.');
      output.show(true);
    }),
    vscode.commands.registerCommand('loadDependency.restartExtensions', () => vscode.commands.executeCommand('workbench.action.restartExtensionHost')),
    vscode.window.onDidChangeActiveTerminal(updateStatus),
    vscode.window.onDidOpenTerminal(terminal => {
      const options = terminal.creationOptions as vscode.TerminalOptions;
      const directory = options.env?.LD_SESSION;
      const session = directory && pending.get(directory);
      if (session) track(terminal, session);
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('loadDependency.autoDefaultTerminal')) {
        void changeDefault(() => defaults.initialize()).catch(report);
      }
      if (event.affectsConfiguration('terminal.integrated.defaultProfile')) updateStatus();
      if (event.affectsConfiguration('loadDependency.enabled')) updateStatus();
    }),
    vscode.window.onDidChangeTerminalShellIntegration(event => {
      const session = sessions.get(event.terminal);
      if (session) { session.native = !!event.terminal.shellIntegration; updateStatus(); }
    }),
    vscode.window.onDidEndTerminalShellExecution(event => {
      if (seen.has(event.execution)) return;
      seen.add(event.execution);
      const line = event.execution.commandLine.value;
      if (!shouldRefresh(line, event.exitCode, enabled())) return;
      output.appendLine(`Native event: successful ${detectInstall(line)} installation detected.`);
      if (sessions.has(event.terminal)) void queue(event.terminal).catch(report);
      else output.appendLine('This existing terminal has no refresh hook. Press + after choosing a Load Dependency default.');
    }),
    vscode.window.onDidCloseTerminal(terminal => {
      const session = sessions.get(terminal);
      sessions.delete(terminal);
      if (session) void fs.rm(session.directory, { recursive: true, force: true }).catch(error => output.appendLine(`Session cleanup deferred: ${String(error)}`));
      updateStatus();
    }),
  );

  for (const profile of profiles) context.subscriptions.push(vscode.window.registerTerminalProfileProvider(profile.id, {
    async provideTerminalProfile(token) {
      output.appendLine(`Profile provider requested: ${profile.shell}`);
      const prepared = await prepareTerminal(profile.shell);
      if (token.isCancellationRequested) {
        pending.delete(prepared.session.directory);
        await fs.rm(prepared.session.directory, { recursive: true, force: true });
        return undefined;
      }
      return new vscode.TerminalProfile(prepared.options);
    },
  }));

  // Read only small result markers, never full shell output, commands or environment values.
  const timer = setInterval(() => {
    for (const session of sessions.values()) void fs.readFile(path.join(session.directory, 'status.json'), 'utf8').then(text => {
      if (disposed) return;
      const parsed = JSON.parse(text.replace(/^\uFEFF/, '')) as { result?: string; time?: string; reason?: string };
      if (parsed.result === 'refreshed' && typeof parsed.time === 'string') {
        session.startupFailed = false;
        const reasons: Record<string, string> = { startup: 'startup', manual: 'manual', requested: 'queued request', 'path-change': 'persisted PATH changed', 'install-command': 'successful install', 'shell-hook': 'shell hook' };
        const reason = reasons[parsed.reason ?? ''] ?? 'shell hook';
        const next = `PATH/cache refreshed at ${parsed.time} (${reason})`;
        if (session.lastStatus !== next) { session.lastStatus = next; output.appendLine(`${session.shell}: ${next}`); updateStatus(); }
      }
    }).catch(() => {
      if (!disposed && !session.lastStatus && !session.startupFailed && Date.now() - session.createdAt > 15000) {
        session.startupFailed = true;
        output.appendLine(`${session.shell}: no shell readiness marker after 15 seconds. The terminal is not confirmed as enabled.`);
        updateStatus();
      }
    });
  }, 1500);
  context.subscriptions.push({ dispose() { disposed = true; clearInterval(timer); } });
  await changeDefault(() => defaults.initialize()).catch(report);
  output.appendLine(hasDefault()
    ? 'Default profile configured. Press + for a new hooked terminal; existing native terminals are not hooked.'
    : 'Default profile is NOT configured for Load Dependency. Use Set Default Terminal or inspect Show Status.');
}
