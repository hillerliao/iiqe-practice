const path = require("node:path");

const logDir = process.env.PM2_LOG_DIR ?? path.join(process.env.HOME ?? process.cwd(), "iiqe-shared", "logs");

module.exports = {
  apps: [
    {
      name: "iiqe-app",
      cwd: __dirname,
      script: "npm",
      args: "start -- -p 3001",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      kill_timeout: 5000,
      time: true,
      merge_logs: true,
      out_file: path.join(logDir, "iiqe-app.out.log"),
      error_file: path.join(logDir, "iiqe-app.error.log"),
      env_production: {
        NODE_ENV: "production",
        PORT: "3001",
      },
    },
  ],
};
