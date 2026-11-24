export type Shell = 'powershell' | 'pwsh' | 'cmd' | 'wsl' | 'bash';

export const profiles: { shell: Shell; id: string; title: string; label: string }[] = [
  { shell: 'powershell', id: 'loadDependency.powershell', title: 'Load Dependency: Windows PowerShell', label: 'Windows PowerShell' },
  { shell: 'pwsh', id: 'loadDependency.pwsh', title: 'Load Dependency: PowerShell 7', label: 'PowerShell 7' },
  { shell: 'cmd', id: 'loadDependency.cmd', title: 'Load Dependency: Command Prompt', label: 'Command Prompt' },
  { shell: 'wsl', id: 'loadDependency.wsl', title: 'Load Dependency: Ubuntu / WSL', label: 'Ubuntu / WSL' },
  { shell: 'bash', id: 'loadDependency.bash', title: 'Load Dependency: Bash', label: 'Bash' },
];

export function detectDefaultShell(title: string | null | undefined, shellPath: string, custom?: unknown): Shell | undefined {
  const owned = profiles.find(profile => profile.title === title);
  if (owned) return owned.shell;
  let explicitPath = false;
  let source: string | undefined;
  if (custom && typeof custom === 'object') {
    const config = custom as { path?: unknown; source?: string; args?: unknown; env?: unknown };
    source = config.source;
    // Do not silently drop startup commands, distro arguments or custom environment overrides.
    if (config.args && (!Array.isArray(config.args) || config.args.length > 0)) return;
    if (config.env && Object.keys(config.env).length > 0) return;
    const builtInCmdFallback = Array.isArray(config.path) && config.path.length === 2 &&
      typeof config.path[0] === 'string' && typeof config.path[1] === 'string' &&
      /^\$\{env:windir\}\\Sysnative\\cmd\.exe$/i.test(config.path[0]) &&
      /^\$\{env:windir\}\\System32\\cmd\.exe$/i.test(config.path[1]);
    if (builtInCmdFallback) { shellPath = 'cmd.exe'; explicitPath = true; }
    else if (config.path !== undefined && typeof config.path !== 'string') return;
    if (typeof config.path === 'string') { shellPath = config.path; explicitPath = true; }
  } else if (title && !/^(Windows PowerShell|PowerShell(?: 7)?|Command Prompt|cmd|Ubuntu(?:[ -][\d.]+)?(?: \(WSL\))?|WSL|bash)$/i.test(title)) {
    return;
  }
  const executable = shellPath.split(/[\\/]/).pop()?.toLowerCase();
  if (!explicitPath) {
    // A detected Ubuntu profile can target a named distro. Bare wsl.exe targets
    // the system default, which may be Debian or another Ubuntu installation.
    if (/^Ubuntu(?:[ -][\d.]+)?(?: \(WSL\))?$/i.test(title ?? '')) return;
    if (/^Windows PowerShell$/i.test(title ?? '')) return 'powershell';
    if (/^PowerShell 7$/i.test(title ?? '')) return 'pwsh';
    if (/^PowerShell$/i.test(title ?? '') || source === 'PowerShell') return executable === 'pwsh.exe' || executable === 'pwsh' ? 'pwsh' : 'powershell';
    if (/^(Command Prompt|cmd)$/i.test(title ?? '')) return 'cmd';
    if (/^WSL$/i.test(title ?? '')) return 'wsl';
  }
  if (executable === 'powershell.exe') return 'powershell';
  if (executable === 'pwsh.exe' || executable === 'pwsh') return 'pwsh';
  if (executable === 'cmd.exe' || executable === '%comspec%') return 'cmd';
  if (executable === 'wsl.exe') return 'wsl';
  if (executable === 'bash' && !/^[a-z]:/i.test(shellPath)) return 'bash';
  return;
}
