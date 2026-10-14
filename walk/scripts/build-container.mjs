import { spawn } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Ordinary hosts: npm run docker:build
// Codex's proxy-backed cloud: npm run docker:build -- --cloud
// Only names and a public trust certificate are forwarded; no application keys.
const cloud = process.argv.includes('--cloud');
const args = ['build', '--progress=plain', '-t', 'walk:local'];
const environment = { ...process.env };
if (cloud) {
  environment.DOCKER_CONFIG ||= '/tmp/walk-docker-config';
  mkdirSync(environment.DOCKER_CONFIG, { recursive: true });
  args.push('--network=host');
  const hosts = new Set();
  for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY']) {
    if (!environment[name]) continue;
    args.push('--build-arg', name);
    if (name !== 'NO_PROXY') hosts.add(new URL(environment[name]).hostname);
  }
  for (const host of hosts) {
    const { address } = await lookup(host, { family: 4 });
    args.push('--add-host', `${host}:${address}`);
  }
}
const certificate = process.env.WALK_BUILD_CA || (cloud ? process.env.NODE_EXTRA_CA_CERTS : undefined);
if (certificate && existsSync(certificate)) args.push('--secret', `id=extra_ca,src=${certificate}`);
args.push('.');
const child = spawn('docker', args, { cwd: fileURLToPath(new URL('../', import.meta.url)), env: environment, stdio: 'inherit' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
