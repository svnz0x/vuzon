const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const pino = require('pino-http')();
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
require('dotenv').config();

const { updateRuleEnabled, setCfClientForTesting } = require('./src/services/cloudflare');
const apiRoutes = require('./src/routes/api');

// --- Configuración Zero Config ---
const PORT = 8001; // Puerto interno fijo

const { 
  CF_API_TOKEN, 
  CF_ACCOUNT_ID, 
  CF_ZONE_ID, 
  DOMAIN,
  AUTH_USER,
  AUTH_PASS
} = process.env;

// Validación mínima requerida (solo credenciales de Cloudflare)
if (!CF_API_TOKEN || !CF_ACCOUNT_ID || !CF_ZONE_ID || !DOMAIN) {
  console.error('FATAL: Faltan variables de Cloudflare en .env (CF_API_TOKEN, CF_ACCOUNT_ID, CF_ZONE_ID, DOMAIN)');
  process.exit(1);
}

// --- Gestión del Secreto de Sesión (Persistente) ---
const secretFilePath = path.join(__dirname, '.session_secret');
let finalSessionSecret = process.env.SESSION_SECRET;

if (!finalSessionSecret) {
  // Si el usuario no puso secreto, intentamos leer el generado anteriormente
  if (fs.existsSync(secretFilePath)) {
    try {
      finalSessionSecret = fs.readFileSync(secretFilePath, 'utf-8');
    } catch (err) {
      console.error('WARN: No se pudo leer el archivo .session_secret');
    }
  }
  
  // Si aún no tenemos secreto (ni en env ni en archivo), generamos uno nuevo y lo guardamos
  if (!finalSessionSecret) {
    finalSessionSecret = crypto.randomBytes(32).toString('hex');
    try {
      fs.writeFileSync(secretFilePath, finalSessionSecret);
      console.log('INFO: Se ha generado y guardado un nuevo SESSION_SECRET en .session_secret');
    } catch (err) {
      console.error('WARN: No se pudo guardar el secreto en disco. Las sesiones se cerrarán al reiniciar el contenedor.');
    }
  }
}

const app = express();

// --- Configuración de Proxy (Vital para Docker) ---
// Confía en el primer proxy (ej. Nginx, Cloudflare Tunnel, Docker internal network)
app.set('trust proxy', 1);

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
const isProductionHttps = process.env.NODE_ENV === 'production' && process.env.BASE_URL?.startsWith('https');

app.use(session({
  name: 'vuzon_sid',
  secret: finalSessionSecret,
  store: new FileStore({
    path: './sessions',
    ttl: 86400,
    retries: 0
  }),
  resave: false,
  saveUninitialized: false,
  cookie: { 
    httpOnly: true, 
    // Secure solo si estamos seguros de que es prod+https, si no false para evitar problemas de login
    secure: isProductionHttps, 
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
}));

// Rate Limit
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// --- Estáticos ---
app.use(express.static('public', { index: false }));
app.use('/icons', express.static('icons'));

// --- Rutas Auth ---
app.get('/login', (req, res) => {
  if (req.session.authenticated) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  if (AUTH_USER && AUTH_PASS) {
    if (username === AUTH_USER && password === AUTH_PASS) {
      req.session.authenticated = true;
      req.session.user = username;
      req.log.info(`Usuario ${username} logueado`);
      return res.redirect('/');
    }
    req.log.warn(`Login fallido: ${username}`);
    return res.redirect('/login?error=1');
  }
  
  // Si no hay variables de entorno de auth configuradas
  res.status(500).send('Error: AUTH_USER y AUTH_PASS no están configurados en el .env');
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
  // Escuchamos en todas las interfaces del contenedor
  app.listen(PORT, '0.0.0.0', () => console.log(`App lista en puerto interno ${PORT}`));
}

module.exports = { app, updateRuleEnabled, setCfClientForTesting };
