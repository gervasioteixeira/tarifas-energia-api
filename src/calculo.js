// Cálculo puro (sem I/O) da estimativa de fatura residencial.

// Custo de disponibilidade: consumo mínimo faturado por tipo de ligação (kWh/mês).
export const DISPONIBILIDADE_KWH = { monofasico: 30, bifasico: 50, trifasico: 100 };

// Limites de consumo dos programas sociais (kWh/mês).
export const LIMITE_TARIFA_SOCIAL_KWH = 80; // Tarifa Social: tarifa zerada até 80 kWh
export const LIMITE_DESCONTO_SOCIAL_KWH = 120; // Desconto Social: faixa 01 até 120 kWh

export const ENQUADRAMENTOS = ['residencial', 'tarifa_social', 'desconto_social', 'branca'];
export const POSTOS_BRANCA = ['fora_ponta', 'intermediario', 'ponta'];

const arredonda = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Divide o consumo faturado em segmentos { kwh, tarifa_kwh, bandeira }.
 * `tarifas` traz as tarifas (R$/kWh, sem tributos) necessárias para o enquadramento:
 *   residencial:     { convencional }
 *   tarifa_social:   { baixa_renda }
 *   desconto_social: { faixa01, faixa02 }
 *   branca:          { fora_ponta, intermediario, ponta }
 */
export function montarSegmentos({ enquadramento, kwh_faturado, tarifas, consumo_por_posto }) {
  switch (enquadramento) {
    case 'residencial':
      return [{ rotulo: 'residencial', kwh: kwh_faturado, tarifa_kwh: tarifas.convencional, bandeira: true }];
    case 'tarifa_social': {
      const isento = Math.min(kwh_faturado, LIMITE_TARIFA_SOCIAL_KWH);
      return [
        { rotulo: 'isento (tarifa social)', kwh: isento, tarifa_kwh: 0, bandeira: false },
        { rotulo: 'acima do limite', kwh: kwh_faturado - isento, tarifa_kwh: tarifas.baixa_renda, bandeira: true },
      ];
    }
    case 'desconto_social': {
      const f1 = Math.min(kwh_faturado, LIMITE_DESCONTO_SOCIAL_KWH);
      return [
        { rotulo: 'faixa 01', kwh: f1, tarifa_kwh: tarifas.faixa01, bandeira: true },
        { rotulo: 'faixa 02', kwh: kwh_faturado - f1, tarifa_kwh: tarifas.faixa02, bandeira: true },
      ];
    }
    case 'branca': {
      const seg = POSTOS_BRANCA.map((p) => ({ rotulo: p, kwh: consumo_por_posto?.[p] ?? 0, tarifa_kwh: tarifas[p], bandeira: true }));
      const total = seg.reduce((s, x) => s + x.kwh, 0);
      if (kwh_faturado > total) seg[0].kwh += kwh_faturado - total; // complemento do mínimo, no fora de ponta
      return seg;
    }
    default:
      throw new RangeError(`Enquadramento inválido: ${enquadramento}`);
  }
}

/**
 * @param {object} p
 * @param {number} p.consumo_kwh
 * @param {string} [p.enquadramento]         residencial | tarifa_social | desconto_social | branca
 * @param {object} p.tarifas                 ver montarSegmentos
 * @param {object} [p.consumo_por_posto]     só para branca: { fora_ponta, intermediario, ponta } em kWh
 * @param {number} p.adicional_bandeira_kwh  R$/kWh
 * @param {string} [p.tipo_ligacao]          monofasico | bifasico | trifasico
 * @param {number} [p.icms_percentual]       ex.: 20
 * @param {number} [p.pis_cofins_percentual] ex.: 5
 * @param {number} [p.cosip]                 contribuição de iluminação pública (R$), definida pelo município
 */
export function calcularFatura({
  consumo_kwh,
  enquadramento = 'residencial',
  tarifas,
  consumo_por_posto,
  adicional_bandeira_kwh,
  tipo_ligacao,
  icms_percentual,
  pis_cofins_percentual,
  cosip = 0,
}) {
  const minimo = DISPONIBILIDADE_KWH[tipo_ligacao] ?? 0;
  const kwh_faturado = Math.max(consumo_kwh, minimo);

  const segmentos = montarSegmentos({ enquadramento, kwh_faturado, tarifas, consumo_por_posto });
  const energia = segmentos.reduce((s, x) => s + x.kwh * x.tarifa_kwh, 0);
  const bandeira = segmentos.reduce((s, x) => s + (x.bandeira ? x.kwh * adicional_bandeira_kwh : 0), 0);
  const sem_tributos = energia + bandeira;

  const aliquota = ((icms_percentual ?? 0) + (pis_cofins_percentual ?? 0)) / 100;
  if (aliquota < 0 || aliquota >= 1) throw new RangeError('Alíquotas inválidas');
  const informouTributos = icms_percentual !== undefined || pis_cofins_percentual !== undefined;

  // Os tributos incidem "por dentro": total = base / (1 - alíquota).
  const com_tributos = sem_tributos / (1 - aliquota);

  return {
    enquadramento,
    kwh_faturado,
    segmentos: segmentos.filter((x) => x.kwh > 0).map((x) => ({ ...x, valor: arredonda(x.kwh * x.tarifa_kwh) })),
    energia_tusd_te: arredonda(energia),
    adicional_bandeira: arredonda(bandeira),
    valor_sem_tributos: arredonda(sem_tributos),
    tributos: arredonda(com_tributos - sem_tributos),
    cosip: arredonda(cosip),
    valor_total_estimado: arredonda(com_tributos + cosip),
    tributos_considerados: informouTributos,
  };
}
