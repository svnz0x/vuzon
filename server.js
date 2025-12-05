const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const pino = require('pino-http')();
const path = require('path');
const crypto = require('crypto'); // Nuevo: para generar secretos
require('dotenv').config();

const { updateRuleEnabled, setCfClientForTesting } = require('./src/services/cloudflare');
const apiRoutes = require('./src/routes/api');

// CAMBIO 1: Puerto interno fijo. Ya no se lee del .env
const PORT = 8001;

const { 
  CF_API_TOKEN, 
  CF_ACCOUNT_ID, 
  CF_ZONE_ID, 
  DOMAIN,
  AUTH_USER,
  AUTH_PASS
} = process.env;

// Validación de entorno crítico (Solo lo funcional de Cloudflare)
if (!CF_API_TOKEN || !CF_ACCOUNT_ID || !CF_ZONE_ID || !DOMAIN) {
  console.error('FATAL: Faltan variables de Cloudflare en .env');
  process.exit(1);
}

// CAMBIO 2: Autogeneración de secreto.
// Si no hay SESSION_SECRET, generamos uno aleatorio al vuelo.
// Nota: Esto invalidará las sesiones si la app se reinicia, pero simplifica la config.
const finalSessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

if (!process.env.SESSION_SECRET) {
  console.log('INFO: SESSION_SECRET no detectado, usando uno autogenerado (las sesiones se cerrarán al reiniciar).');
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

// CAMBIO 3: Configuración de Cookie "Universal"
// Asumimos secure: false por defecto para evitar problemas en local/http,
// a menos que se detecte explícitamente producción con HTTPS.
const isProduction = process.env.NODE_ENV === 'production';

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
    // Simplificación: secure false evita problemas de login en redes locales.
    // Si usas un proxy HTTPS (como Cloudflare Tunnel o Nginx), configura 'trust proxy'.
    secure: isProduction && process.env.BASE_URL?.startsWith('https'), 
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
  // Validación simple: Si no hay AUTH_USER configurado, cualquiera entra (Modo abierto)
  // O forzar autenticación si están las variables.
  if (AUTH_USER && AUTH_PASS) {
      if (username === AUTH_USER && password === AUTH_PASS) {
        req.session.authenticated = true;
        req.session.user = username;
        req.log.info(`Usuario ${username} logueado`);
        return res.redirect('/');
      }
      req.log.warn(`Login fallido: ${username}`);
      res.redirect('/login?error=1');
  } else {
      // Si el usuario no configuró pass, advertir o denegar.
      // Para simplificar, asumimos que siempre lo configuran según el .env nuevo
      res.status(500).send("Error: AUTH_USER y AUTH_PASS son requeridos en .env");
  }
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
  // Escuchamos siempre en 8001
  app.listen(PORT, '0.0.0.0', () => console.log(`App lista en puerto interno ${PORT}`));
}

module.exports = { app, updateRuleEnabled, setCfClientForTesting };
