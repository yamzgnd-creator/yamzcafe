const path = require('path');

// Resolve paths relative to this config file so the same file works on any
// server (local dev, Hostinger VPS, etc.) without hardcoded absolute paths.
const appDir = __dirname;

module.exports = {
  apps: [
    {
      name: 'yamz-cafe',
      script: 'server.cjs',
      cwd: appDir,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3000
      },
      error_file: path.join(appDir, 'logs', 'error.log'),
      out_file: path.join(appDir, 'logs', 'output.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};