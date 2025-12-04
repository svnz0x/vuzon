const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const { updateRuleEnabled, setCfClientForTesting } = require('./src/services/cloudflare');
const apiRoutes = require('./src/routes/api');

const { PORT = 3000, CF_API_TOKEN, CF_ACCOUNT_ID, CF_ZONE_ID, DOMAIN } = process.env;

if (!CF_API_TOKEN || !CF_ACCOUNT_ID || !CF_ZONE_ID || !DOMAIN) {
  console.error('Faltan variables en .env (CF_API_TOKEN, CF_ACCOUNT_ID, CF_ZONE_ID, DOMAIN)');
  process.exit(1);
}

const app = express();

// --- Seguridad ---
// Helmet configura cabeceras HTTP seguras (HSTS, anti-clickjacking, etc.)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-eval'", "https://cdn.jsdelivr.net"], // Permitir Alpine.js desde CDN
      imgSrc: ["'self'", "data:", "https://github.com"], // GitHub para imágenes del README si fuera necesario
      connectSrc: ["'self'"],
    },
  },
}));

// Rate Limit: Máximo 100 peticiones por 15 minutos por IP
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

// Middleware de manejo de errores centralizado
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.statusCode || err.response?.status || 500;
  const message = err.message || 'Error interno del servidor';
  res.status(status).json({ error: message });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`App lista en http://0.0.0.0:${PORT}`));
}

module.exports = { app, updateRuleEnabled, setCfClientForTesting };
