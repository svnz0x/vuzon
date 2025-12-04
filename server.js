const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const basicAuth = require('express-basic-auth');
const pino = require('pino-http')();
const path = require('path');
require('dotenv').config();

const { updateRuleEnabled, setCfClientForTesting } = require('./src/services/cloudflare');
const apiRoutes = require('./src/routes/api');

const { 
  PORT = 3000, 
  CF_API_TOKEN, 
  CF_ACCOUNT_ID, 
  CF_ZONE_ID, 
  DOMAIN,
  AUTH_USER,
  AUTH_PASS
} = process.env;

// Validación de entorno crítico al inicio
if (!CF_API_TOKEN || !CF_ACCOUNT_ID || !CF_ZONE_ID || !DOMAIN) {
  console.error('FATAL: Faltan variables en .env (CF_API_TOKEN, CF_ACCOUNT_ID, CF_ZONE_ID, DOMAIN)');
  process.exit(1);
}

const app = express();

// --- Logging ---
// Logs estructurados (JSON) para producción
app.use(pino);

// --- Seguridad ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-eval'", "https://cdn.jsdelivr.net"], 
      styleSrc: ["'self'", "'unsafe-inline'"], // Permite CSS local y estilos inline (Alpine.js)
      imgSrc: ["'self'", "data:", "https://github.com"],
      connectSrc: ["'self'"],
      upgradeInsecureRequests: null, // <-- IMPORTANTE: Desactiva forzar HTTPS en local
    },
  },
}));

// Autenticación Básica (Opcional pero recomendada)
if (AUTH_USER && AUTH_PASS) {
  app.use(basicAuth({
    users: { [AUTH_USER]: AUTH_PASS },
    challenge: true,
    realm: 'vuzonAdmin'
  }));
}

// Rate Limit: 100 req / 15 min
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// --- Middleware ---
app.use(express.json());
app.use(express.static('public'));
app.use('/icons', express.static('icons'));

// --- Rutas ---
app.get('/site.webmanifest', (req, res) => res.sendFile(path.join(__dirname, 'site.webmanifest')));
app.use('/api', apiRoutes);

// Healthcheck
app.get('/health', (req, res) => res.status(200).send('ok'));

// Middleware de errores global
app.use((err, req, res, next) => {
  req.log.error(err); // Usa pino logger
  const status = err.statusCode || err.response?.status || 500;
  // En producción, oculta el mensaje interno si es 500
  const message = status === 500 ? 'Error interno del servidor' : (err.message || 'Error desconocido');
  res.status(status).json({ error: message });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`App lista en http://0.0.0.0:${PORT} (Auth: ${AUTH_USER ? 'Activado' : 'Desactivado'})`));
}

module.exports = { app, updateRuleEnabled, setCfClientForTesting };
