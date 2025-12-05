const axios = require('axios');
// require('dotenv').config();  <-- ELIMINADO

const { CF_API_TOKEN, CF_ZONE_ID } = process.env;

const cfInstance = axios.create({
  baseURL: 'https://api.cloudflare.com/client/v4',
  headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' }
});

let currentClient = cfInstance;

function getClient() {
  return currentClient;
}

function setCfClientForTesting(client) {
  currentClient = client || cfInstance;
}

async function fetchAllPages(path, { perPage = 100, params = {} } = {}) {
  const client = getClient();
  const items = [];
  let page = 1;
  let totalPages = 1;
  let baseInfo = null;

  while (page <= totalPages) {
    const query = { ...params, page, per_page: perPage };
    const response = await client.get(path, { params: query });
    const data = response.data ?? {};
    
    // Cloudflare a veces devuelve { result: [...] } o { result: { result: [...] } }
    const pageItems = Array.isArray(data.result) ? data.result : (data.result?.result ?? []);
    items.push(...pageItems);

    const info = data.result_info ?? data.result?.result_info;
    if (!baseInfo && info) baseInfo = info;
    
    if (info) {
      const reportedTotal = Number(info.total_pages ?? info.totalPages);
      if (Number.isFinite(reportedTotal) && reportedTotal > 0) {
        totalPages = Math.max(totalPages, reportedTotal);
      }
    } else {
      break;
    }
    if (page >= totalPages) break;
    page += 1;
  }

  return { items, resultInfo: baseInfo };
}

// Helpers para actualizar reglas (lógica compleja movida aquí)
function normalizeRulePayload(rule) {
    if (!rule) return null;
    const payload = {};
    if (rule.id) payload.id = rule.id;
    if (Array.isArray(rule.matchers)) payload.matchers = rule.matchers;
    if (Array.isArray(rule.actions)) payload.actions = rule.actions;
    if (rule.name != null) payload.name = rule.name;
    if (typeof rule.priority === 'number') payload.priority = rule.priority;
    return Object.keys(payload).length ? payload : null;
}
  
async function getRuleForUpdate(ruleIdentifier) {
    const client = getClient();
    try {
      const detailPath = `/zones/${CF_ZONE_ID}/email/routing/rules/${ruleIdentifier}`;
      const ruleResp = await client.get(detailPath);
      const rule = ruleResp.data?.result ?? ruleResp.data;
      const normalized = normalizeRulePayload(rule);
      if (normalized?.matchers && normalized?.actions) return normalized;
    } catch (err) {
      if (err.response?.status && err.response.status !== 404) throw err;
    }
    // Fallback: buscar en lista si falla el get por ID
    const listPath = `/zones/${CF_ZONE_ID}/email/routing/rules`;
    const { items } = await fetchAllPages(listPath);
    const target = items.find(r => (r.id ?? r.tag) === ruleIdentifier);
    return normalizeRulePayload(target);
}

async function updateRuleEnabled(ruleIdentifier, enabled) {
    const client = getClient();
    const payload = await getRuleForUpdate(ruleIdentifier);
  
    if (!payload || !payload.matchers || !payload.actions) {
      const error = new Error('Regla no encontrada o incompleta');
      error.statusCode = 404;
      throw error;
    }
  
    const { id: _omit, ...body } = payload;
    const pathId = encodeURIComponent(payload.id || ruleIdentifier);
    
    return await client.put(`/zones/${CF_ZONE_ID}/email/routing/rules/${pathId}`, {
      ...body,
      enabled
    });
}

module.exports = {
  getClient,
  setCfClientForTesting,
  fetchAllPages,
  updateRuleEnabled
};
