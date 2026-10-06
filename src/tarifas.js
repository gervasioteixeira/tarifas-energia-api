import { comCache, consultar, numeroBR, resourceId, PACOTE_BANDEIRAS, PACOTE_TARIFAS } from './aneel.js';
import aliases from '../data/aliases.js';

const HORA = 3600_000;

// Tarifa residencial convencional "de aplicação" (a que consta na fatura, já com subsídios).
const FILTRO_RESIDENCIAL = {
  DscClasse: 'Residencial',
  DscSubClasse: 'Residencial',
  DscSubGrupo: 'B1',
  DscModalidadeTarifaria: 'Convencional',
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
      filters: FILTRO_RESIDENCIAL,
      sort: 'DatInicioVigencia desc',
      limit: 2000,
      fields: ['SigAgente', 'NumCNPJDistribuidora', 'DatInicioVigencia', 'DatFimVigencia'],
    });
    const porCnpj = new Map();
    for (const r of linhas.filter((l) => vigente(l))) {
      if (!porCnpj.has(r.NumCNPJDistribuidora)) {
        porCnpj.set(r.NumCNPJDistribuidora, {
          nome: r.SigAgente,
          slug: slugify(r.SigAgente),
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
  const sigla = aliases[chave] && slugify(aliases[chave]);
  return (
    lista.find((d) => d.slug === chave || d.slug === sigla || (digitos.length === 14 && d.cnpj === digitos)) ?? null
  );
}

export async function buscarPorNome(termo) {
  const t = slugify(termo);
  const lista = await listarDistribuidoras();
  const viaAlias = Object.entries(aliases).filter(([a]) => a.includes(t)).map(([, sigla]) => slugify(sigla));
  return lista.filter((d) => d.slug.includes(t) || viaAlias.includes(d.slug));
}

// Tarifa residencial vigente (R$/kWh, sem tributos) de uma distribuidora.
export function tarifaVigente(distribuidora) {
  return comCache(`tarifa:${distribuidora.cnpj}`, 6 * HORA, async () => {
    const id = await resourceId(PACOTE_TARIFAS, '.csv');
    const linhas = await consultar(id, {
      filters: { ...FILTRO_RESIDENCIAL, NumCNPJDistribuidora: distribuidora.cnpj },
      sort: 'DatInicioVigencia desc',
      limit: 20,
    });
    const linha = linhas.find((l) => vigente(l)) ?? linhas[0];
    if (!linha) return null;

    const tusd = numeroBR(linha.VlrTUSD);
    const te = numeroBR(linha.VlrTE);
    if (tusd === null || te === null || linha.DscUnidadeTerciaria !== 'MWh') return null;

    return {
      distribuidora: distribuidora.nome,
      slug: distribuidora.slug,
      cnpj: distribuidora.cnpj,
      subgrupo: linha.DscSubGrupo,
      modalidade: linha.DscModalidadeTarifaria,
      tusd_kwh: tusd / 1000,
      te_kwh: te / 1000,
      tarifa_kwh: Number(((tusd + te) / 1000).toFixed(5)),
      inicio_vigencia: linha.DatInicioVigencia,
      fim_vigencia: linha.DatFimVigencia,
      vigente: vigente(linha),
      resolucao: linha.DscREH,
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
