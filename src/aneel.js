// Cliente da API de dados abertos da ANEEL (CKAN). Consulta o datastore no
// servidor (filtros + ordenação), sem baixar o CSV inteiro (>300 mil linhas).

const BASE = process.env.ANEEL_BASE_URL || 'https://dadosabertos.aneel.gov.br/api/3/action';
const TIMEOUT_MS = Number(process.env.ANEEL_TIMEOUT_MS || 30000);

export const PACOTE_TARIFAS = 'tarifas-distribuidoras-energia-eletrica';
export const PACOTE_BANDEIRAS = 'bandeiras-tarifarias';

const cache = new Map(); // chave -> { valor, expira }

// Cache com TTL. Se a ANEEL falhar, devolve o último valor conhecido (mesmo vencido).
export async function comCache(chave, ttlMs, carregar) {
  const hit = cache.get(chave);
  if (hit && hit.expira > Date.now()) return hit.valor;
  try {
    const valor = await carregar();
    cache.set(chave, { valor, expira: Date.now() + ttlMs });
    return valor;
  } catch (err) {
    if (hit) return hit.valor;
    throw err;
  }
}

export function limparCache() {
  cache.clear();
}

async function ckan(acao, params) {
  const url = new URL(`${BASE}/${acao}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw erroAneel(`ANEEL indisponível: ${err.message}`);
  }
  if (!res.ok) throw erroAneel(`ANEEL respondeu HTTP ${res.status}`);
  const corpo = await res.json();
  if (!corpo.success) throw erroAneel(`ANEEL retornou erro: ${corpo.error?.message ?? 'desconhecido'}`);
  return corpo.result;
}

function erroAneel(mensagem) {
  const e = new Error(mensagem);
  e.status = 502;
  return e;
}

// Descobre o resource_id do CSV com datastore ativo (o id muda se a ANEEL republicar o recurso).
export function resourceId(pacote, nomeContem = '') {
  return comCache(`resource:${pacote}:${nomeContem}`, 24 * 3600_000, async () => {
    const { resources } = await ckan('package_show', { id: pacote });
    const r = resources.find(
      (x) => x.format === 'CSV' && x.datastore_active && x.name.toLowerCase().includes(nomeContem.toLowerCase()),
    );
    if (!r) throw erroAneel(`Recurso CSV "${nomeContem}" não encontrado no pacote ${pacote}`);
    return r.id;
  });
}

export async function consultar(resource_id, { filters, sort, limit = 100, fields, distinct } = {}) {
  const params = { resource_id, limit };
  if (filters) params.filters = filters;
  if (sort) params.sort = sort;
  if (fields) params.fields = fields.join(',');
  if (distinct) params.distinct = 'true';
  const { records } = await ckan('datastore_search', params);
  return records;
}

// "1509,97" -> 1509.97 | ",00" -> 0 | "" -> null | "1.234,5" -> 1234.5
export function numeroBR(texto) {
  if (texto === null || texto === undefined) return null;
  const limpo = String(texto).trim().replace(/\./g, '').replace(',', '.');
  if (limpo === '') return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}
