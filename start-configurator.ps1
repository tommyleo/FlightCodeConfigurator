$configuratorRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$localUrl = "http://localhost:8080/?build=20260805-3&session=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"

function Test-ConfiguratorServer {
    try {
        $response = Invoke-WebRequest -UseBasicParsing `
            -Uri "http://localhost:8080/app.js?v=20260805-3" `
            -TimeoutSec 1
        return $response.StatusCode -eq 200 -and
            $response.Content.Contains("GET_BLACKBOX_CATALOG")
    } catch {
        return $false
    }
}

if (-not (Test-ConfiguratorServer)) {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) {
        $python = Get-Command py -ErrorAction Stop
    }
    Start-Process -FilePath $python.Source `
        -ArgumentList @("-m", "http.server", "8080") `
        -WorkingDirectory $configuratorRoot `
        -WindowStyle Hidden

    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 100
        if (Test-ConfiguratorServer) {
            $ready = $true
            break
        }
    }
    if (-not $ready) {
        Add-Type -AssemblyName PresentationFramework
        [System.Windows.MessageBox]::Show(
            "FlightCode Configurator could not start on localhost:8080.",
            "FlightCode Configurator") | Out-Null
        exit 1
    }
}

Start-Process $localUrl
