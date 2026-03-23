/**
 * PM2: scanner + watch that pauses/resumes the scanner from Firestore (source Active/Paused).
 *
 *   pm2 start ecosystem.config.cjs
 *
 * Requires .env.local with Firebase Admin (same as scanner-worker).
 * Upgrade PM2 (`npm i -g pm2 && pm2 update`) for `pm2 pause` / status "paused".
 */
module.exports = {
  apps: [
    {
      name: "roofix-scanner",
      script: "npm",
      args: "run scanner-worker",
      cwd: __dirname,
      autorestart: true,
    },
    {
      name: "roofix-scanner-pm2-watch",
      script: "npm",
      args: "run scanner-pm2-watch",
      cwd: __dirname,
      autorestart: true,
      env: {
        SCANNER_PM2_APP_NAME: "roofix-scanner",
      },
    },
  ],
};
