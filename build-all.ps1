param([switch]$SkipAndroidBuild)
$ErrorActionPreference = "Stop"
$userAndroidHome = [Environment]::GetEnvironmentVariable("ANDROID_HOME", "User")
$userJavaHome = [Environment]::GetEnvironmentVariable("JAVA_HOME", "User")
if (-not $env:ANDROID_HOME -and $userAndroidHome) { $env:ANDROID_HOME = $userAndroidHome }
if (-not $env:ANDROID_HOME) {
    $defaultAndroidHome = Join-Path $env:LOCALAPPDATA "Android\Sdk"
    if (Test-Path -LiteralPath $defaultAndroidHome) { $env:ANDROID_HOME = $defaultAndroidHome }
}
if (-not $env:ANDROID_SDK_ROOT -and $env:ANDROID_HOME) { $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME }
if (-not $env:JAVA_HOME -and $userJavaHome) { $env:JAVA_HOME = $userJavaHome }
if (-not $env:JAVA_HOME) {
    $installedJdk = Get-ChildItem "C:\Program Files\Microsoft" -Directory -Filter "jdk-17*" -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | Select-Object -First 1
    if ($installedJdk) { $env:JAVA_HOME = $installedJdk.FullName }
}
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $projectRoot "build-dist.ps1")

$outputRoot = Join-Path $projectRoot "output"
$desktopRoot = Join-Path $outputRoot "desktop"
$mobileRoot = Join-Path $outputRoot "mobile"
foreach ($directory in @($desktopRoot,$mobileRoot)) {
    if (Test-Path -LiteralPath $directory) { Remove-Item -LiteralPath $directory -Recurse -Force }
    New-Item -ItemType Directory -Path $directory | Out-Null
}

Get-ChildItem (Join-Path $projectRoot "dist") -Exclude web.zip | Copy-Item -Destination $desktopRoot -Recurse
Compress-Archive -Path (Join-Path $desktopRoot "*") -DestinationPath (Join-Path $outputRoot "desktop.zip") -Force

$androidRoot = Join-Path $projectRoot "android"
$assetRoot = Join-Path $androidRoot "app\src\main\assets\configurator"
if (Test-Path -LiteralPath $assetRoot) { Remove-Item -LiteralPath $assetRoot -Recurse -Force }
New-Item -ItemType Directory -Path $assetRoot | Out-Null
Get-ChildItem (Join-Path $projectRoot "dist") -Exclude web.zip,web.config | Copy-Item -Destination $assetRoot -Recurse
$mobileAppRoot = Join-Path $mobileRoot "app"
New-Item -ItemType Directory -Path $mobileAppRoot -Force | Out-Null
foreach ($androidFile in @("build.gradle","settings.gradle","gradlew","gradlew.bat")) {
    Copy-Item -LiteralPath (Join-Path $androidRoot $androidFile) -Destination $mobileRoot -Force
}
Copy-Item -LiteralPath (Join-Path $androidRoot "gradle") -Destination $mobileRoot -Recurse -Force
Copy-Item -LiteralPath (Join-Path $androidRoot "app\build.gradle") -Destination $mobileAppRoot -Force
Copy-Item -LiteralPath (Join-Path $androidRoot "app\src") -Destination $mobileAppRoot -Recurse -Force

if (-not $SkipAndroidBuild) {
    $gradle = Join-Path $androidRoot "gradlew.bat"
    if (Test-Path $gradle) { & $gradle -p $androidRoot assembleDebug }
    elseif (Get-Command gradle -ErrorAction SilentlyContinue) { & gradle -p $androidRoot assembleDebug }
    else { throw "Android Gradle is unavailable. Install Android Studio/Gradle or run with -SkipAndroidBuild." }
    if ($LASTEXITCODE -ne 0) { throw "Android build failed." }
    Copy-Item (Join-Path $androidRoot "app\build\outputs\apk\debug\app-debug.apk") (Join-Path $outputRoot "FlightCodeConfigurator-debug.apk") -Force
    $releaseSigning = Join-Path $androidRoot "release-signing.properties"
    if (Test-Path -LiteralPath $releaseSigning) {
        & $gradle -p $androidRoot bundleRelease
        if ($LASTEXITCODE -ne 0) { throw "Android release bundle build failed." }
        Copy-Item (Join-Path $androidRoot "app\build\outputs\bundle\release\app-release.aab") (Join-Path $outputRoot "FlightCodeConfigurator-release.aab") -Force
    }
}
Write-Host "Web:     $(Join-Path $projectRoot 'dist')"
Write-Host "Desktop: $desktopRoot"
Write-Host "Mobile:  $mobileRoot"
