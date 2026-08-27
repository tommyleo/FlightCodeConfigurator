$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$distDirectory = Join-Path $projectRoot "dist"

$publishFiles = @(
    "index.html",
    "styles.css",
    "model.css",
    "blackbox.css",
    "firmware-flasher.css",
    "app.js",
    "attitude-logic.js",
    "blackbox-logic.js",
    "diagnostic-logic.js",
    "firmware-flasher.js",
    "pico-flasher.js",
    "quad-renderer-logic.js",
    "quad-renderer.js",
    "serial-port-logic.js",
    "webusb-serial.js",
    "android-usb-serial.js",
    "web.config"
)

if (Test-Path -LiteralPath $distDirectory) {
    Remove-Item -LiteralPath $distDirectory -Recurse -Force
}
New-Item -ItemType Directory -Path $distDirectory | Out-Null

foreach ($relativePath in $publishFiles) {
    $sourcePath = Join-Path $projectRoot $relativePath
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
        throw "Missing publication file: $relativePath"
    }
    Copy-Item -LiteralPath $sourcePath -Destination $distDirectory
}

$assetsSource = Join-Path $projectRoot "assets"
if (-not (Test-Path -LiteralPath $assetsSource -PathType Container)) {
    throw "Missing publication directory: assets"
}
Copy-Item -LiteralPath $assetsSource -Destination $distDirectory -Recurse

$archivePath = Join-Path $distDirectory "web.zip"
$archiveEntries = Get-ChildItem -LiteralPath $distDirectory
Compress-Archive -Path $archiveEntries.FullName -DestinationPath $archivePath -CompressionLevel Optimal

Write-Host "Publication created in $distDirectory"
