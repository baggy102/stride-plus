const { execSync } = require('child_process');
const port = process.argv[2] || '3000';
try {
  execSync(
    `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
    { stdio: 'ignore' },
  );
} catch (_) {}
