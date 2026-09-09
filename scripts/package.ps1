$ErrorActionPreference = 'Stop'
node scripts/check-package.mjs
if ($LASTEXITCODE -ne 0) { throw 'Package verification failed.' }
Copy-Item THIRD_PARTY_NOTICES.md -Destination dist
New-Item -ItemType Directory -Force submission | Out-Null
Compress-Archive -Path dist/* -DestinationPath submission/MuteTheBeat-1.0.0.zip -Force
Get-FileHash submission/MuteTheBeat-1.0.0.zip
