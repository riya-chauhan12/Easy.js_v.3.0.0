const fs = require('fs');
const path = require('path');
const packageJson = require('../package.json');

function getLogoSvg() {
  try {
    return fs.readFileSync(path.join(__dirname, '..', 'public', 'easyjs-logo-mark.svg'), 'utf8');
  } catch {
    return '<strong>easy.js</strong>';
  }
}

function buildLandingPayload(options = {}) {
  const endpoints = {
    health: '/health',
    ready: options.readyEndpoint || '/ready',
    status: options.statusEndpoint || '/status',
    metrics: options.metricsEndpoint || '/metrics',
    prometheus: options.prometheusEndpoint,
    docs: options.docsEndpoint || '/api-docs',
    ...(options.endpoints || {})
  };

  return {
    success: true,
    name: 'easy.js',
    package: 'easybackend.js',
    version: packageJson.version,
    message: 'easy.js backend is running',
    endpoints,
    routes: options.routes || []
  };
}

function wantsJson(req) {
  return req.query.format === 'json' || req.get('accept') === 'application/json';
}

function renderRoute(route) {
  return `<li><span>${escapeHtml(route.method || 'GET')}</span><code>${escapeHtml(route.path || '/')}</code></li>`;
}

function renderEndpoint(label, href) {
  if (!href) return '';
  return `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

function renderLandingPage(payload) {
  const routes = payload.routes && payload.routes.length
    ? payload.routes.map(renderRoute).join('')
    : '<li><span>READY</span><code>Add routes in your .easy file</code></li>';

  const endpointLinks = [
    renderEndpoint('Health', payload.endpoints.health),
    renderEndpoint('Ready', payload.endpoints.ready),
    renderEndpoint('Status', payload.endpoints.status),
    renderEndpoint('Metrics', payload.endpoints.metrics),
    renderEndpoint('Docs', payload.endpoints.docs)
  ].filter(Boolean).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>easy.js backend</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f8f4;
      --panel: #ffffff;
      --ink: #172316;
      --muted: #5d6b5a;
      --line: #dce7d7;
      --brand: #4d963f;
      --brand-dark: #2f6f27;
      --code: #102015;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--ink);
    }
    main {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      padding: 56px 0;
    }
    header {
      display: grid;
      grid-template-columns: 104px 1fr;
      gap: 24px;
      align-items: center;
      padding-bottom: 28px;
      border-bottom: 1px solid var(--line);
    }
    .logo {
      width: 104px;
      height: 104px;
      display: grid;
      place-items: center;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }
    .logo svg { width: 92px; height: 92px; }
    h1 {
      margin: 0;
      font-size: clamp(2rem, 6vw, 4.75rem);
      line-height: .95;
      letter-spacing: 0;
    }
    .sub {
      margin: 14px 0 0;
      color: var(--muted);
      font-size: 1.08rem;
      max-width: 680px;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 20px;
    }
    .meta span {
      border: 1px solid var(--line);
      background: var(--panel);
      padding: 8px 10px;
      border-radius: 6px;
      color: var(--muted);
      font-size: .92rem;
    }
    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(280px, .75fr);
      gap: 24px;
      margin-top: 28px;
    }
    section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 22px;
    }
    h2 {
      margin: 0 0 16px;
      font-size: 1rem;
      letter-spacing: 0;
      text-transform: uppercase;
      color: var(--brand-dark);
    }
    ul {
      display: grid;
      gap: 10px;
      list-style: none;
      margin: 0;
      padding: 0;
    }
    li {
      display: grid;
      grid-template-columns: 72px minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      padding: 11px 12px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fbfdf9;
    }
    li span {
      color: var(--brand-dark);
      font-size: .8rem;
      font-weight: 700;
    }
    code {
      color: var(--code);
      overflow-wrap: anywhere;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: .93rem;
    }
    .links {
      display: grid;
      gap: 10px;
    }
    a {
      display: block;
      color: var(--brand-dark);
      text-decoration: none;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 12px;
      font-weight: 650;
    }
    a:hover {
      border-color: var(--brand);
      background: #f2faef;
    }
    .snippet {
      margin-top: 18px;
      background: #102015;
      color: #dff3d8;
      border-radius: 8px;
      padding: 16px;
      overflow: auto;
    }
    .snippet code { color: inherit; }
    @media (max-width: 760px) {
      main { padding: 28px 0; }
      header { grid-template-columns: 1fr; }
      .grid { grid-template-columns: 1fr; }
      li { grid-template-columns: 64px minmax(0, 1fr); }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="logo" aria-label="easy.js logo">${getLogoSvg()}</div>
      <div>
        <h1>easy.js backend</h1>
        <p class="sub">${escapeHtml(payload.message)}. Your API is ready; use the routes below or open the health checks.</p>
        <div class="meta">
          <span>${escapeHtml(payload.package)}</span>
          <span>v${escapeHtml(payload.version)}</span>
          <span>Node.js / Express</span>
        </div>
      </div>
    </header>
    <div class="grid">
      <section>
        <h2>Routes</h2>
        <ul>${routes}</ul>
      </section>
      <section>
        <h2>Tools</h2>
        <div class="links">${endpointLinks}</div>
        <pre class="snippet"><code>curl ${escapeHtml(payload.endpoints.health || '/health')}
curl /?format=json</code></pre>
      </section>
    </div>
  </main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  buildLandingPayload,
  renderLandingPage,
  wantsJson
};
