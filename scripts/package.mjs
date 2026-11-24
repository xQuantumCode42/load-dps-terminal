import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const file = `load-dependency-${manifest.version}.vsix`;
mkdirSync('release', { recursive: true });
const result = spawnSync(process.execPath, [
  'node_modules/@vscode/vsce/vsce', 'package', '--allow-missing-repository',
  '--no-dependencies', '--out', `release/${file}`,
], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const digest = createHash('sha256').update(readFileSync(`release/${file}`)).digest('hex');
writeFileSync('release/SHA256SUMS', `${digest}  ${file}\n`);
