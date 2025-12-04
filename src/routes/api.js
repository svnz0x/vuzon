const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { getClient, fetchAllPages, updateRuleEnabled } = require('../services/cloudflare');

const { CF_ACCOUNT_ID, CF_ZONE_ID, DOMAIN } = process.env;

// --- Esquemas de Validación (Zod) ---
const addressSchema = z.object({
  email: z.string().email({ message: "Email inválido" })
});

const ruleSchema = z.object({
  localPart: z.string()
    .min(1, "El alias no puede estar vacío")
    .regex(/^[a-z0-9.-]+$/i, "El alias solo puede contener letras, números, puntos y guiones"),
  destEmail: z.string().email("Email de destino inválido"),
  name: z.string().optional()
});

// Helper para envolver rutas async
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// --- Destinatarios ---
router.get('/addresses', asyncHandler(async (req, res) => {
  const path = `/accounts/${CF_ACCOUNT_ID}/email/routing/addresses`;
  const { items, resultInfo } = await fetchAllPages(path);
  res.json({ success: true, result: items, result_info: resultInfo });
}));

router.post('/addresses', asyncHandler(async (req, res) => {
  // Validación
  const result = addressSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message });
  }

  const { email } = result.data;
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
  // Validación
  const result = ruleSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.issues[0].message });
  }

  const { localPart, destEmail, name } = result.data;
  const alias = `${localPart}@${DOMAIN}`;

  const body = {
    enabled: true,
    name: name || `${alias} -> ${destEmail}`,
    matchers: [{ type: 'literal', field: 'to', value: alias }],
    actions: [{ type: 'forward', value: [destEmail] }]
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
