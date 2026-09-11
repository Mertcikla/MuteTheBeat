$OutputPath = 'submission/MuteTheBeat.zip'

$ErrorActionPreference = 'Stop'
node scripts/check-package.mjs
if ($LASTEXITCODE -ne 0) { throw 'Package verification failed.' }
Copy-Item THIRD_PARTY_NOTICES.md -Destination dist
New-Item -ItemType Directory -Force submission | Out-Null
Compress-Archive -Path dist/* -DestinationPath $OutputPath -Force
Get-FileHash $OutputPath
