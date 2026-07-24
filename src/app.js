const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { DEPLOY_MODE, CORS_ORIGINS, PORT } = require('./config/env');
const { getLanIp } = require('./utils/network');
const { isDbConnected } = require('./config/db');

const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const cashiersRoutes = require('./routes/cashiers.routes');
const gamesRoutes = require('./routes/games.routes');
const reportsRoutes = require('./routes/reports.routes');
const syncRoutes = require('./routes/sync.routes');

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: CORS_ORIGINS.includes('*') ? true : CORS_ORIGINS,
  })
);
app.use(express.json({ limit: '2mb' }));
// Per-request access logging (GET /api/health 200 3ms ...) is opt-in only - a shop
// running this unattended for a full shift doesn't need every health-check poll
// spammed to its console/log file. Set HTTP_LOG=true to turn it back on for debugging.
if (process.env.HTTP_LOG === 'true') {
  app.use(morgan(process.env.NODE_ENV === 'test' ? 'tiny' : 'dev'));
}

app.use('/api/health', healthRoutes);

app.use('/api/auth', authRoutes);

if (DEPLOY_MODE === 'local') {
  app.use('/api/cashiers', cashiersRoutes);
  app.use('/api/games', gamesRoutes);
  app.use('/api/reports', reportsRoutes);
  app.use('/api/sync', syncRoutes);

  // Unauthenticated status page for whoever's physically at the shop PC - so the LAN
  // address (needed to set up the Admin/Cashier apps) is visible from a plain browser
  // window instead of a terminal/log file, which running as a background Windows
  // service (NSSM etc.) hides entirely.
  app.get('/', (req, res) => {
    res.removeHeader('Content-Security-Policy');
    const lanIp = getLanIp();
    const dbOk = isDbConnected();
    res.send(`<!DOCTYPE html>
<html>
<head>
<title>1020 Bingo — Local Server</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: -apple-system, Segoe UI, Arial, sans-serif; text-align: center; padding: 60px 20px; background: #f8fafc; color: #111827; }
  h1 { color: #4f46e5; margin-bottom: 8px; }
  .status { font-weight: 600; color: ${dbOk ? '#059669' : '#dc2626'}; margin-bottom: 32px; }
  .label { color: #6b7280; margin-bottom: 8px; }
  .ip { font-size: 42px; font-weight: bold; display: inline-block; background: white; padding: 20px 40px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  .hint { color: #6b7280; margin-top: 24px; font-size: 14px; }
</style>
</head>
<body>
  <h1>1020 Bingo — Local Server</h1>
  <p class="status">${dbOk ? '● Running' : '● Database not connected'}</p>
  <p class="label">Enter this in the Admin/Cashier app's IP field:</p>
  <div class="ip">${lanIp || 'Unknown'}</div>
  <p class="hint">Port: ${PORT}${lanIp ? ` &nbsp;•&nbsp; Full address: ${lanIp}:${PORT}` : ''}</p>
</body>
</html>`);
  });
} else {
  // Cloud mode mounts shops/superadmin/sync-ingest/cross-shop-reports routes.
  const shopsRoutes = require('./routes/shops.routes');
  const superadminAuthRoutes = require('./routes/superadminAuth.routes');
  const syncIngestRoutes = require('./routes/syncIngest.routes');
  const cloudReportsRoutes = require('./routes/cloudReports.routes');

  app.use('/api/superadmin/auth', superadminAuthRoutes);
  app.use('/api/shops', shopsRoutes);
  app.use('/api/sync', syncIngestRoutes);
  app.use('/api/reports', cloudReportsRoutes);

  // Serves the built Super Admin dashboard from this same service/origin (built via
  // `npm run build` in ./superadmin before `npm start` - see package.json and
  // superadmin/src/api.js, which calls relative /api paths by default for exactly this
  // setup). Any non-API GET falls back to index.html for client-side routing.
  const superadminDist = path.join(__dirname, '../superadmin/dist');
  app.use(express.static(superadminDist));
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(superadminDist, 'index.html'));
  });
}

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (err.name === 'CastError' || err.name === 'ValidationError') {
    return res.status(400).json({ error: 'Invalid request' });
  }
  if (err.code === 11000) {
    return res.status(409).json({ error: 'Duplicate value' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
