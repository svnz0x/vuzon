const express = require('express');
const router = express.Router();
const { getClient, fetchAllPages, updateRuleEnabled } = require('../services/cloudflare');

const { CF_ACCOUNT_ID, CF_ZONE_ID, DOMAIN } = process.env;

const LOCAL_PART_REGEX = /^[A-Za-z0-9.-]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Helper para envolver rutas async y pasar errores al middleware
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// --- Destinatarios ---
router.get('/addresses', asyncHandler(async (req, res) => {
  const path = `/accounts/${CF_ACCOUNT_ID}/email/routing/addresses`;
  const { items, resultInfo } = await fetchAllPages(path);
  res.json({ success: true, result: items, result_info: resultInfo });
}));

router.post('/addresses', asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  const r = await getClient().post(`/accounts/${CF_ACCOUNT_ID}/email/routing/addresses`, { email });
  res.json(r.data);
}));

router.delete('/addresses/:id', asyncHandler(async (req, res) => {
  const r = await getClient().delete(`/accounts/${CF_ACCOUNT_ID}/email/routing/addresses/${req.params.id}`);
  res.json(r.data);
}));

// --- Reglas ---
router.get('/rules', asyncHandler(async (req, res) => {
  const path = `/zones/${CF_ZONE_ID}/email/routing/rules`;
  const { items, resultInfo } = await fetchAllPages(path);
  res.json({ success: true, result: items, result_info: resultInfo });
}));

router.post('/rules', asyncHandler(async (req, res) => {
  const { localPart, destEmail, name } = req.body || {};
  const normalizedLocalPart = typeof localPart === 'string' ? localPart.trim() : '';
  const normalizedDestEmail = typeof destEmail === 'string' ? destEmail.trim() : '';

  if (!normalizedLocalPart || !normalizedDestEmail) {
    return res.status(400).json({ error: 'Alias y destino requeridos' });
  }
  if (!LOCAL_PART_REGEX.test(normalizedLocalPart)) {
    return res.status(400).json({ error: 'El alias contiene caracteres inválidos' });
  }
  if (!EMAIL_REGEX.test(normalizedDestEmail)) {
    return res.status(400).json({ error: 'Email de destino inválido' });
  }

  const alias = `${normalizedLocalPart}@${DOMAIN}`;
  const body = {
    enabled: true,
    name: name || `${alias} -> ${normalizedDestEmail}`,
    matchers: [{ type: 'literal', field: 'to', value: alias }],
    actions: [{ type: 'forward', value: [normalizedDestEmail] }]
  };
  
  const r = await getClient().post(`/zones/${CF_ZONE_ID}/email/routing/rules`, body);
  res.json(r.data);
}));

router.delete('/rules/:id', asyncHandler(async (req, res) => {
  const r = await getClient().delete(`/zones/${CF_ZONE_ID}/email/routing/rules/${req.params.id}`);
  res.json(r.data);
}));

router.post('/rules/:id/disable', asyncHandler(async (req, res) => {
  const r = await updateRuleEnabled(req.params.id, false);
  res.json(r.data);
}));

router.post('/rules/:id/enable', asyncHandler(async (req, res) => {
  const r = await updateRuleEnabled(req.params.id, true);
  res.json(r.data);
}));

router.post('/enable-routing', asyncHandler(async (req, res) => {
  const r = await getClient().post(`/zones/${CF_ZONE_ID}/email/routing/dns`);
  res.json(r.data);
}));

module.exports = router;
