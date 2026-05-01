const express = require('express');
const request = require('supertest');
const healthRoutes = require('../../routes/health');

function createApp({ db, redis } = {}) {
  const app = express();
  if (db !== undefined) app.set('database', db);
  if (redis !== undefined) app.set('redis', redis);
  app.use(healthRoutes);
  return app;
}

describe('health routes', () => {
  it('returns a starter UI at the root path', async () => {
    await request(createApp())
      .get('/')
      .expect(200)
      .expect('Content-Type', /html/)
      .expect(res => {
        expect(res.text).toContain('easy.js backend');
        expect(res.text).toContain('easy.js logo');
      });
  });

  it('returns a useful landing payload at the root path for API clients', async () => {
    await request(createApp())
      .get('/')
      .set('Accept', 'application/json')
      .expect(200)
      .expect(res => {
        expect(res.body.success).toBe(true);
        expect(res.body.package).toBe('easybackend.js');
        expect(res.body.endpoints.health).toBe('/health');
      });
  });

  it('returns health and runtime metrics', async () => {
    const app = createApp();

    await request(app)
      .get('/health')
      .expect(200)
      .expect(res => {
        expect(res.body.status).toBe('healthy');
        expect(res.body.uptime).toEqual(expect.any(Number));
      });

    await request(app)
      .get('/metrics')
      .expect(200)
      .expect(res => {
        expect(res.body.memory).toBeDefined();
        expect(res.body.environment.node).toBe(process.version);
      });
  });

  it('reports readiness from database and redis checks', async () => {
    const db = {
      primaryDB: {},
      healthCheck: jest.fn().mockResolvedValue({
        primary: { status: 'connected' }
      })
    };
    const redis = { ping: jest.fn().mockResolvedValue('PONG') };

    await request(createApp({ db, redis }))
      .get('/ready')
      .expect(200)
      .expect(res => {
        expect(res.body.ready).toBe(true);
        expect(res.body.checks.database).toBe(true);
        expect(res.body.checks.redis).toBe(true);
      });
  });

  it('returns 503 when required readiness checks fail', async () => {
    const db = {
      primaryDB: {},
      healthCheck: jest.fn().mockRejectedValue(new Error('database down'))
    };

    await request(createApp({ db }))
      .get('/ready')
      .expect(503)
      .expect(res => {
        expect(res.body.ready).toBe(false);
        expect(res.body.checks.database).toBe(false);
      });
  });

  it('returns detailed status information', async () => {
    const db = {
      getConnectedDatabases: jest.fn().mockReturnValue(['sqlite']),
      getPrimaryDBType: jest.fn().mockReturnValue('sqlite')
    };

    await request(createApp({ db }))
      .get('/status')
      .expect(200)
      .expect(res => {
        expect(res.body.app.name).toBe('easy.js');
        expect(res.body.databases.connected).toEqual(['sqlite']);
        expect(res.body.databases.primary).toBe('sqlite');
      });
  });
});
