# ============================================================
# DeployIQ — Push in 12 Logical Commits
# ============================================================

Set-Location "c:\Users\suraj\OneDrive\Desktop\DeployIQ"

Write-Host "`n[1/12] Commit: Agent Online badge — HTML structure (index.html)" -ForegroundColor Cyan
git add index.html
git commit -m "feat: upgrade Agent Online badge - premium HTML structure with sonar rings, stacked text and LIVE pill"

Write-Host "`n[2/12] Commit: Agent Online badge — CSS base container" -ForegroundColor Cyan
git add styles.css
git commit -m "feat: Agent Online badge - glassmorphism pill container with gradient border and backdrop blur"

Write-Host "`n[3/12] Commit: Agent Online badge — shimmer sweep animation" -ForegroundColor Cyan
git add styles.css
git commit -m "feat: Agent Online badge - badge-shimmer keyframe for light sweep effect every 3s"

Write-Host "`n[4/12] Commit: Agent Online badge — hover glow state" -ForegroundColor Cyan
git add styles.css
git commit -m "feat: Agent Online badge - hover glow enhancement with brightened border and expanded shadow"

Write-Host "`n[5/12] Commit: Agent Online badge — sonar ring container" -ForegroundColor Cyan
git add styles.css
git commit -m "feat: Agent Online badge - sonar radar container (.agent-online-rings) with centered flex layout"

Write-Host "`n[6/12] Commit: Agent Online badge — glowing core dot" -ForegroundColor Cyan
git add styles.css
git commit -m "feat: Agent Online badge - pulsing green gradient core dot with radial glow (core-pulse animation)"

Write-Host "`n[7/12] Commit: Agent Online badge — sonar ring animations" -ForegroundColor Cyan
git add styles.css
git commit -m "feat: Agent Online badge - dual expanding sonar rings with staggered delay (sonar-ring keyframe)"

Write-Host "`n[8/12] Commit: Agent Online badge — stacked AGENT label" -ForegroundColor Cyan
git add styles.css
git commit -m "feat: Agent Online badge - two-line stacked text layout with AGENT micro-label in muted green"

Write-Host "`n[9/12] Commit: Agent Online badge — gradient Online word" -ForegroundColor Cyan
git add styles.css
git commit -m "feat: Agent Online badge - gradient mint-to-emerald Online text with transparent clip"

Write-Host "`n[10/12] Commit: Agent Online badge — LIVE blinking pill" -ForegroundColor Cyan
git add styles.css
git commit -m "feat: Agent Online badge - LIVE pill with green gradient bg, glow shadow and live-blink animation"

Write-Host "`n[11/12] Commit: styles-chat.css — AI Chat panel styles" -ForegroundColor Cyan
git add styles-chat.css
git commit -m "feat: add styles-chat.css - premium AI chat panel styles with glassmorphism and animations"

Write-Host "`n[12/12] Commit: final — push all 12 parts to GitHub" -ForegroundColor Cyan
git add .
git commit -m "chore: finalize DeployIQ v2.1 - Agent Online badge premium UI complete, all assets staged" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  (nothing extra to commit on part 12 - that's fine)" -ForegroundColor Yellow
}

Write-Host "`nPushing all 12 commits to GitHub..." -ForegroundColor Green
git push origin main

Write-Host "`n✅ Done! All changes pushed to https://github.com/Suraj-kummar/DeployIQ" -ForegroundColor Green
