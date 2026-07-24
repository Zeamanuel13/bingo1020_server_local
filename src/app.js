const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { DEPLOY_MODE, CORS_ORIGINS } = require('./config/env');

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
