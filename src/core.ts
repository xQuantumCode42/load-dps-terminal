// Conservative tokenization for recognition only. Never execute or replay these tokens.
export function detectInstall(line: string): string | undefined {
  if (/[\r\n`]/.test(line) || line.includes('$(')) return;
  const tokens: string[] = [];
  let word = '', quote = '';
  for (const char of line.trim()) {
    if (quote) { if (char === quote) quote = ''; else word += char; }
    else if (char === '"' || char === "'") quote = char;
    else if (/[;&|<>]/.test(char)) return;
    else if (/\s/.test(char)) { if (word) { tokens.push(word); word = ''; } }
    else word += char;
  }
  if (quote) return;
  if (word) tokens.push(word);
  if (tokens[0] === 'sudo') tokens.shift();
  const executable = (tokens.shift() ?? '').split(/[\\/]/).pop()!.replace(/\.(exe|cmd|bat)$/i, '').toLowerCase();
  if (/^(python[\d.]*|py)$/.test(executable)) {
    if (executable === 'py' && /^-\d/.test(tokens[0] ?? '')) tokens.shift();
    return tokens[0] === '-m' && tokens[1] === 'pip' && tokens[2] === 'install' ? 'pip' : undefined;
  }
  const actions: Record<string, string[]> = {
    winget: ['install', 'upgrade'], choco: ['install', 'upgrade'], scoop: ['install', 'update'],
    npm: ['install', 'i', 'ci', 'update'], pnpm: ['install', 'i', 'add', 'update'],
    yarn: ['install', 'add', 'upgrade'], pip: ['install'], pip3: ['install'],
    cargo: ['install'], apt: ['install', 'upgrade'], 'apt-get': ['install', 'upgrade'],
    brew: ['install', 'upgrade'],
  };
  if (executable === 'uv') return /^(tool|pip)$/.test(tokens[0] ?? '') && tokens[1] === 'install' ? 'uv' : undefined;
  if (executable === 'dotnet') return tokens[0] === 'tool' && /^(install|update)$/.test(tokens[1] ?? '') ? 'dotnet' : undefined;
  if (executable === 'yarn' && tokens[0] === 'global') tokens.shift();
  return actions[executable]?.includes(tokens[0]) ? executable : undefined;
}

export function shouldRefresh(line: string, exit: number | undefined, enabled: boolean): boolean {
  return enabled && exit === 0 && detectInstall(line) !== undefined;
}
