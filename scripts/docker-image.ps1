#!/usr/bin/env pwsh
#requires -Version 7
<#
.SYNOPSIS
  weread-challenge-selenium Docker 镜像构建与发布工具（docker-image.js 的 PowerShell 移植版）。

.DESCRIPTION
  提供三个子命令：check / build / push，行为与 scripts/docker-image.js 一致。
  不带参数执行时显示 help。

.EXAMPLE
  pwsh scripts/docker-image.ps1 check
  pwsh scripts/docker-image.ps1 build --tag latest
  pwsh scripts/docker-image.ps1 push --tag 0.18.0
  pwsh scripts/docker-image.ps1 push --tag dev
#>

$ErrorActionPreference = 'Stop'

$RootDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$PackageJsonPath = Join-Path $RootDir 'package.json'
$PackageJson = Get-Content $PackageJsonPath -Raw | ConvertFrom-Json
$PackageVersion = $PackageJson.version

function Print-Help {
  Write-Output @"
Usage:
  pwsh scripts/docker-image.ps1 <command> [options]

Commands:
  help                      Show this help message
  check                     Validate resolved Docker image config
  build                     Build the Docker image locally
  push                      Build and push the Docker image

Options:
  --image <name>            Target image name
                            default: docker.io/jqknono/weread-challenge
  --tag <tag>               Primary tag
                            default: package.json version ($PackageVersion)
  --extra-tags <list>       Extra tags separated by commas
  --platform <platform>     Forwarded to docker build --platform
  --dockerfile <path>       Dockerfile path
                            default: Dockerfile
  --context <path>          Docker build context
                            default: .

Examples:
  pwsh scripts/docker-image.ps1 check
  pwsh scripts/docker-image.ps1 build --tag latest
  pwsh scripts/docker-image.ps1 push --tag $PackageVersion
  npm run docker:image:push -- --tag $PackageVersion
  npm run docker:image:push:dev
"@
}

function Fail([string]$Message) {
  Write-Error $Message
  exit 1
}

function Parse-Args([string[]]$ArgList) {
  if ($ArgList.Count -eq 0) {
    return @{ command = 'help'; options = @{} }
  }

  $commandToken = $ArgList[0]
  $normalizedCommand = if ($commandToken -in @('-h', '--help')) { 'help' } else { $commandToken }
  $validCommands = @('help', 'check', 'build', 'push')
  if ($normalizedCommand -notin $validCommands) {
    Fail "Unknown command: $commandToken"
  }

  $options = @{}
  $knownFlags = @('--image', '--tag', '--extra-tags', '--platform', '--dockerfile', '--context')
  $rest = if ($ArgList.Count -gt 1) { $ArgList[1..($ArgList.Count - 1)] } else { @() }

  for ($i = 0; $i -lt $rest.Count; $i += 1) {
    $token = $rest[$i]
    if ($token -in @('-h', '--help')) {
      return @{ command = 'help'; options = @{} }
    }
    if ($token -notin $knownFlags) {
      Fail "Unknown option: $token"
    }
    $value = if ($i + 1 -lt $rest.Count) { $rest[$i + 1] } else { $null }
    if (-not $value -or $value.StartsWith('--')) {
      Fail "Missing value for $token"
    }
    $options[$token.Substring(2)] = $value
    $i += 1
  }

  return @{ command = $normalizedCommand; options = $options }
}

function Unique-Tags([string[]]$Tags) {
  return ($Tags | Where-Object { $_ } | Select-Object -Unique)
}

function Resolve-Config([hashtable]$RawOptions) {
  $image = if ($RawOptions.Contains('image')) { $RawOptions.image } elseif ($env:DOCKER_IMAGE) { $env:DOCKER_IMAGE } else { 'docker.io/jqknono/weread-challenge' }
  $tag = if ($RawOptions.Contains('tag')) { $RawOptions.tag } elseif ($env:DOCKER_TAG) { $env:DOCKER_TAG } else { $PackageVersion }
  $extraTagsRaw = if ($RawOptions.Contains('extra-tags')) { $RawOptions['extra-tags'] } elseif ($env:DOCKER_EXTRA_TAGS) { $env:DOCKER_EXTRA_TAGS } else { '' }
  $extraTags = Unique-Tags ($extraTagsRaw -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  $dockerfileRaw = if ($RawOptions.Contains('dockerfile')) { $RawOptions.dockerfile } elseif ($env:DOCKERFILE) { $env:DOCKERFILE } else { 'Dockerfile' }
  $contextRaw = if ($RawOptions.Contains('context')) { $RawOptions.context } elseif ($env:DOCKER_CONTEXT) { $env:DOCKER_CONTEXT } else { '.' }
  $dockerfile = (Resolve-Path (Join-Path $RootDir $dockerfileRaw) -ErrorAction SilentlyContinue)
  $context = (Resolve-Path (Join-Path $RootDir $contextRaw) -ErrorAction SilentlyContinue)
  $platform = if ($RawOptions.Contains('platform')) { $RawOptions.platform } elseif ($env:DOCKER_PLATFORM) { $env:DOCKER_PLATFORM } else { '' }

  if (-not $image) { Fail 'Docker image name is required' }
  if (-not $tag) { Fail 'Docker tag is required' }
  if (-not $dockerfile) { Fail "Dockerfile not found: $dockerfileRaw" }
  if (-not $context) { Fail "Docker build context not found: $contextRaw" }

  return @{
    image      = $image
    tag        = $tag
    extraTags  = ($extraTags | Where-Object { $_ -ne $tag })
    dockerfile = $dockerfile.Path
    context    = $context.Path
    platform   = $platform
  }
}

function Ensure-DockerAvailable {
  $result = & docker version 2>&1
  if ($LASTEXITCODE -ne 0) {
    Fail (($result | Out-String).Trim())
  }
}

function Build-CommandArgs([hashtable]$Config) {
  $cmdArgs = @('build')
  if ($Config.platform) {
    $cmdArgs += @('--platform', $Config.platform)
  }
  $cmdArgs += @('-f', $Config.dockerfile)
  foreach ($tag in $Config.buildTags) {
    $cmdArgs += @('-t', "$($Config.image):$tag")
  }
  $cmdArgs += $Config.context
  return $cmdArgs
}

function Print-Config([hashtable]$Config) {
  $extraTagsStr = if ($Config.extraTags.Count) { $Config.extraTags -join ', ' } else { '(none)' }
  $pushTagsStr = if ($Config.pushTags.Count) { $Config.pushTags -join ', ' } else { '(none)' }
  $platformStr = if ($Config.platform) { $Config.platform } else { '(default)' }
  Write-Output "command: $($Config.command)"
  Write-Output "image: $($Config.image)"
  Write-Output "primary tag: $($Config.tag)"
  Write-Output "extra tags: $extraTagsStr"
  Write-Output "build tags: $($Config.buildTags -join ', ')"
  Write-Output "push tags: $pushTagsStr"
  Write-Output "dockerfile: $($Config.dockerfile)"
  Write-Output "context: $($Config.context)"
  Write-Output "platform: $platformStr"
}

function Resolve-PushTags([hashtable]$Config) {
  if ($Config.command -ne 'push') {
    return @()
  }
  $tags = @($Config.tag) + $Config.extraTags
  if ($Config.tag -ne 'latest' -and $Config.tag -ne 'dev') {
    $tags += 'latest'
  }
  return Unique-Tags $tags
}

function Run-Command([string]$Command, [string[]]$CmdArgs) {
  & $Command @CmdArgs
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

$parsed = Parse-Args $args
if ($parsed.command -eq 'help') {
  Print-Help
  exit 0
}

$config = Resolve-Config $parsed.options
$config.command = $parsed.command
$config.pushTags = Resolve-PushTags $config
if ($parsed.command -eq 'push') {
  $config.buildTags = $config.pushTags
} else {
  $config.buildTags = Unique-Tags (@($config.tag) + $config.extraTags)
}

Ensure-DockerAvailable
Print-Config $config

if ($parsed.command -eq 'check') {
  Write-Output 'docker image config is valid'
  exit 0
}

$buildArgs = Build-CommandArgs $config
Write-Output "running: docker $($buildArgs -join ' ')"
Run-Command 'docker' $buildArgs

if ($parsed.command -ne 'push') {
  exit 0
}

foreach ($tag in $config.pushTags) {
  $pushArgs = @('push', "$($config.image):$tag")
  Write-Output "running: docker $($pushArgs -join ' ')"
  Run-Command 'docker' $pushArgs
}
