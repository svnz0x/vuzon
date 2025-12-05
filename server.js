const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
// --- MEJORA: File Store ---
const FileStore = require('session-file-store')(session);
const pino = require('pino-http')();
const path = require('path');
require('dotenv').config();

const { updateRuleEnabled, setCfClientForTesting } = require('./src/services/cloudflare');
const apiRoutes = require('./src/routes/api');

const { 
  PORT = 8001, 
  CF_API_TOKEN, 
  CF_ACCOUNT_ID, 
  CF_ZONE_ID, 
  DOMAIN,
  AUTH_USER,
  AUTH_PASS,
  SESSION_SECRET = 'secret_default_change_me' 
} = process.env;

// Validación de entorno crítico
if (!CF_API_TOKEN || !CF_ACCOUNT_ID || !CF_ZONE_ID || !DOMAIN) {
  console.error('FATAL: Faltan variables en .env');
  process.exit(1);
}

const app = express();

// --- Logging ---
app.use(pino);

// --- Seguridad ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-eval'", "https://cdn.jsdelivr.net"], 
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://github.com"],
      connectSrc: ["'self'"],
      upgradeInsecureRequests: null,
    },
  },
}));

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Sesión ---
app.use(session({
  name: 'vuzon_sid',
  secret: SESSION_SECRET,
  // --- MEJORA: Persistencia en disco ---
  store: new FileStore({
    path: './sessions',
    ttl: 86400, // 24 horas en segundos
    retries: 0
  }),
  resave: false,
  saveUninitialized: false,
  cookie: { 
    httpOnly: true, 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 horas
    sameSite: 'lax'
  }
}));

// Rate Limit
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // --- MEJORA: Límite aumentado ---
  max: 500, // Aumentado de 100 a 500 para uso intensivo de UI
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// --- Estáticos ---
// index: false evita servir index.html automáticamente sin auth
app.use(express.static('public', { index: false }));
app.use('/icons', express.static('icons'));

// --- Rutas Auth ---
app.get('/login', (req, res) => {
  if (req.session.authenticated) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === AUTH_USER && password === AUTH_PASS) {
    req.session.authenticated = true;
    req.session.user = username;
    req.log.info(`Usuario ${username} logueado`);
    return res.redirect('/');
  }
  req.log.warn(`Login fallido: ${username}`);
  res.redirect('/login?error=1');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// --- Middleware Protección ---
const requireAuth = (req, res, next) => {
  if (AUTH_USER && AUTH_PASS && !req.session.authenticated) {
    if (req.path.startsWith('/api')) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    return res.redirect('/login');
  }
  next();
};

// --- Rutas Protegidas ---
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/site.webmanifest', (req, res) => res.sendFile(path.join(__dirname, 'public', 'site.webmanifest')));
app.use('/api', requireAuth, apiRoutes);

app.get('/health', (req, res) => res.status(200).send('ok'));

app.use((err, req, res, next) => {
  req.log.error(err);
  const status = err.statusCode || err.response?.status || 500;
  const message = status === 500 ? 'Error interno' : (err.message || 'Error');
  res.status(status).json({ error: message });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`App lista en http://0.0.0.0:${PORT}`));
}

module.exports = { app, updateRuleEnabled, setCfClientForTesting };
