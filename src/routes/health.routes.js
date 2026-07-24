const express = require('express');
const { isDbConnected } = require('../config/db');
const { DEPLOY_MODE } = require('../config/env');
const { getLicenseStatus } = require('../utils/license');

const router = express.Router();

// Unauthenticated - polled by both apps' offline-queue workers, and by the Admin app to
// show a license warning banner (local mode only - see utils/license.js).
router.get('/', (req, res) => {
  const body = { ok: true, time: new Date().toISOString(), dbConnected: isDbConnected() };
  if (DEPLOY_MODE === 'local') {
    const license = getLicenseStatus();
    body.licensed = license.licensed;
    body.licenseMessage = license.message;
  }
  res.json(body);
});

module.exports = router;
