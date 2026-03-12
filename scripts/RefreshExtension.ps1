$ProgressPreference = 'SilentlyContinue'

$cwd = Get-Location
$fileBasename = [System.IO.Path]::GetFileName($cwd)
# $gnomeExtensionsPath = "$env:HOME/.local/share/gnome-shell/extensions"
# $extensionPath = Join-Path $gnomeExtensionsPath $fileBasename
$zipPath = "$cwd.shell-extension.zip"

$sleepSeconds = 0 # No sleep initially, but will be set to 5 seconds after the first iteration

while ($true) {

    # Wait between iterations to avoid excessive CPU usage
    Start-Sleep -Seconds $sleepSeconds; $sleepSeconds = 5

    # Clear the host to keep the console output clean
    Clear-Host

    if (Test-Path $zipPath) {
        Write-Host "Removing existing zip file: $zipPath"
        Remove-Item $zipPath| Out-Null
    }

    # if (Test-Path $extensionPath) {
    #     Write-Host "Removing existing extension: $extensionPath"
    #     Remove-Item $extensionPath -Recurse| Out-Null
    # }

    # Create the zip file
    Write-Host "Packing the extension into a zip file: $zipPath"

    $tempZipFolder = Join-Path $cwd "zip_temp"

    if (Test-Path $tempZipFolder) {
        Write-Host "Removing existing zip_temp folder: $tempZipFolder"
        Remove-Item $tempZipFolder -Recurse -Force| Out-Null
    }

    New-Item -ItemType Directory -Path $tempZipFolder | Out-Null

    Get-ChildItem -Path $cwd -Recurse -Filter *.js |
        Where-Object { $_.FullName -notmatch '/zip_temp/' } |
        ForEach-Object {
            $relativePath = $_.FullName.Substring($cwd.Path.Length+1)
            $destPath = Join-Path $tempZipFolder $relativePath
            New-Item -ItemType Directory -Path (Split-Path $destPath) -Force | Out-Null
            Copy-Item $_.FullName -Destination $destPath
        }

    Copy-Item (Join-Path $cwd "metadata.json") $tempZipFolder
    Copy-Item (Join-Path $cwd "stylesheet.css") $tempZipFolder

    Push-Location $tempZipFolder
    Compress-Archive -Path * -DestinationPath $zipPath -Force
    Pop-Location

    if (-not(Test-Path $zipPath)) {
        continue
    }

    # Install the extension
    Write-Host "Installing the extension: $zipPath"
    gnome-extensions install $zipPath --force

    # Enable the extension
    Write-Host "Enabling the extension: $fileBasename"
    gnome-extensions enable $fileBasename

    # Clean up the temporary zip folder
    if (Test-Path $tempZipFolder) {
        Write-Host "Removing existing zip_temp folder: $tempZipFolder"
        Remove-Item $tempZipFolder -Recurse -Force| Out-Null
    }
}