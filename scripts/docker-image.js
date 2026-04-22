#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));

function printHelp() {
  console.log(`Usage:
  node scripts/docker-image.js <command> [options]

Commands:
  help                      Show this help message
  check                     Validate resolved Docker image config
  build                     Build the Docker image locally
  push                      Build and push the Docker image

Options:
  --image <name>            Target image name
                            default: docker.io/jqknono/weread-challenge
  --tag <tag>               Primary tag
                            default: package.json version (${packageJson.version})
  --extra-tags <list>       Extra tags separated by commas
  --platform <platform>     Forwarded to docker build --platform
  --dockerfile <path>       Dockerfile path
                            default: Dockerfile
  --context <path>          Docker build context
                            default: .

Examples:
  node scripts/docker-image.js check
  node scripts/docker-image.js build --tag latest
  node scripts/docker-image.js push --tag ${packageJson.version}
  npm run docker:image:push -- --tag ${packageJson.version}
  npm run docker:image:push:dev`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  if (argv.length === 0) {
    return { command: 'help', options: {} };
  }

  const [commandToken, ...rest] = argv;
  const normalizedCommand = ['-h', '--help'].includes(commandToken)
    ? 'help'
    : commandToken;
  const commands = new Set(['help', 'check', 'build', 'push']);

  if (!commands.has(normalizedCommand)) {
    fail(`Unknown command: ${commandToken}`);
  }

  const options = {};
  const knownFlags = new Set([
    '--image',
    '--tag',
    '--extra-tags',
    '--platform',
    '--dockerfile',
    '--context'
  ]);

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (['-h', '--help'].includes(token)) {
      return { command: 'help', options: {} };
    }
    if (!knownFlags.has(token)) {
      fail(`Unknown option: ${token}`);
    }
    const value = rest[i + 1];
    if (!value || value.startsWith('--')) {
      fail(`Missing value for ${token}`);
    }
    options[token.slice(2)] = value;
    i += 1;
  }

  return { command: normalizedCommand, options };
}

function uniqueTags(tags) {
  return [...new Set(tags.filter(Boolean))];
}

function resolveConfig(rawOptions) {
  const image = rawOptions.image || process.env.DOCKER_IMAGE || 'docker.io/jqknono/weread-challenge';
  const tag = rawOptions.tag || process.env.DOCKER_TAG || packageJson.version;
  const extraTags = uniqueTags(
    (rawOptions['extra-tags'] || process.env.DOCKER_EXTRA_TAGS || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  );
  const dockerfile = path.resolve(ROOT_DIR, rawOptions.dockerfile || process.env.DOCKERFILE || 'Dockerfile');
  const context = path.resolve(ROOT_DIR, rawOptions.context || process.env.DOCKER_CONTEXT || '.');
  const platform = rawOptions.platform || process.env.DOCKER_PLATFORM || '';

  if (!image) {
    fail('Docker image name is required');
  }
  if (!tag) {
    fail('Docker tag is required');
  }
  if (!fs.existsSync(dockerfile)) {
    fail(`Dockerfile not found: ${dockerfile}`);
  }
  if (!fs.existsSync(context)) {
    fail(`Docker build context not found: ${context}`);
  }

  return {
    image,
    tag,
    extraTags: extraTags.filter((item) => item !== tag),
    dockerfile,
    context,
    platform
  };
}

function ensureDockerAvailable() {
  const result = spawnSync('docker', ['version'], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: 'pipe'
  });
  if (result.error) {
    fail(`Failed to run docker: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail((result.stderr || result.stdout || 'docker version failed').trim());
  }
}

function buildCommandArgs(config) {
  const args = ['build'];
  if (config.platform) {
    args.push('--platform', config.platform);
  }
  args.push('-f', config.dockerfile);
  config.buildTags.forEach((tag) => {
    args.push('-t', `${config.image}:${tag}`);
  });
  args.push(config.context);
  return args;
}

function printConfig(config) {
  console.log(`command: ${config.command}`);
  console.log(`image: ${config.image}`);
  console.log(`primary tag: ${config.tag}`);
  console.log(`extra tags: ${config.extraTags.length ? config.extraTags.join(', ') : '(none)'}`);
  console.log(`build tags: ${config.buildTags.join(', ')}`);
  console.log(`push tags: ${config.pushTags.length ? config.pushTags.join(', ') : '(none)'}`);
  console.log(`dockerfile: ${config.dockerfile}`);
  console.log(`context: ${config.context}`);
  console.log(`platform: ${config.platform || '(default)'}`);
}

function resolvePushTags(config) {
  if (config.command !== 'push') {
    return [];
  }
  const tags = [config.tag, ...config.extraTags];
  if (config.tag !== 'latest' && config.tag !== 'dev') {
    tags.push('latest');
  }
  return uniqueTags(tags);
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    stdio: 'inherit'
  });
  if (result.error) {
    fail(`Failed to run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === 'help') {
    printHelp();
    return;
  }

  const config = resolveConfig(options);
  config.command = command;
  config.pushTags = resolvePushTags(config);
  config.buildTags = command === 'push' ? config.pushTags : uniqueTags([config.tag, ...config.extraTags]);
  ensureDockerAvailable();
  printConfig(config);

  if (command === 'check') {
    console.log('docker image config is valid');
    return;
  }

  const buildArgs = buildCommandArgs(config);
  console.log(`running: docker ${buildArgs.join(' ')}`);
  runCommand('docker', buildArgs);

  if (command !== 'push') {
    return;
  }

  config.pushTags.forEach((tag) => {
    const pushArgs = ['push', `${config.image}:${tag}`];
    console.log(`running: docker ${pushArgs.join(' ')}`);
    runCommand('docker', pushArgs);
  });
}

main();
