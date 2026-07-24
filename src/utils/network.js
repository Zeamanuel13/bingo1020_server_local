const os = require('os');

// Local mode only: read at startup (console log) and by the local status page, so
// whoever's setting up a shop's Admin/Cashier apps can find the LAN address without
// hunting through Windows/macOS network settings. Best-effort - returns null if
// nothing suitable is found.
function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

module.exports = { getLanIp };
