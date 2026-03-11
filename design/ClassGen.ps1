#!/usr/bin/env pwsh

Set-Location -Path $PSScriptRoot

while ($true) {
    & "/home/philip/Programming/ClassGen/CSharp/ClassGen/bin/Debug/net8.0/ClassGen" -ConfigFile "ClassGen.Config.json"; 
    
    Write-Host "Sleeping..."; 
    
    Start-Sleep -Seconds 5;
}