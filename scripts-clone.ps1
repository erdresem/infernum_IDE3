$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Dest = if ($args.Count -gt 0) { $args[0] } else { Join-Path $Root 'upstream\vscode' }
$Tag = '1.144.0'
$Branch = 'infernum/0.7.0'
if (-not (Test-Path (Join-Path $Dest '.git'))) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Dest) | Out-Null
    git clone --depth 1 --branch $Tag https://github.com/microsoft/vscode.git $Dest
}
$Current = git -C $Dest describe --tags --exact-match 2>$null
if ($Current -ne $Tag) { throw "Expected Code-OSS tag $Tag, found '$Current'." }
$BranchExists = git -C $Dest branch --list $Branch
if (-not $BranchExists) {
    git -C $Dest switch -c $Branch $Tag
} else {
    git -C $Dest switch $Branch
}
Write-Host "Code-OSS $Tag checked out on branch $Branch at $Dest"
