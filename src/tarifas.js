import { comCache, consultar, numeroBR, resourceId, PACOTE_BANDEIRAS, PACOTE_TARIFAS } from './aneel.js';
import conhecidas from '../data/aliases.js';

const HORA = 3600_000;

// Tarifa residencial convencional "de aplicação" (a que consta na fatura, já com subsídios).
const FILTRO_RESIDENCIAL = {
  DscClasse: 'Residencial',
  DscSubGrupo: 'B1',
  DscBaseTarifaria: 'Tarifa de Aplicação',
  DscDetalhe: 'Não se aplica', // exclui a variante SCEE (geração distribuída)
};

export const slugify = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const hoje = () => new Date().toISOString().slice(0, 10);
const vigente = (r, data = hoje()) => r.DatInicioVigencia <= data && data <= r.DatFimVigencia;

// Distribuidoras com tarifa residencial vigente hoje.
export function listarDistribuidoras() {
  return comCache('distribuidoras', 6 * HORA, async () => {
    const id = await resourceId(PACOTE_TARIFAS, '.csv');
    const linhas = await consultar(id, {
      filters: { ...FILTRO_RESIDENCIAL, DscSubClasse: 'Residencial', DscModalidadeTarifaria: 'Convencional' },
      sort: 'DatInicioVigencia desc',
      limit: 2000,
      fields: ['SigAgente', 'NumCNPJDistribuidora', 'DatInicioVigencia', 'DatFimVigencia'],
    });
    const porCnpj = new Map();
    for (const r of linhas.filter((l) => vigente(l) && l.SigAgente !== 'Não Informado')) {
      if (!porCnpj.has(r.NumCNPJDistribuidora)) {
        const conhecida = conhecidas.find((c) => c.sigla === r.SigAgente);
        porCnpj.set(r.NumCNPJDistribuidora, {
          nome: conhecida?.nome ?? r.SigAgente,
          slug: conhecida?.slug ?? slugify(r.SigAgente),
          sigla: r.SigAgente,
          cnpj: r.NumCNPJDistribuidora,
        });
      }
    }
    return [...porCnpj.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  });
}

// Aceita slug ("energisa-pb"), sigla da ANEEL ("EPB") ou CNPJ (com ou sem pontuação).
export async function resolverDistribuidora(entrada) {
  const chave = slugify(String(entrada));
  const digitos = String(entrada).replace(/\D/g, '');
  const lista = await listarDistribuidoras();
  return (
    lista.find(
      (d) =>
        d.slug === chave ||
        slugify(d.sigla) === chave ||
        (digitos.length === 14 && d.cnpj === digitos) ||
        conhecidas.some((c) => c.sigla === d.sigla && c.apelidos.includes(chave)),
    ) ?? null
  );
}

export async function buscarPorNome(termo) {
  const t = slugify(termo);
  const lista = await listarDistribuidoras();
  return lista.filter((d) => d.slug.includes(t) || slugify(d.nome).includes(t) || slugify(d.sigla).includes(t));
}

// Cada enquadramento -> subclasses/modalidade da base da ANEEL e como nomear as tarifas.
// (A base usa travessão "–" em "Desconto Social – faixa 01".)
export const MAPA_ENQUADRAMENTO = {
  residencial: { modalidade: 'Convencional', subclasses: { convencional: 'Residencial' } },
  tarifa_social: { modalidade: 'Convencional', subclasses: { baixa_renda: 'Baixa Renda' } },
  desconto_social: {
    modalidade: 'Convencional',
    subclasses: { faixa01: 'Residencial Desconto Social – faixa 01', faixa02: 'Residencial Desconto Social – faixa 02' },
  },
  branca: { modalidade: 'Branca', subclasses: { branca: 'Residencial' } },
};

const POSTOS = { 'Fora ponta': 'fora_ponta', Intermediário: 'intermediario', Ponta: 'ponta' };

async function linhasVigentes(cnpj, subclasse, modalidade) {
  const id = await resourceId(PACOTE_TARIFAS, '.csv');
  const linhas = await consultar(id, {
    filters: { ...FILTRO_RESIDENCIAL, DscSubClasse: subclasse, DscModalidadeTarifaria: modalidade, NumCNPJDistribuidora: cnpj },
    sort: 'DatInicioVigencia desc',
    limit: 30,
  });
  const ref = linhas.find((l) => vigente(l)) ?? linhas[0];
  // Só as linhas do mesmo período (a tarifa branca tem uma linha por posto horário).
  return ref ? linhas.filter((l) => l.DatInicioVigencia === ref.DatInicioVigencia) : [];
}

const tarifaKwh = (l) => {
  const tusd = numeroBR(l.VlrTUSD);
  const te = numeroBR(l.VlrTE);
  if (tusd === null || te === null || l.DscUnidadeTerciaria !== 'MWh') return null;
  return Number(((tusd + te) / 1000).toFixed(5));
};

// Tarifas (R$/kWh, sem tributos) de uma distribuidora para um enquadramento, ou null se faltar algum componente.
export function tarifaVigente(distribuidora, enquadramento = 'residencial') {
  const mapa = MAPA_ENQUADRAMENTO[enquadramento];
  if (!mapa) return null;
  return comCache(`tarifa:${distribuidora.cnpj}:${enquadramento}`, 6 * HORA, async () => {
    const tarifas = {};
    let ref = null;
    for (const [chave, subclasse] of Object.entries(mapa.subclasses)) {
      const linhas = await linhasVigentes(distribuidora.cnpj, subclasse, mapa.modalidade);
      if (!linhas.length) return null;
      ref ??= linhas[0];
      if (enquadramento === 'branca') {
        for (const l of linhas) if (POSTOS[l.NomPostoTarifario]) tarifas[POSTOS[l.NomPostoTarifario]] = tarifaKwh(l);
      } else {
        tarifas[chave] = tarifaKwh(linhas[0]);
      }
    }
    if (Object.values(tarifas).some((v) => v === null)) return null;
    if (enquadramento === 'branca' && Object.keys(tarifas).length !== 3) return null;

    return {
      distribuidora: distribuidora.nome,
      slug: distribuidora.slug,
      cnpj: distribuidora.cnpj,
      enquadramento,
      tarifas,
      inicio_vigencia: ref.DatInicioVigencia,
      fim_vigencia: ref.DatFimVigencia,
      vigente: vigente(ref),
      resolucao: ref.DscREH,
    };
  });
}

// Bandeira acionada no mês (YYYY-MM). Se o mês ainda não foi publicado, usa a mais recente.
export function bandeiraDoMes(mes = hoje().slice(0, 7)) {
  return comCache(`bandeira:${mes}`, HORA, async () => {
    const id = await resourceId(PACOTE_BANDEIRAS, 'Acionamento');
    const linhas = await consultar(id, { sort: 'DatCompetencia desc', limit: 36 });
    const alvo = `${mes}-01`;
    const linha = linhas.find((l) => l.DatCompetencia <= alvo);
    if (!linha) return null;
    return {
      mes_solicitado: mes,
      mes_referencia: linha.DatCompetencia.slice(0, 7),
      exata: linha.DatCompetencia === alvo,
      tipo: linha.NomBandeiraAcionada,
      valor_adicional_kwh: (numeroBR(linha.VlrAdicionalBandeira) ?? 0) / 1000,
    };
  });
}
