$ErrorActionPreference = "Stop"
$ProjectRoot = "c:\Users\suraj\OneDrive\Desktop\DeployIQ"
$OutputDir   = Join-Path $ProjectRoot "parts_12"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  DeployIQ -- Git Push + 12-Part Split" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $ProjectRoot

# STEP 1: Git push
Write-Host "[1/3] Staging and pushing to GitHub..." -ForegroundColor Yellow

git add .

$statusLines = git status --short
if ($statusLines) {
    git commit -m "chore: update codebase -- split-ready (12 parts)"
    git push origin main
    Write-Host "      OK: Pushed to GitHub." -ForegroundColor Green
} else {
    Write-Host "      INFO: Nothing new to commit. Repo is already up-to-date." -ForegroundColor Cyan
}

# STEP 2: Collect files
Write-Host ""
Write-Host "[2/3] Collecting tracked project files..." -ForegroundColor Yellow

$IncludedItems = @(
    "index.html",
    "app.js",
    "features.js",
    "styles.css",
    "styles-extra.css",
    "styles-chat.css",
    "styles-lang.css",
    "config.js",
    "generate_config.py",
    "requirements.txt",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "Dockerfile",
    "docker-compose.yml",
    "vercel.json",
    "render.yaml",
    "railway.toml",
    "upload_parts.py",
    "README.md",
    ".env.example",
    ".gitignore",
    "backend",
    "src",
    "supabase",
    ".github"
)

$AllFiles = @()
foreach ($item in $IncludedItems) {
    $fullPath = Join-Path $ProjectRoot $item
    if (Test-Path $fullPath -PathType Container) {
        $files = Get-ChildItem -Path $fullPath -Recurse -File |
            Where-Object { ($_.FullName -notmatch "__pycache__") -and ($_.Extension -ne ".pyc") }
        foreach ($f in $files) {
            $AllFiles += $f.FullName
        }
    } elseif (Test-Path $fullPath -PathType Leaf) {
        $AllFiles += $fullPath
    }
}

$TotalFiles = $AllFiles.Count
Write-Host "      Found $TotalFiles files to package." -ForegroundColor Green

# STEP 3: Create 12 ZIP parts
Write-Host ""
Write-Host "[3/3] Creating 12 ZIP parts in '$OutputDir'..." -ForegroundColor Yellow

if (Test-Path $OutputDir) { Remove-Item $OutputDir -Recurse -Force }
New-Item -ItemType Directory -Path $OutputDir | Out-Null

$PartCount   = 12
$FilesPerPart = [math]::Ceiling($TotalFiles / $PartCount)

for ($i = 0; $i -lt $PartCount; $i++) {
    $partNum  = $i + 1
    $zipName  = "DeployIQ_Part{0:D2}_of_{1}.zip" -f $partNum, $PartCount
    $zipPath  = Join-Path $OutputDir $zipName

    $start = $i * $FilesPerPart
    $end   = [math]::Min($start + $FilesPerPart - 1, $TotalFiles - 1)

    if ($start -gt ($TotalFiles - 1)) {
        Write-Host ("      Part {0:D2}: (empty -- skipped)" -f $partNum) -ForegroundColor DarkGray
        continue
    }

    $chunk = $AllFiles[$start..$end]

    # Staging folder
    $tempDir = Join-Path $env:TEMP ("deployiq_part_" + $partNum)
    if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
    New-Item -ItemType Directory -Path $tempDir | Out-Null

    foreach ($file in $chunk) {
        $relative = $file.Substring($ProjectRoot.Length).TrimStart('\', '/')
        $dest     = Join-Path $tempDir $relative
        $destDir  = Split-Path $dest -Parent
        if (-not (Test-Path $destDir)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }
        Copy-Item -Path $file -Destination $dest -Force
    }

    # Manifest
    $fileList = ($chunk | ForEach-Object { "  " + $_.Substring($ProjectRoot.Length).TrimStart('\', '/') }) -join "`n"
    $manifest = "DeployIQ -- Part $partNum of $PartCount`n"
    $manifest += "================================`n"
    $manifest += "Files in this archive : $($chunk.Count)`n"
    $manifest += "Total project files   : $TotalFiles`n"
    $manifest += "Generated             : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n`n"
    $manifest += "Files included:`n$fileList`n"
    $manifest | Out-File -FilePath (Join-Path $tempDir ("MANIFEST_PART" + $partNum + ".txt")) -Encoding UTF8

    Compress-Archive -Path "$tempDir\*" -DestinationPath $zipPath -CompressionLevel Optimal
    Remove-Item $tempDir -Recurse -Force

    $sizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
    Write-Host ("      OK Part {0:D2}/{1}: {2} files  {3} MB  [{4}]" -f $partNum, $PartCount, $chunk.Count, $sizeMB, $zipName) -ForegroundColor Green
}

# Summary
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  All done!" -ForegroundColor Green
Write-Host "  Parts saved: $OutputDir" -ForegroundColor White
Write-Host "  GitHub    : https://github.com/Suraj-kummar/DeployIQ" -ForegroundColor White
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Generated ZIP files:" -ForegroundColor Yellow
Get-ChildItem $OutputDir -Filter "*.zip" | Sort-Object Name | ForEach-Object {
    $mb = [math]::Round($_.Length / 1MB, 2)
    Write-Host ("  {0,-45}  {1} MB" -f $_.Name, $mb)
}
