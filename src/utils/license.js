const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { machineIdSync } = require('node-machine-id');

// Public half of the RSA keypair used to sign license keys. Only verifies signatures -
// it cannot be used to forge a new valid license, so baking it into every local install
// is safe. The matching private key lives only in the cloud deployment's env
// (LICENSE_PRIVATE_KEY, see routes/shops.routes.js) and is never distributed.
const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsKKXq6pBCM46zB60spSy
sPF51TDDpx0H2zXdHHHgHO9M6c7u1Hk+eaYznOVfjFvNS5JIFQlE1EYXNz4QO5An
H5PmSyecYPQX2nUAdMON0Yy1FJupdg938bXkpya6e3Epp8xOqrW1baTl4oNI2ek0
U66gtoGgBfDq1v/BAm2giyRToez9/BZgPmJTmW1EJnge4mwLsTIq1U75o5ksuJgA
vLV+GMt9CJ1vB+V2sAo7xFrFrNdiPdFod2izXwrfswKCA1tygGE/VUY4+IMnXTU3
37Jj+UgpZLVBVQ8NjXtVrw2NBw8r/k7IgDE31wdMHHFRbBpfMhQsNiNb9L/ghrOT
1wIDAQAB
-----END PUBLIC KEY-----`;

// Local-only anti-tamper check for the activation file below - deters hand-editing it to
// swap the recorded machine id, nothing more. Not the actual security boundary (the
// signature above is), and deliberately distinct from the license-signing keypair.
const ACTIVATION_INTEGRITY_SECRET = 'bingo1020-activation-v1';

const DATA_DIR = path.resolve(__dirname, '../../data');
const ACTIVATION_FILE = path.join(DATA_DIR, 'activation.json');

function verifyLicenseToken(token, shopId) {
  try {
    const payload = jwt.verify(token, LICENSE_PUBLIC_KEY, { algorithms: ['RS256'] });
    if (payload.shopId !== shopId) {
      return { valid: false, reason: 'This license key was issued for a different shop.' };
    }
    return { valid: true, reason: null };
  } catch (err) {
    if (err.name === 'TokenExpiredError') return { valid: false, reason: 'This license key has expired.' };
    return { valid: false, reason: 'This license key is invalid.' };
  }
}

function activationHmac(machineId, shopId) {
  return crypto.createHmac('sha256', ACTIVATION_INTEGRITY_SECRET).update(`${machineId}:${shopId}`).digest('hex');
}

// First run for a given shopId+license binds it to this machine's hardware fingerprint by
// writing activation.json; every run after that just checks the fingerprint still
// matches. Never throws - an unfingerprintable machine (unsupported OS/sandbox) is
// treated as valid rather than blocking startup over it.
function checkMachineBinding(shopId) {
  let machineId;
  try {
    machineId = machineIdSync();
  } catch (err) {
    return { valid: true, reason: null };
  }

  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    if (!fs.existsSync(ACTIVATION_FILE)) {
      const record = { machineId, shopId, activatedAt: new Date().toISOString() };
      record.hmac = activationHmac(machineId, shopId);
      fs.writeFileSync(ACTIVATION_FILE, JSON.stringify(record, null, 2));
      return { valid: true, reason: null };
    }

    const record = JSON.parse(fs.readFileSync(ACTIVATION_FILE, 'utf8'));
    if (record.hmac !== activationHmac(record.machineId, record.shopId)) {
      return { valid: false, reason: 'This install\'s activation record has been tampered with.' };
    }
    if (record.shopId !== shopId) {
      return { valid: false, reason: 'This install was activated for a different shop.' };
    }
    if (record.machineId !== machineId) {
      return { valid: false, reason: 'This software was not activated for this machine.' };
    }
    return { valid: true, reason: null };
  } catch (err) {
    return { valid: false, reason: 'Could not read this install\'s activation record.' };
  }
}

let cachedStatus = { licensed: true, message: null };

// Called once at startup (local mode only) - never blocks app.listen, just caches a
// status that health.routes.js exposes so client apps can show a warning banner.
function initLicense(shopId, licenseKey) {
  if (!licenseKey) {
    cachedStatus = { licensed: false, message: 'No license key configured for this install.' };
    return cachedStatus;
  }

  const tokenCheck = verifyLicenseToken(licenseKey, shopId);
  if (!tokenCheck.valid) {
    cachedStatus = { licensed: false, message: tokenCheck.reason };
    return cachedStatus;
  }

  const bindingCheck = checkMachineBinding(shopId);
  if (!bindingCheck.valid) {
    cachedStatus = { licensed: false, message: bindingCheck.reason };
    return cachedStatus;
  }

  cachedStatus = { licensed: true, message: null };
  return cachedStatus;
}

function getLicenseStatus() {
  return cachedStatus;
}

module.exports = { initLicense, getLicenseStatus };
