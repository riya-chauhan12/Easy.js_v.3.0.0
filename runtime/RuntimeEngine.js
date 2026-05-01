const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const DatabaseManager = require('../core/database');
const AuthManager = require('../core/auth');
const RouterManager = require('../core/router');
const MiddlewareManager = require('../core/middleware');
const ValidationEngine = require('../core/validator');
const Logger = require('../core/logger');
const CacheEngine = require('../core/cache');
const QueryOptimizer = require('../core/queryOptimizer');
const ConnectionPool = require('../core/connectionPool');
const SecurityLayer = require('../core/security');
const MonitoringSystem = require('../core/monitoring');
const EnterpriseAuth = require('../core/enterpriseAuth');
const { buildLandingPayload, renderLandingPage, wantsJson } = require('../core/landingPage');

class RuntimeEngine {
  constructor() {
    this.app = express();
    this.config = null;
    this.db = null;
    this.auth = null;
    this.cache = null;
    this.queryOptimizer = null;
    this.connectionPool = null;
    this.security = null;
    this.monitoring = null;
    this.enterpriseAuth = null;
  }

  async initialize(config) {
    this.config = config;

    // Initialize monitoring system
    this.monitoring = new MonitoringSystem({
      enableMetrics: true,
      enableTracing: true,
      metricsInterval: 60000
    });

    // Initialize security layer
    this.security = new SecurityLayer({
      enableAuditLogging: true,
      enableFieldEncryption: true
    });

    // Initialize caching engine
    this.cache = new CacheEngine({
      enableCompression: true,
      enableMetrics: true,
      maxMemoryCache: 500
    });
    await this.cache.init();

    // Initialize query optimizer
    this.queryOptimizer = new QueryOptimizer({
      enableProfiling: true,
      slowQueryThreshold: 100,
      enableAutoJoin: true
    });

    // Initialize enterprise authentication
    this.enterpriseAuth = new EnterpriseAuth({
      enableMFA: true,
      enableOAuth2: true,
      enableSAML: config.auth?.enableSAML || false
    });

    // Setup security middleware
    this.setupSecurityMiddleware();

    // Setup basic middleware
    this.setupBasicMiddleware();

    // Initialize database with connection pooling
    if (config.databases.length > 0) {
      this.db = new DatabaseManager();
      this.connectionPool = new ConnectionPool({
        minConnections: 5,
        maxConnections: 50,
        enableAutoScaling: true,
        enableMonitoring: true
      });
      await this.db.initialize(config.databases, config.models);
    }

    // Setup authentication
    if (config.auth) {
      this.auth = new AuthManager();
      this.auth.initialize(config.auth);
    }

    // Setup validation engine
    const validator = new ValidationEngine();
    validator.loadRules(config.validations);

    // Setup routes
    const router = new RouterManager();
    router.registerRoutes(this.app, config.routes, this.db, validator);

    // Setup protected routes
    this.setupProtectedRoutes();

    // Setup performance monitoring middleware
    this.setupMonitoringMiddleware();

    // Setup cache middleware
    this.setupCacheMiddleware();

    // Error handling middleware
    this.setupErrorHandling();

    // Start server
    await this.startServer();
  }

  setupSecurityMiddleware() {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(compression());

    // Add security headers
    this.app.use((req, res, next) => {
      const headers = this.security.getSecurityHeaders();
      Object.entries(headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      next();
    });

    // CSRF protection
    this.app.use((req, res, next) => {
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        const token = req.headers['x-csrf-token'];
        const sessionId = req.sessionID || req.headers['x-session-id'];
        
        if (sessionId && !this.security.verifyCSRFToken(sessionId, token)) {
          return res.status(403).json({ error: 'CSRF token invalid' });
        }
      }
      next();
    });
  }

  setupBasicMiddleware() {
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // Request logging
    this.app.use((req, res, next) => {
      Logger.info(`${req.method} ${req.path}`);
      next();
    });
  }

  setupMonitoringMiddleware() {
    this.app.use((req, res, next) => {
      const startTime = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        this.monitoring.recordRequest(req, res, duration);
        
        // Log slow requests
        if (duration > 1000) {
          Logger.warn(`Slow request: ${req.method} ${req.path} took ${duration}ms`);
        }
      });

      next();
    });

    this.app.get('/', (req, res) => {
      const payload = buildLandingPayload({
        endpoints: {
          health: '/health',
          runtimeHealth: '/_health',
          metrics: '/_metrics',
          prometheus: '/_prometheus'
        },
        routes: (this.config.routes || []).map(route => ({
          method: route.method.toUpperCase(),
          path: route.path
        }))
      });
      if (wantsJson(req)) {
        return res.json(payload);
      }
      return res.type('html').send(renderLandingPage(payload));
    });

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });

    this.app.get('/_health', (req, res) => {
      res.json(this.monitoring.getHealthStatus());
    });

    // Metrics endpoint
    this.app.get('/_metrics', (req, res) => {
      res.json(this.monitoring.generateReport());
    });

    // Prometheus metrics endpoint
    this.app.get('/_prometheus', (req, res) => {
      res.type('text/plain');
      res.send(this.monitoring.exportMetrics('prometheus'));
    });
  }

  setupCacheMiddleware() {
    // Cache GET requests
    this.app.use(async (req, res, next) => {
      if (req.method === 'GET') {
        const cacheKey = `${req.method}:${req.originalUrl}`;
        const cached = await this.cache.get('http', cacheKey);
        
        if (cached) {
          res.set('X-Cache', 'HIT');
          return res.json(cached);
        }
        
        res.set('X-Cache', 'MISS');
        
        // Intercept response
        const originalJson = res.json.bind(res);
        const cache = this.cache;
        res.json = function(data) {
          if (res.statusCode === 200) {
            cache.set('http', cacheKey, data, 3600).catch(error => {
              Logger.warn(`Cache set failed: ${error.message}`);
            });
          }
          return originalJson(data);
        };
      }
      
      next();
    });
  }

  setupProtectedRoutes() {
    if (!this.config.protections || !this.auth) return;

    for (const protection of this.config.protections) {
      this.app.use(protection.path, this.auth.jwtMiddleware());
    }
  }

  setupErrorHandling() {
    this.app.use((err, req, res, next) => {
      Logger.error(err.message);
      
      const status = err.status || 500;
      const message = err.message || 'Internal Server Error';
      
      res.status(status).json({
        success: false,
        error: message,
        timestamp: new Date().toISOString()
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: 'Route not found',
        path: req.path
      });
    });
  }

  async startServer() {
    const { port, host } = this.config.server;

    this.app.listen(port, host, () => {
      Logger.success(`\n✓ Server started on http://${host}:${port}`);
      Logger.info(`\nAvailable routes:`);
      
      if (this.config.routes.length > 0) {
        this.config.routes.forEach(route => {
          Logger.info(`  ${route.method.toUpperCase()} ${route.path}`);
        });
      }

      Logger.info('\nPress Ctrl+C to stop the server\n');
    });
  }
}

module.exports = RuntimeEngine;
