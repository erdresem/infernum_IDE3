$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Code = if ($env:INFERNUM_CODE_OSS_DIR) { $env:INFERNUM_CODE_OSS_DIR } else { Join-Path $Root 'upstream\vscode' }
$Tag = '1.144.0'
if (-not (Test-Path (Join-Path $Code '.git'))) {
    $Parent = Split-Path -Parent $Code
    New-Item -ItemType Directory -Force -Path $Parent | Out-Null
    git clone --depth 1 --branch $Tag https://github.com/microsoft/vscode.git $Code
}
$Current = git -C $Code describe --tags --exact-match 2>$null
if ($Current -ne $Tag) { throw "Expected Code-OSS tag $Tag, found '$Current'." }
$NodeVersion = node -p "process.versions.node"
if ($NodeVersion -ne '24.22.1') { throw "Code-OSS 1.144.0 is pinned to Node 24.22.1; found $NodeVersion. Install from .nvmrc." }
Push-Location $Code
try {
    npm install
    node (Join-Path $Root 'tools\prepare-code-oss.mjs') $Code
    node (Join-Path $Root 'tools\sync-builtin-extensions.mjs') $Code
    npm run gulp -- vscode-win32-x64
} finally { Pop-Location }
$Out = Join-Path $Code '.build\VSCode-win32-x64'
if (-not (Test-Path $Out)) { throw "Build output not found: $Out" }
$Dist = Join-Path $Root 'dist'
New-Item -ItemType Directory -Force -Path $Dist | Out-Null
$Archive = Join-Path $Dist 'Infernum-IDE-0.7.0-Windows-x64.zip'
if (Test-Path $Archive) { Remove-Item $Archive -Force }
Compress-Archive -Path $Out -DestinationPath $Archive -CompressionLevel Optimal
Write-Host "Built: $Archive"
