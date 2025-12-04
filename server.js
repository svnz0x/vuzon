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
  PORT = 8001, // <--- CAMBIO AQUÍ (antes era 3000)
  CF_API_TOKEN, 
  CF_ACCOUNT_ID, 
  CF_ZONE_ID, 
  DOMAIN,
  AUTH_USER,
  AUTH_PASS
} = process.env;

// ... (resto del código igual) ...

// Validación de entorno crítico al inicio
if (!CF_API_TOKEN || !CF_ACCOUNT_ID || !CF_ZONE_ID || !DOMAIN) {
  console.error('FATAL: Faltan variables en .env (CF_API_TOKEN, CF_ACCOUNT_ID, CF_ZONE_ID, DOMAIN)');
  process.exit(1);
}

const app = express();

// ... (configuración de middleware igual) ...

if (require.main === module) {
  app.listen(PORT, () => console.log(`App lista en http://0.0.0.0:${PORT} (Auth: ${AUTH_USER ? 'Activado' : 'Desactivado'})`));
}

module.exports = { app, updateRuleEnabled, setCfClientForTesting };
