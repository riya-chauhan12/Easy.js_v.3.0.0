#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const Logger = require('../core/logger');
const Parser = require('../parser/Parser');
const Compiler = require('../compiler/Compiler');
const { TypeChecker, Formatter, Linter, Repl, Playground } = require('../language');

class CLI {
  constructor(argv = process.argv) {
    this.command = argv[2];
    this.args = argv.slice(3);
  }

  async run() {
    switch (this.command) {
      case 'create':
        this.createProject();
        break;
      case 'start':
        this.startServer();
        break;
      case 'dev':
        this.devServer();
        break;
      case 'build':
        this.build();
        break;
      case 'doctor':
        this.doctor();
        break;
      case 'lint':
        this.lint();
        break;
      case 'format':
        this.format();
        break;
      case 'typecheck':
        this.typecheck();
        break;
      case 'repl':
        new Repl().start();
        break;
      case 'playground':
        this.playground();
        break;
      case 'add':
        this.addFeature();
        break;
      case 'migration':
        this.runMigrationCommand();
        break;
      case 'seed':
        this.runSeedCommand();
        break;
      case '--version':
      case '-v':
        this.showVersion();
        break;
      case '--help':
      case '-h':
        this.showHelp();
        break;
      default:
        this.showHelp();
    }
  }

  createProject() {
    const projectName = this.args[0];

    if (!projectName) {
      Logger.error('Project name is required');
      Logger.info('Usage: easyjs create <project-name>');
      process.exit(1);
    }

    const projectPath = path.join(process.cwd(), projectName);

    if (fs.existsSync(projectPath)) {
      Logger.error(`Directory '${projectName}' already exists`);
      process.exit(1);
    }

    Logger.info(`Creating secure backend: ${projectName}`);

    for (const dir of [
      'src',
      'src/modules',
      'config',
      'tests/unit',
      'tests/integration',
      'migrations',
      'seeds',
      'docs',
      '.github/workflows'
    ]) {
      fs.mkdirSync(path.join(projectPath, dir), { recursive: true });
    }

    this.writeProjectFiles(projectPath, projectName);

    Logger.success('Project created successfully');
    Logger.info(`Next steps:`);
    Logger.info(`  cd ${projectName}`);
    Logger.info(`  npm install`);
    Logger.info(`  npm run doctor`);
    Logger.info(`  npm run dev`);
  }

  writeProjectFiles(projectPath, projectName) {
    const files = {
      'src/app.easy': this.templates.appEasy(projectName),
      'src/models.easy': this.templates.modelsEasy(),
      'src/auth.easy': this.templates.authEasy(),
      'src/routes.easy': this.templates.routesEasy(),
      'src/jobs.easy': this.templates.jobsEasy(),
      'config/easy.config.js': this.templates.easyConfig(),
      'tests/integration/health.test.js': this.templates.healthTest(),
      'migrations/001_create_users_table.js': this.templates.userMigration(),
      'seeds/001_admin_user.js': this.templates.adminSeed(),
      'docs/API.md': this.templates.apiDocs(projectName),
      '.env': this.templates.env(projectName),
      '.env.example': this.templates.envExample(),
      '.gitignore': this.templates.gitignore(),
      'Dockerfile': this.templates.dockerfile(),
      'docker-compose.yml': this.templates.dockerCompose(projectName),
      '.github/workflows/ci.yml': this.templates.ciWorkflow(),
      'package.json': JSON.stringify(this.templates.packageJson(projectName), null, 2),
      'README.md': this.templates.readme(projectName)
    };

    for (const [filename, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(projectPath, filename), content);
    }
  }

  addFeature() {
    const feature = this.args[0];
    const name = this.args[1];

    if (!feature) {
      Logger.error('Feature name is required');
      Logger.info('Usage: easyjs add <model|crud|job> <name>');
      process.exit(1);
    }

    if (feature === 'model') {
      if (!name) return this.missingName('model');
      this.appendFile('src/models.easy', `\nMODEL ${name} {\n  name: string\n  createdAt: date\n}\n`);
      Logger.success(`Model added: ${name}`);
      return;
    }

    if (feature === 'crud') {
      if (!name) return this.missingName('crud');
      const routeName = name.toLowerCase();
      this.appendFile('src/routes.easy', `\nGET /${routeName} FROM ${routeName}\nGET /${routeName}/:id FROM ${routeName}\nPOST /${routeName} FROM ${routeName}\nPUT /${routeName}/:id FROM ${routeName}\nDELETE /${routeName}/:id FROM ${routeName}\nPROTECT /${routeName}\n`);
      Logger.success(`CRUD routes added for: ${name}`);
      return;
    }

    if (feature === 'job') {
      if (!name) return this.missingName('job');
      this.appendFile('src/jobs.easy', `\nJOB ${name} EVERY 5m {\n  LOG \"${name} running\"\n}\n`);
      Logger.success(`Job added: ${name}`);
      return;
    }

    Logger.error(`Unknown feature: ${feature}`);
  }

  missingName(feature) {
    Logger.error(`Name is required for ${feature}`);
    process.exit(1);
  }

  appendFile(filename, content) {
    const filepath = path.join(process.cwd(), filename);
    if (!fs.existsSync(filepath)) {
      fs.mkdirSync(path.dirname(filepath), { recursive: true });
      fs.writeFileSync(filepath, '');
    }
    fs.appendFileSync(filepath, content);
  }

  doctor() {
    const checks = [
      this.checkFile('package.json', 'Project package'),
      this.checkFile('src/app.easy', 'Main easy.js app'),
      this.checkFile('.env', 'Environment file'),
      this.checkFile('.env.example', 'Environment example'),
      this.checkFile('Dockerfile', 'Docker support'),
      this.checkFile('docker-compose.yml', 'Local services'),
      this.checkEnv('JWT_SECRET', 'JWT secret'),
      this.checkEnv('DATABASE_URL', 'Database URL', false)
    ];

    const failed = checks.filter(check => !check.ok);

    checks.forEach(check => {
      const label = check.ok ? 'OK' : (check.required ? 'MISSING' : 'WARN');
      Logger.info(`${label}: ${check.name}`);
    });

    if (failed.some(check => check.required)) {
      Logger.error('Doctor found required fixes.');
      process.exit(1);
    }

    Logger.success('Doctor checks passed');
  }

  lint() {
    const file = this.args[0] || this.defaultEasyFile();
    const source = this.readEasySource(file);
    const ast = new Parser().parse(source);
    const diagnostics = new Linter().lint(source, ast);
    diagnostics.forEach(item => Logger.info(`${item.severity.toUpperCase()} ${item.code}: ${item.message} (${item.line}:${item.column})`));
    if (diagnostics.some(item => item.severity === 'error')) process.exit(1);
    Logger.success('easy.js lint complete');
  }

  format() {
    const file = this.args[0] || this.defaultEasyFile();
    const filepath = path.resolve(process.cwd(), file);
    const formatted = new Formatter().format(fs.readFileSync(filepath, 'utf8'));
    fs.writeFileSync(filepath, formatted);
    Logger.success(`Formatted ${file}`);
  }

  typecheck() {
    const file = this.args[0] || this.defaultEasyFile();
    const source = this.readEasySource(file);
    const ast = new Parser().parse(source);
    const result = new TypeChecker().check(ast);
    result.errors.forEach(error => Logger.error(`${error.code}: ${error.message}`));
    if (!result.ok) process.exit(1);
    Logger.success('easy.js typecheck passed');
  }

  playground() {
    const file = this.args[0] || this.defaultEasyFile();
    const result = new Playground().run(this.readEasySource(file));
    Logger.info(JSON.stringify({
      models: result.config?.models?.length || 0,
      routes: result.config?.routes?.length || 0,
      diagnostics: result.diagnostics,
      typeErrors: result.types.errors
    }, null, 2));
  }

  readEasySource(file) {
    const ModuleResolver = require('../language/ModuleResolver');
    return new ModuleResolver().resolve(path.resolve(process.cwd(), file));
  }

  defaultEasyFile() {
    const candidates = ['src/app.easy', 'app.easy', 'examples/quickstart.easy'];
    const found = candidates.find(candidate => fs.existsSync(path.resolve(process.cwd(), candidate)));
    return found || 'src/app.easy';
  }

  checkFile(filename, name, required = true) {
    return { name, required, ok: fs.existsSync(path.join(process.cwd(), filename)) };
  }

  checkEnv(key, name, required = true) {
    const envPath = path.join(process.cwd(), '.env');
    const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    return { name, required, ok: env.includes(`${key}=`) };
  }

  startServer() {
    const filePath = this.args[0] || './src/app.easy';
    Logger.info(`Starting server with ${filePath}...`);
    this.runEasyJS(filePath);
  }

  devServer() {
    const filePath = this.args[0] || './src/app.easy';
    Logger.info(`Starting development server with ${filePath}...`);
    this.runWithWatcher(filePath);
  }

  build() {
    Logger.info('Building project...');
    Logger.success('Build complete');
  }

  runMigrationCommand() {
    const subcommand = this.args[0] || 'latest';
    const name = this.args[1] || 'migration';
    const commands = {
      latest: 'npm run migrate:latest',
      rollback: 'npm run migrate:rollback',
      make: `npm run migrate:create -- ${name}`
    };
    this.runShell(commands[subcommand] || commands.latest);
  }

  runSeedCommand() {
    const subcommand = this.args[0] || 'run';
    const name = this.args[1] || 'seed';
    const commands = {
      run: 'npm run seed:run',
      make: `npm run seed:create -- ${name}`
    };
    this.runShell(commands[subcommand] || commands.run);
  }

  showVersion() {
    const packageJson = require('../package.json');
    Logger.info(`easy.js v${packageJson.version}`);
  }

  showHelp() {
    Logger.info(`
easy.js CLI

Usage:
  easyjs <command> [options]

Commands:
  create <name>        Create a secure backend project
  start [file]         Start the server
  dev [file]           Start in development mode with watch
  doctor               Check project setup and security basics
  lint [file]          Lint easy.js source
  format [file]        Format easy.js source
  typecheck [file]     Type-check easy.js source
  repl                 Open the easy.js REPL
  playground [file]    Analyze source and print language summary
  add model <name>     Add a model block
  add crud <name>      Add protected CRUD routes
  add job <name>       Add a scheduled job block
  build                Build for production
  migration <command>  Migration commands: latest, rollback, make <name>
  seed <command>       Seed commands: run, make <name>

Examples:
  easyjs create my-api
  easyjs add model Post
  easyjs add crud posts
  easyjs doctor
`);
  }

  runEasyJS(filePath) {
    const indexPath = path.resolve(__dirname, '../index.js');
    exec(`node "${indexPath}" "${filePath}"`, (error) => {
      if (error) {
        Logger.error(error.message);
        process.exit(1);
      }
    });
  }

  runWithWatcher(filePath) {
    const dir = path.dirname(filePath);
    Logger.info(`Watching directory: ${dir}`);
    this.runEasyJS(filePath);

    fs.watch(dir, { recursive: true }, (eventType, filename) => {
      if (filename && filename.endsWith('.easy')) {
        Logger.info(`File changed: ${filename}`);
        Logger.info('Restarting server...');
        this.runEasyJS(filePath);
      }
    });
  }

  runShell(command) {
    exec(command, (error, stdout, stderr) => {
      if (stdout) Logger.info(stdout.trim());
      if (stderr) Logger.warn(stderr.trim());
      if (error) {
        Logger.error(error.message);
        process.exit(1);
      }
    });
  }

  templates = {
    appEasy: (projectName) => `# ${projectName}
# One file starts the backend. Split files keep it readable.

START SERVER 3000
USE MONGODB mongodb://localhost:27017/${projectName.replace(/[^a-zA-Z0-9_-]/g, '')}

SECURITY strict
DOCS openapi
ADMIN enabled

IMPORT ./models.easy
IMPORT ./auth.easy
IMPORT ./routes.easy
IMPORT ./jobs.easy
`,

    modelsEasy: () => `MODEL users {
  name: string
  email: email
  password: password
  role: string
  emailVerified: boolean
  createdAt: date
}

MODEL posts {
  title: string
  content: string
  authorId: string
  published: boolean
  createdAt: date
}
`,

    authEasy: () => `AUTH users BY jwt
AUTH refresh_tokens enabled
AUTH password_reset enabled
AUTH email_verification enabled

ROLE admin CAN *
ROLE user CAN posts:read, posts:create
`,

    routesEasy: () => `GET /users FROM users
GET /users/:id FROM users
POST /users FROM users
PUT /users/:id FROM users
DELETE /users/:id FROM users
PROTECT /users

GET /posts FROM posts
GET /posts/:id FROM posts
POST /posts FROM posts
PUT /posts/:id FROM posts
DELETE /posts/:id FROM posts
PROTECT /posts

VALIDATE users {
  email: required:email
  password: required:min=8
  name: required:min=2
}

VALIDATE posts {
  title: required:min=3
  content: required
}
`,

    jobsEasy: () => `JOB cleanupExpiredTokens EVERY 1h {
  LOG "Cleaning expired auth tokens"
}
`,

    easyConfig: () => `module.exports = {
  security: 'strict',
  docs: true,
  admin: true,
  logging: true,
  healthChecks: true,
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    max: 100
  }
};
`,

    healthTest: () => `const request = require('supertest');
const AppFactory = require('easybackend.js').AppFactory;

describe('health', () => {
  it('returns health status', async () => {
    const factory = new AppFactory({ enableAdmin: false, enableSwagger: false });
    const app = await factory.initialize();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });
});
`,

    userMigration: () => `exports.up = async (knex) => {
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.string('email').notNullable().unique();
    table.string('password').notNullable();
    table.string('role').defaultTo('user');
    table.boolean('emailVerified').defaultTo(false);
    table.timestamps(true, true);
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('users');
};
`,

    adminSeed: () => `exports.seed = async (knex) => {
  await knex('users').insert({
    name: 'Admin',
    email: 'admin@example.com',
    password: 'replace-with-hashed-password',
    role: 'admin',
    emailVerified: true
  });
};
`,

    apiDocs: (projectName) => `# ${projectName} API

Run the server:

\`\`\`bash
npm run dev
\`\`\`

Useful endpoints:

- GET /health
- GET /_health
- GET /ready
- GET /docs
- GET /posts
- POST /posts
`,

    env: (projectName) => `NODE_ENV=development
PORT=3000
APP_NAME=${projectName}
JWT_SECRET=change-this-before-production
JWT_REFRESH_SECRET=change-this-refresh-secret
DATABASE_URL=mongodb://localhost:27017/${projectName}
MONGODB_URL=mongodb://localhost:27017/${projectName}
REDIS_URL=redis://localhost:6379
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
SENTRY_DSN=
FIELD_ENCRYPTION_KEY=change-this-field-key
`,

    envExample: () => `NODE_ENV=development
PORT=3000
APP_NAME=my-backend
JWT_SECRET=replace-me
JWT_REFRESH_SECRET=replace-me-too
DATABASE_URL=mongodb://localhost:27017/my-backend
MONGODB_URL=mongodb://localhost:27017/my-backend
REDIS_URL=redis://localhost:6379
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
SENTRY_DSN=
FIELD_ENCRYPTION_KEY=replace-me
`,

    gitignore: () => `node_modules
.env
logs
coverage
backups
dist
`,

    dockerfile: () => `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
`,

    dockerCompose: (projectName) => `services:
  api:
    build: .
    command: npm run dev
    ports:
      - "3000:3000"
    env_file:
      - .env
    depends_on:
      - mongo
      - redis

  mongo:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - ${projectName}_mongo:/data/db

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  ${projectName}_mongo:
`,

    ciWorkflow: () => `name: CI

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run doctor
      - run: npm test
`,

    packageJson: (projectName) => ({
      name: projectName,
      version: '1.0.0',
      private: true,
      description: 'A secure backend built with easy.js',
      main: 'src/app.easy',
      scripts: {
        start: 'easyjs start src/app.easy',
        dev: 'easyjs dev src/app.easy',
        doctor: 'easyjs doctor',
        test: 'jest',
        'test:coverage': 'jest --coverage',
        'migrate:latest': 'knex migrate:latest',
        'migrate:rollback': 'knex migrate:rollback',
        'seed:run': 'knex seed:run'
      },
      dependencies: {
        'easybackend.js': '^3.0.8',
        mongoose: '^7.5.0'
      },
      devDependencies: {
        jest: '^29.7.0',
        supertest: '^6.3.3',
        knex: '^2.5.1'
      }
    }),

    readme: (projectName) => `# ${projectName}

Secure backend in easy.js.

## Start

\`\`\`bash
npm install
npm run doctor
npm run dev
\`\`\`

## What you get

- Secure defaults
- JWT auth with refresh-token support
- Validation
- Health checks
- OpenAPI docs
- Admin-ready structure
- Tests
- Docker
- Migrations and seeds

## Add things

\`\`\`bash
easyjs add model Product
easyjs add crud products
easyjs add job dailyReport
\`\`\`
`
  };
}

if (require.main === module) {
  const cli = new CLI();
  cli.run();
}

module.exports = CLI;
