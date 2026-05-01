const express = require('express');
const router = express.Router();
const loggerWinston = require('../core/loggerWinston');
const { buildLandingPayload, renderLandingPage, wantsJson } = require('../core/landingPage');

router.get('/', (req, res) => {
  const payload = buildLandingPayload();
  if (wantsJson(req)) {
    return res.status(200).json(payload);
  }
  return res.status(200).type('html').send(renderLandingPage(payload));
});

/**
 * GET /health
 * Simple health check - returns 200 if app is running
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * GET /ready
 * Readiness check - checks if dependencies are ready
 */
router.get('/ready', async (req, res) => {
  try {
    const db = req.app.get('database');
    const redis = req.app.get('redis');

    const checks = {
      database: await checkDatabase(db),
      redis: await checkRedis(redis),
      memory: checkMemory(),
      timestamp: new Date().toISOString()
    };

    const allReady = Object.values(checks)
      .filter(v => typeof v === 'boolean')
      .every(v => v === true);

    res.status(allReady ? 200 : 503).json({
      ready: allReady,
      checks
    });
  } catch (error) {
    loggerWinston.error('Readiness check failed', { error: error.message });
    res.status(503).json({
      ready: false,
      error: error.message
    });
  }
});

/**
 * GET /metrics
 * Returns application metrics
 */
router.get('/metrics', async (req, res) => {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      environment: {
        node: process.version,
        platform: process.platform,
        environment: process.env.NODE_ENV
      }
    };

    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /status
 * Detailed status check
 */
router.get('/status', async (req, res) => {
  try {
    const db = req.app.get('database');
    const status = {
      app: {
        name: 'easy.js',
        version: process.env.APP_VERSION || '1.0.0',
        environment: process.env.NODE_ENV,
        uptime: process.uptime()
      },
      databases: {
        connected: db ? db.getConnectedDatabases() : [],
        primary: db ? db.getPrimaryDBType() : null
      },
      memory: {
        used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`
      },
      timestamp: new Date().toISOString()
    };

    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper functions
async function checkDatabase(db) {
  try {
    if (!db || !db.primaryDB) return false;
    
    const health = await db.healthCheck();
    return Object.values(health).every(h => h.status === 'connected');
  } catch (error) {
    loggerWinston.warn('Database health check failed', { error: error.message });
    return false;
  }
}

async function checkRedis(redis) {
  try {
    if (!redis) return true; // Redis is optional
    
    await redis.ping();
    return true;
  } catch (error) {
    loggerWinston.warn('Redis health check failed', { error: error.message });
    return false;
  }
}

function checkMemory() {
  const usage = process.memoryUsage();
  const limit = 512 * 1024 * 1024; // 512MB
  return usage.heapUsed < limit;
}

module.exports = router;
