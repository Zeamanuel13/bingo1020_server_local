const fs = require('fs');
require('dotenv').config();

const DEPLOY_MODE = process.env.DEPLOY_MODE === 'cloud' ? 'cloud' : 'local';

// Cloud mode only: prefer a file path (LICENSE_PRIVATE_KEY_FILE) over an inline env var -
// a multi-line PEM pasted as a single escaped-string shell arg is easy to get subtly
// wrong with no clear error. Falls back to LICENSE_PRIVATE_KEY (accepts the common
// single-line "\n"-escaped form) if no file path is given.
function loadLicensePrivateKey() {
  if (process.env.LICENSE_PRIVATE_KEY_FILE) {
    return fs.readFileSync(process.env.LICENSE_PRIVATE_KEY_FILE, 'utf8');
  }
  return (process.env.LICENSE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
}

if (DEPLOY_MODE === 'local' && !process.env.SHOP_ID) {
  throw new Error('SHOP_ID is required when DEPLOY_MODE=local');
}

module.exports = {
  DEPLOY_MODE,
  PORT: Number(process.env.PORT) || 6000,
  MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/bingo1020_local',
  SHOP_ID: process.env.SHOP_ID || null,
  JWT_SECRET: process.env.JWT_SECRET || 'dev_secret_change_me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  CLOUD_SYNC_URL: process.env.CLOUD_SYNC_URL || '',
  CLOUD_SYNC_API_KEY: process.env.CLOUD_SYNC_API_KEY || '',
  CLOUD_SHOP_API_KEYS: process.env.CLOUD_SHOP_API_KEYS || '',
  CORS_ORIGINS: (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()),
  // Local mode only: this shop's signed license key (issued from the Super Admin
  // dashboard). Cloud mode only: the private key that signs new license keys - never
  // distribute this outside the cloud deployment's own env (see utils/license.js).
  LICENSE_KEY: process.env.LICENSE_KEY || '',
  LICENSE_PRIVATE_KEY: loadLicensePrivateKey(),
};
