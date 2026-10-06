// Tarifas de energia residencial a partir dos dados abertos da ANEEL.
// Porta para TypeScript da API https://github.com/gervasioteixeira/tarifas-energia-api, para rodar
// dentro do app (server route em src/routes/api/tarifas.$.ts). Só roda no servidor.

const BASE = "https://dadosabertos.aneel.gov.br/api/3/action";
const PACOTE_TARIFAS = "tarifas-distribuidoras-energia-eletrica";
const PACOTE_BANDEIRAS = "bandeiras-tarifarias";
const HORA = 3_600_000;

type Row = Record<string, string | number | undefined>;
type Json = Record<string, unknown>;

// ---------- cliente ANEEL (CKAN) ----------

class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const cache = new Map<string, { valor: unknown; expira: number }>();

// Cache com TTL; se a ANEEL falhar, devolve o último valor conhecido (mesmo vencido).
async function comCache<T>(chave: string, ttl: number, carregar: () => Promise<T>): Promise<T> {
  const hit = cache.get(chave);
  if (hit && hit.expira > Date.now()) return hit.valor as T;
  try {
    const valor = await carregar();
    cache.set(chave, { valor, expira: Date.now() + ttl });
    return valor;
  } catch (err) {
    if (hit) return hit.valor as T;
    throw err;
  }
}

async function ckan(acao: string, params: Record<string, unknown>): Promise<Json> {
  const url = new URL(`${BASE}/${acao}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch (err) {
    throw new ApiError(502, `ANEEL indisponível: ${(err as Error).message}`);
  }
  if (!res.ok) throw new ApiError(502, `ANEEL respondeu HTTP ${res.status}`);
  const corpo = (await res.json()) as { success?: boolean; result?: Json; error?: { message?: string } };
  if (!corpo.success || !corpo.result) throw new ApiError(502, `ANEEL retornou erro: ${corpo.error?.message ?? "desconhecido"}`);
  return corpo.result;
}

function resourceId(pacote: string, nomeContem: string): Promise<string> {
  return comCache(`resource:${pacote}:${nomeContem}`, 24 * HORA, async () => {
    const r = await ckan("package_show", { id: pacote });
    const resources = (r["resources"] ?? []) as { id: string; format: string; name: string; datastore_active: boolean }[];
    const achado = resources.find(
      (x) => x.format === "CSV" && x.datastore_active && x.name.toLowerCase().includes(nomeContem.toLowerCase()),
    );
    if (!achado) throw new ApiError(502, `Recurso CSV "${nomeContem}" não encontrado no pacote ${pacote}`);
    return achado.id;
  });
}

async function consultar(
  resource_id: string,
  opts: { filters?: Record<string, string>; sort?: string; limit?: number; fields?: string[] },
): Promise<Row[]> {
  const params: Record<string, unknown> = { resource_id, limit: opts.limit ?? 100 };
  if (opts.filters) params["filters"] = opts.filters;
  if (opts.sort) params["sort"] = opts.sort;
  if (opts.fields) params["fields"] = opts.fields.join(",");
  const r = await ckan("datastore_search", params);
  return (r["records"] ?? []) as Row[];
}

// "1509,97" -> 1509.97 | ",00" -> 0 | "" -> null | "1.234,5" -> 1234.5
export function numeroBR(texto: unknown): number | null {
  if (texto === null || texto === undefined) return null;
  const limpo = String(texto).trim().replace(/\./g, "").replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

const txt = (r: Row, k: string) => String(r[k] ?? "");

// ---------- distribuidoras ----------

type Conhecida = { slug: string; sigla: string; nome: string; apelidos: string[] };

// slug amigável (usado pelo app) -> sigla da ANEEL (SigAgente). A Energisa Paraíba é "EPB" na ANEEL.
const CONHECIDAS: Conhecida[] = [
  { slug: "energisa-pb", sigla: "EPB", nome: "Energisa Paraíba", apelidos: ["energisa-paraiba"] },
  { slug: "energisa-ms", sigla: "EMS", nome: "Energisa Mato Grosso do Sul", apelidos: ["energisa-mato-grosso-do-sul"] },
  { slug: "energisa-mt", sigla: "EMT", nome: "Energisa Mato Grosso", apelidos: ["energisa-mato-grosso"] },
  { slug: "energisa-ro", sigla: "ERO", nome: "Energisa Rondônia", apelidos: ["energisa-rondonia"] },
  { slug: "energisa-ac", sigla: "EAC", nome: "Energisa Acre", apelidos: ["energisa-acre"] },
  { slug: "energisa-se", sigla: "ESE", nome: "Energisa Sergipe", apelidos: ["energisa-sergipe"] },
  { slug: "energisa-to", sigla: "ETO", nome: "Energisa Tocantins", apelidos: ["energisa-tocantins"] },
  { slug: "energisa-sul-sudeste", sigla: "ESS", nome: "Energisa Sul-Sudeste", apelidos: [] },
  { slug: "energisa-mg", sigla: "EMR", nome: "Energisa Minas Rio", apelidos: ["energisa-minas-rio"] },
  { slug: "cemig", sigla: "CEMIG-D", nome: "Cemig", apelidos: ["cemig-d"] },
  { slug: "enel-sp", sigla: "ELETROPAULO", nome: "Enel São Paulo", apelidos: ["eletropaulo"] },
  { slug: "enel-rj", sigla: "ENEL RJ", nome: "Enel Rio", apelidos: [] },
  { slug: "enel-ce", sigla: "ENEL CE", nome: "Enel Ceará", apelidos: [] },
  { slug: "light", sigla: "LIGHT SESA", nome: "Light", apelidos: ["light-sesa"] },
  { slug: "cpfl-paulista", sigla: "CPFL-PAULISTA", nome: "CPFL Paulista", apelidos: [] },
  { slug: "copel", sigla: "COPEL-DIS", nome: "Copel", apelidos: ["copel-dis"] },
  { slug: "celesc", sigla: "CELESC", nome: "Celesc", apelidos: [] },
  { slug: "coelba", sigla: "COELBA", nome: "Neoenergia Coelba", apelidos: [] },
  { slug: "celpe", sigla: "Neoenergia PE", nome: "Neoenergia Pernambuco", apelidos: ["neoenergia-pe"] },
  { slug: "cosern", sigla: "COSERN", nome: "Neoenergia Cosern", apelidos: [] },
  { slug: "neoenergia-brasilia", sigla: "Neoenergia Brasília", nome: "Neoenergia Brasília", apelidos: [] },
  { slug: "equatorial-pa", sigla: "EQUATORIAL PA", nome: "Equatorial Pará", apelidos: [] },
  { slug: "equatorial-ma", sigla: "EQUATORIAL MA", nome: "Equatorial Maranhão", apelidos: [] },
  { slug: "rge", sigla: "RGE", nome: "RGE Sul", apelidos: [] },
];

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const hoje = () => new Date().toISOString().slice(0, 10);
const vigente = (r: Row, data = hoje()) => txt(r, "DatInicioVigencia") <= data && data <= txt(r, "DatFimVigencia");

// Tarifa "de aplicação" (a que consta na fatura), grupo B1, sem a variante SCEE (geração distribuída).
const FILTRO_RESIDENCIAL = {
  DscClasse: "Residencial",
  DscSubGrupo: "B1",
  DscBaseTarifaria: "Tarifa de Aplicação",
  DscDetalhe: "Não se aplica",
};

type Distribuidora = { nome: string; slug: string; sigla: string; cnpj: string };

function listarDistribuidoras(): Promise<Distribuidora[]> {
  return comCache("distribuidoras", 6 * HORA, async () => {
    const id = await resourceId(PACOTE_TARIFAS, ".csv");
    const linhas = await consultar(id, {
      filters: { ...FILTRO_RESIDENCIAL, DscSubClasse: "Residencial", DscModalidadeTarifaria: "Convencional" },
      sort: "DatInicioVigencia desc",
      limit: 2000,
      fields: ["SigAgente", "NumCNPJDistribuidora", "DatInicioVigencia", "DatFimVigencia"],
    });
    const porCnpj = new Map<string, Distribuidora>();
    for (const r of linhas) {
      const sigla = txt(r, "SigAgente");
      const cnpj = txt(r, "NumCNPJDistribuidora");
      if (!vigente(r) || sigla === "Não Informado" || porCnpj.has(cnpj)) continue;
      const c = CONHECIDAS.find((x) => x.sigla === sigla);
      porCnpj.set(cnpj, { nome: c?.nome ?? sigla, slug: c?.slug ?? slugify(sigla), sigla, cnpj });
    }
    return [...porCnpj.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  });
}

// Aceita slug ("energisa-pb"), sigla da ANEEL ("EPB") ou CNPJ (com ou sem pontuação).
async function resolverDistribuidora(entrada: string): Promise<Distribuidora | null> {
  const chave = slugify(entrada);
  const digitos = entrada.replace(/\D/g, "");
  const lista = await listarDistribuidoras();
  return (
    lista.find(
      (d) =>
        d.slug === chave ||
        slugify(d.sigla) === chave ||
        (digitos.length === 14 && d.cnpj === digitos) ||
        CONHECIDAS.some((c) => c.sigla === d.sigla && c.apelidos.includes(chave)),
    ) ?? null
  );
}

async function buscarPorNome(termo: string): Promise<Distribuidora[]> {
  const t = slugify(termo);
  return (await listarDistribuidoras()).filter(
    (d) => d.slug.includes(t) || slugify(d.nome).includes(t) || slugify(d.sigla).includes(t),
  );
}

// ---------- tarifas ----------

export const ENQUADRAMENTOS = ["residencial", "tarifa_social", "desconto_social", "branca"] as const;
export type Enquadramento = (typeof ENQUADRAMENTOS)[number];
const POSTOS_BRANCA = ["fora_ponta", "intermediario", "ponta"] as const;
type Posto = (typeof POSTOS_BRANCA)[number];
const POSTO_ANEEL: Record<string, Posto> = { "Fora ponta": "fora_ponta", Intermediário: "intermediario", Ponta: "ponta" };

// Subclasses/modalidade na base da ANEEL (que usa travessão "–" em "Desconto Social – faixa 01").
const MAPA: Record<Enquadramento, { modalidade: string; subclasses: Record<string, string> }> = {
  residencial: { modalidade: "Convencional", subclasses: { convencional: "Residencial" } },
  tarifa_social: { modalidade: "Convencional", subclasses: { baixa_renda: "Baixa Renda" } },
  desconto_social: {
    modalidade: "Convencional",
    subclasses: { faixa01: "Residencial Desconto Social – faixa 01", faixa02: "Residencial Desconto Social – faixa 02" },
  },
  branca: { modalidade: "Branca", subclasses: { branca: "Residencial" } },
};

type TarifaVigente = {
  distribuidora: string;
  slug: string;
  cnpj: string;
  enquadramento: Enquadramento;
  tarifas: Record<string, number>;
  inicio_vigencia: string;
  fim_vigencia: string;
  vigente: boolean;
  resolucao: string;
};

async function linhasVigentes(cnpj: string, subclasse: string, modalidade: string): Promise<Row[]> {
  const id = await resourceId(PACOTE_TARIFAS, ".csv");
  const linhas = await consultar(id, {
    filters: { ...FILTRO_RESIDENCIAL, DscSubClasse: subclasse, DscModalidadeTarifaria: modalidade, NumCNPJDistribuidora: cnpj },
    sort: "DatInicioVigencia desc",
    limit: 30,
  });
  const ref = linhas.find((l) => vigente(l)) ?? linhas[0];
  // Só as linhas do mesmo período (a tarifa branca tem uma linha por posto horário).
  return ref ? linhas.filter((l) => l["DatInicioVigencia"] === ref["DatInicioVigencia"]) : [];
}

function tarifaKwh(l: Row): number | null {
  const tusd = numeroBR(l["VlrTUSD"]);
  const te = numeroBR(l["VlrTE"]);
  if (tusd === null || te === null || l["DscUnidadeTerciaria"] !== "MWh") return null;
  return Number(((tusd + te) / 1000).toFixed(5));
}

function tarifaVigente(d: Distribuidora, enq: Enquadramento): Promise<TarifaVigente | null> {
  return comCache(`tarifa:${d.cnpj}:${enq}`, 6 * HORA, async () => {
    const mapa = MAPA[enq];
    const tarifas: Record<string, number> = {};
    let ref: Row | undefined;
    for (const [chave, subclasse] of Object.entries(mapa.subclasses)) {
      const linhas = await linhasVigentes(d.cnpj, subclasse, mapa.modalidade);
      const primeira = linhas[0];
      if (!primeira) return null;
      ref ??= primeira;
      const alvo = enq === "branca" ? linhas : [primeira];
      for (const l of alvo) {
        const v = tarifaKwh(l);
        if (v === null) return null;
        const nome = enq === "branca" ? POSTO_ANEEL[txt(l, "NomPostoTarifario")] : chave;
        if (nome) tarifas[nome] = v;
      }
    }
    if (!ref) return null;
    if (enq === "branca" && Object.keys(tarifas).length !== 3) return null;
    return {
      distribuidora: d.nome,
      slug: d.slug,
      cnpj: d.cnpj,
      enquadramento: enq,
      tarifas,
      inicio_vigencia: txt(ref, "DatInicioVigencia"),
      fim_vigencia: txt(ref, "DatFimVigencia"),
      vigente: vigente(ref),
      resolucao: txt(ref, "DscREH"),
    };
  });
}

type Bandeira = { mes_solicitado: string; mes_referencia: string; exata: boolean; tipo: string; valor_adicional_kwh: number };

// Bandeira acionada no mês (YYYY-MM). Se o mês ainda não foi publicado, usa a mais recente.
function bandeiraDoMes(mes: string = hoje().slice(0, 7)): Promise<Bandeira | null> {
  return comCache(`bandeira:${mes}`, HORA, async () => {
    const id = await resourceId(PACOTE_BANDEIRAS, "Acionamento");
    const linhas = await consultar(id, { sort: "DatCompetencia desc", limit: 36 });
    const alvo = `${mes}-01`;
    const l = linhas.find((x) => txt(x, "DatCompetencia") <= alvo);
    if (!l) return null;
    return {
      mes_solicitado: mes,
      mes_referencia: txt(l, "DatCompetencia").slice(0, 7),
      exata: txt(l, "DatCompetencia") === alvo,
      tipo: txt(l, "NomBandeiraAcionada"),
      valor_adicional_kwh: (numeroBR(l["VlrAdicionalBandeira"]) ?? 0) / 1000,
    };
  });
}

// ---------- cálculo (puro) ----------

export const DISPONIBILIDADE_KWH = { monofasico: 30, bifasico: 50, trifasico: 100 } as const;
export type TipoLigacao = keyof typeof DISPONIBILIDADE_KWH;
const LIMITE_TARIFA_SOCIAL_KWH = 80; // Tarifa Social: tarifa zerada até 80 kWh
const LIMITE_DESCONTO_SOCIAL_KWH = 120; // Desconto Social: faixa 01 até 120 kWh

type Segmento = { rotulo: string; kwh: number; tarifa_kwh: number; incide_bandeira: boolean };

const arredonda = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function montarSegmentos(
  enq: Enquadramento,
  kwh: number,
  t: Record<string, number>,
  porPosto: Partial<Record<Posto, number>>,
): Segmento[] {
  const g = (k: string) => t[k] ?? 0;
  switch (enq) {
    case "residencial":
      return [{ rotulo: "residencial", kwh, tarifa_kwh: g("convencional"), incide_bandeira: true }];
    case "tarifa_social": {
      const isento = Math.min(kwh, LIMITE_TARIFA_SOCIAL_KWH);
      return [
        { rotulo: "isento (tarifa social)", kwh: isento, tarifa_kwh: 0, incide_bandeira: false },
        { rotulo: "acima do limite", kwh: kwh - isento, tarifa_kwh: g("baixa_renda"), incide_bandeira: true },
      ];
    }
    case "desconto_social": {
      const f1 = Math.min(kwh, LIMITE_DESCONTO_SOCIAL_KWH);
      return [
        { rotulo: "faixa 01", kwh: f1, tarifa_kwh: g("faixa01"), incide_bandeira: true },
        { rotulo: "faixa 02", kwh: kwh - f1, tarifa_kwh: g("faixa02"), incide_bandeira: true },
      ];
    }
    case "branca": {
      const seg = POSTOS_BRANCA.map((p) => ({ rotulo: p as string, kwh: porPosto[p] ?? 0, tarifa_kwh: g(p), incide_bandeira: true }));
      const total = seg.reduce((s, x) => s + x.kwh, 0);
      const primeiro = seg[0];
      if (primeiro && kwh > total) primeiro.kwh += kwh - total; // complemento do mínimo, no fora de ponta
      return seg;
    }
  }
}

export function calcularFatura(p: {
  consumo_kwh: number;
  enquadramento: Enquadramento;
  tarifas: Record<string, number>;
  consumo_por_posto: Partial<Record<Posto, number>>;
  adicional_bandeira_kwh: number;
  tipo_ligacao?: TipoLigacao | undefined;
  icms_percentual?: number | undefined;
  pis_cofins_percentual?: number | undefined;
  cosip?: number | undefined;
}) {
  const minimo = p.tipo_ligacao ? DISPONIBILIDADE_KWH[p.tipo_ligacao] : 0;
  const kwh_faturado = Math.max(p.consumo_kwh, minimo);
  const segmentos = montarSegmentos(p.enquadramento, kwh_faturado, p.tarifas, p.consumo_por_posto);
  const energia = segmentos.reduce((s, x) => s + x.kwh * x.tarifa_kwh, 0);
  const bandeira = segmentos.reduce((s, x) => s + (x.incide_bandeira ? x.kwh * p.adicional_bandeira_kwh : 0), 0);
  const sem_tributos = energia + bandeira;

  const icms = (p.icms_percentual ?? 0) / 100;
  const pisCofins = (p.pis_cofins_percentual ?? 0) / 100;
  if (icms < 0 || icms >= 1 || pisCofins < 0 || pisCofins >= 1) throw new ApiError(400, "Alíquotas inválidas");
  // Tributos "por dentro" e encadeados (base do ICMS inclui o PIS/COFINS; a do PIS/COFINS exclui o ICMS):
  // total = base / ((1 - ICMS) * (1 - PIS/COFINS)). Confere com faturas reais da Energisa PB.
  const com_tributos = sem_tributos / ((1 - icms) * (1 - pisCofins));
  const cosip = p.cosip ?? 0;

  return {
    enquadramento: p.enquadramento,
    kwh_faturado,
    segmentos: segmentos.filter((x) => x.kwh > 0).map((x) => ({ ...x, valor: arredonda(x.kwh * x.tarifa_kwh) })),
    energia_tusd_te: arredonda(energia),
    adicional_bandeira: arredonda(bandeira),
    valor_sem_tributos: arredonda(sem_tributos),
    tributos: arredonda(com_tributos - sem_tributos),
    cosip: arredonda(cosip),
    valor_total_estimado: arredonda(com_tributos + cosip),
    tributos_considerados: p.icms_percentual !== undefined || p.pis_cofins_percentual !== undefined,
    kwh_faturado_media: kwh_faturado ? Number((energia / kwh_faturado).toFixed(5)) : 0,
  };
}

// ---------- HTTP ----------

const ok = (dados: unknown) => Response.json({ sucesso: true, dados });
const falha = (status: number, erro: string) => Response.json({ sucesso: false, erro }, { status });

const AVISOS_ENQUADRAMENTO: Partial<Record<Enquadramento, string>> = {
  tarifa_social: `Tarifa Social: tarifa zerada nos primeiros ${LIMITE_TARIFA_SOCIAL_KWH} kWh; acima disso foi aplicada a tarifa "Baixa Renda" da ANEEL (estimativa). Confira o tratamento de tributos e bandeira na fatura.`,
  desconto_social: `Desconto Social: faixa 01 até ${LIMITE_DESCONTO_SOCIAL_KWH} kWh e faixa 02 acima disso.`,
  branca: "Tarifa Branca: o valor depende da distribuição do consumo por posto horário (consumo_por_posto).",
};

const ehEnquadramento = (v: unknown): v is Enquadramento => ENQUADRAMENTOS.some((e) => e === v);
const ehNumeroNaoNegativo = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

async function projecao(corpo: Json): Promise<Response> {
  const enquadramento = corpo["enquadramento"] ?? "residencial";
  if (!ehEnquadramento(enquadramento)) return falha(400, `enquadramento deve ser um de: ${ENQUADRAMENTOS.join(", ")}.`);

  const slug = corpo["distribuidora_slug"];
  if (typeof slug !== "string" || !slug.trim()) return falha(400, "distribuidora_slug deve ser uma string não vazia.");

  const ligacao = corpo["tipo_ligacao"];
  if (ligacao !== undefined && !(typeof ligacao === "string" && ligacao in DISPONIBILIDADE_KWH))
    return falha(400, `tipo_ligacao deve ser um de: ${Object.keys(DISPONIBILIDADE_KWH).join(", ")}.`);

  const opcionais: Record<string, number | undefined> = {};
  for (const campo of ["icms_percentual", "pis_cofins_percentual", "cosip"]) {
    const v = corpo[campo];
    if (v === undefined || v === null) continue;
    if (!ehNumeroNaoNegativo(v)) return falha(400, `${campo} deve ser um número >= 0.`);
    opcionais[campo] = v;
  }
  if ((opcionais["icms_percentual"] ?? 0) >= 100 || (opcionais["pis_cofins_percentual"] ?? 0) >= 100)
    return falha(400, "As alíquotas devem ser menores que 100.");

  const porPosto: Partial<Record<Posto, number>> = {};
  let consumo = corpo["consumo_kwh"];
  if (enquadramento === "branca") {
    const c = corpo["consumo_por_posto"];
    if (!c || typeof c !== "object") return falha(400, `consumo_por_posto deve ter números >= 0 em: ${POSTOS_BRANCA.join(", ")}.`);
    for (const p of POSTOS_BRANCA) {
      const v = (c as Json)[p];
      if (v === undefined || v === null) continue;
      if (!ehNumeroNaoNegativo(v)) return falha(400, `consumo_por_posto deve ter números >= 0 em: ${POSTOS_BRANCA.join(", ")}.`);
      porPosto[p] = v;
    }
    consumo = POSTOS_BRANCA.reduce((s, p) => s + (porPosto[p] ?? 0), 0);
  }
  if (typeof consumo !== "number" || !Number.isFinite(consumo) || consumo <= 0)
    return falha(400, enquadramento === "branca" ? "consumo_por_posto deve somar mais de 0 kWh." : "consumo_kwh deve ser um número positivo.");

  const dist = await resolverDistribuidora(slug);
  if (!dist) return falha(404, "Distribuidora não encontrada com o slug informado.");

  const [tarifa, bandeira] = await Promise.all([tarifaVigente(dist, enquadramento), bandeiraDoMes()]);
  if (!tarifa) return falha(404, `Tarifa "${enquadramento}" não encontrada para esta distribuidora.`);

  const calculo = calcularFatura({
    consumo_kwh: consumo,
    enquadramento,
    tarifas: tarifa.tarifas,
    consumo_por_posto: porPosto,
    adicional_bandeira_kwh: bandeira?.valor_adicional_kwh ?? 0,
    tipo_ligacao: ligacao as TipoLigacao | undefined,
    icms_percentual: opcionais["icms_percentual"],
    pis_cofins_percentual: opcionais["pis_cofins_percentual"],
    cosip: opcionais["cosip"],
  });

  const avisos: string[] = [];
  const avisoEnq = AVISOS_ENQUADRAMENTO[enquadramento];
  if (avisoEnq) avisos.push(avisoEnq);
  if (!calculo.tributos_considerados)
    avisos.push("ICMS e PIS/COFINS não informados: valor_total_estimado não inclui tributos e ficará abaixo da fatura real.");
  if (!tarifa.vigente) avisos.push(`Tarifa vigente ainda não publicada pela ANEEL; usada a de ${tarifa.inicio_vigencia}.`);
  if (!bandeira) avisos.push("Bandeira tarifária indisponível; considerado adicional zero.");
  else if (!bandeira.exata) avisos.push(`Bandeira de ${bandeira.mes_solicitado} ainda não publicada; usada a de ${bandeira.mes_referencia}.`);

  const { kwh_faturado_media, ...resto } = calculo;
  return ok({
    distribuidora: tarifa.distribuidora,
    consumo_kwh: consumo,
    tarifa_kwh: kwh_faturado_media, // média efetiva, sem tributos
    tarifas_kwh: tarifa.tarifas,
    vigencia_tarifa: { inicio: tarifa.inicio_vigencia, fim: tarifa.fim_vigencia },
    bandeira: bandeira && { nome: bandeira.tipo, tipo: bandeira.tipo, mes: bandeira.mes_referencia, adicional_kwh: bandeira.valor_adicional_kwh },
    ...resto,
    avisos,
  });
}

/**
 * Atende as rotas da API. `caminho` é o que vem depois do prefixo, ex.: "/distribuidoras/energisa-pb/tarifa".
 */
export async function handleTarifas(request: Request, caminho: string): Promise<Response> {
  try {
    const url = new URL(request.url);
    const partes = caminho.split("/").filter(Boolean).map(decodeURIComponent);
    if (partes[0] !== "distribuidoras") return falha(404, "Rota não encontrada.");
    const [, a, b] = partes;

    if (request.method === "POST" && a === "projecao" && !b) {
      let corpo: unknown;
      try {
        corpo = await request.json();
      } catch {
        return falha(400, "JSON inválido.");
      }
      if (!corpo || typeof corpo !== "object") return falha(400, "JSON inválido.");
      return await projecao(corpo as Json);
    }
    if (request.method !== "GET") return falha(405, "Método não permitido.");

    if (!a) return ok(await listarDistribuidoras());
    if (a === "status" && !b) return ok({ status: "ok", fonte: "ANEEL - dados abertos" });
    if (a === "enquadramentos" && !b)
      return ok({
        enquadramento: ENQUADRAMENTOS,
        tipo_ligacao: Object.entries(DISPONIBILIDADE_KWH).map(([tipo, kwh_minimo]) => ({ tipo, kwh_minimo })),
        postos_tarifa_branca: POSTOS_BRANCA,
      });
    if (a === "buscar" && !b) {
      const nome = url.searchParams.get("nome");
      if (!nome) return falha(400, "Informe o parâmetro ?nome=");
      const dados = await buscarPorNome(nome);
      return dados.length ? ok(dados) : falha(404, "Nenhuma distribuidora encontrada com esse nome.");
    }
    if (a === "bandeira" && b === "atual") {
      const mes = url.searchParams.get("mes") ?? undefined;
      if (mes && !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return falha(400, "mes deve estar no formato YYYY-MM.");
      const dados = await bandeiraDoMes(mes);
      return dados ? ok(dados) : falha(404, "Bandeira não encontrada para o período.");
    }
    if (a && b === "tarifa") {
      const enq = url.searchParams.get("enquadramento") ?? "residencial";
      if (!ehEnquadramento(enq)) return falha(400, `enquadramento deve ser um de: ${ENQUADRAMENTOS.join(", ")}.`);
      const dist = await resolverDistribuidora(a);
      if (!dist) return falha(404, "Distribuidora não encontrada. Consulte GET /distribuidoras.");
      const tarifa = await tarifaVigente(dist, enq);
      return tarifa ? ok(tarifa) : falha(404, `Tarifa "${enq}" não encontrada para esta distribuidora.`);
    }
    return falha(404, "Rota não encontrada.");
  } catch (err) {
    if (err instanceof ApiError) return falha(err.status, err.message);
    console.error("tarifas", err);
    return falha(500, "Erro interno.");
  }
}
