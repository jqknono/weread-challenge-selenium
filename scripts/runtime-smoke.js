#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function showHelp() {
  console.log(`
Usage:
  node scripts/runtime-smoke.js <command>

Commands:
  npx     Pack the current repo and verify the CLI can be launched by npx.
  docker  Build the local Docker image and verify the container CLI entrypoint.
  all     Run both smoke scenarios in sequence.
  help    Show this help text.
`.trim());
}

function formatCommand(command, args) {
  return [command, ...args].join(' ');
}

function quoteForWindowsCmd(value) {
  const stringValue = String(value);
  if (stringValue.length === 0) {
    return '""';
  }

  if (!/[ \t"&()<>^|]/.test(stringValue)) {
    return stringValue;
  }

  return `"${stringValue.replace(/"/g, '""')}"`;
}

function runCommand(command, args, options = {}) {
  console.log(`> ${formatCommand(command, args)}`);
  const baseOptions = {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    ...options,
  };
  const result =
    process.platform === 'win32' && command.endsWith('.cmd')
      ? spawnSync(process.env.ComSpec || 'cmd.exe', [
          '/d',
          '/s',
          '/c',
          [quoteForWindowsCmd(command), ...args.map(quoteForWindowsCmd)].join(' '),
        ], baseOptions)
      : spawnSync(command, args, baseOptions);

  if (result.error) {
    throw result.error;
  }

  const combinedOutput = `${result.stdout || ''}${result.stderr || ''}`.trim();
  if (combinedOutput) {
    console.log(combinedOutput);
  }

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${formatCommand(command, args)}`);
  }

  return combinedOutput;
}

function assertHelpOutput(output, label) {
  const expectedTokens = ['weread-selenium-cli run', 'schedule', 'help'];
  const missing = expectedTokens.filter((token) => !output.includes(token));
  if (missing.length > 0) {
    throw new Error(`${label} output is missing: ${missing.join(', ')}`);
  }
}

function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function packCurrentRepo(tempDir) {
  runCommand(npmCmd, ['pack', '--pack-destination', tempDir]);
  const tarballs = fs.readdirSync(tempDir).filter((file) => file.endsWith('.tgz'));
  if (tarballs.length !== 1) {
    throw new Error(`Expected exactly one tarball in ${tempDir}, got ${tarballs.length}`);
  }

  const tarballPath = path.join(tempDir, tarballs[0]);
  return tarballPath;
}

function runNpxSmoke() {
  const tempDir = createTempDir('weread-npx-smoke-');

  try {
    const tarballPath = packCurrentRepo(tempDir);
    const mainHelp = runCommand(npxCmd, ['--yes', '--package', tarballPath, 'weread-selenium-cli', '-h']);
    assertHelpOutput(mainHelp, 'npx weread-selenium-cli -h');

    const aliasHelp = runCommand(npxCmd, ['--yes', '--package', tarballPath, 'weread-challenge', '-h']);
    assertHelpOutput(aliasHelp, 'npx weread-challenge -h');

    console.log('Smoke passed: npx package entrypoints are runnable.');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function runDockerSmoke() {
  const imageTag = `weread-runtime-smoke:${Date.now()}`;

  try {
    runCommand('docker', ['build', '-t', imageTag, '.']);
    const helpOutput = runCommand('docker', ['run', '--rm', imageTag, 'node', 'app.js', '-h']);
    assertHelpOutput(helpOutput, 'docker run <image> node app.js -h');
    console.log('Smoke passed: Docker image entrypoint is runnable.');
  } finally {
    spawnSync('docker', ['image', 'rm', '-f', imageTag], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  }
}

function main() {
  const command = process.argv[2] || 'help';

  switch (command) {
    case 'help':
      showHelp();
      return;
    case 'npx':
      runNpxSmoke();
      return;
    case 'docker':
      runDockerSmoke();
      return;
    case 'all':
      runNpxSmoke();
      runDockerSmoke();
      console.log('Smoke passed: all runtime scenarios succeeded.');
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
