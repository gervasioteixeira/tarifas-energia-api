// Cálculo puro (sem I/O) da estimativa de fatura residencial.

// Custo de disponibilidade: consumo mínimo faturado por tipo de ligação (kWh/mês).
export const DISPONIBILIDADE_KWH = { monofasico: 30, bifasico: 50, trifasico: 100 };

const arredonda = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * @param {object} p
 * @param {number} p.consumo_kwh
 * @param {number} p.tarifa_kwh              TUSD+TE em R$/kWh, sem tributos
 * @param {number} p.adicional_bandeira_kwh  R$/kWh
 * @param {string} [p.tipo_ligacao]          monofasico | bifasico | trifasico
 * @param {number} [p.icms_percentual]       ex.: 20
 * @param {number} [p.pis_cofins_percentual] ex.: 5
 * @param {number} [p.cosip]                 contribuição de iluminação pública (R$), definida pelo município
 */
export function calcularFatura({
  consumo_kwh,
  tarifa_kwh,
  adicional_bandeira_kwh,
  tipo_ligacao,
  icms_percentual,
  pis_cofins_percentual,
  cosip = 0,
}) {
  const minimo = DISPONIBILIDADE_KWH[tipo_ligacao] ?? 0;
  const kwh_faturado = Math.max(consumo_kwh, minimo);

  const energia = kwh_faturado * tarifa_kwh;
  const bandeira = kwh_faturado * adicional_bandeira_kwh;
  const sem_tributos = energia + bandeira;

  const aliquota = ((icms_percentual ?? 0) + (pis_cofins_percentual ?? 0)) / 100;
  if (aliquota < 0 || aliquota >= 1) throw new RangeError('Alíquotas inválidas');
  const informouTributos = icms_percentual !== undefined || pis_cofins_percentual !== undefined;

  // Os tributos incidem "por dentro": total = base / (1 - alíquota).
  const com_tributos = sem_tributos / (1 - aliquota);

  return {
    kwh_faturado,
    energia_tusd_te: arredonda(energia),
    adicional_bandeira: arredonda(bandeira),
    valor_sem_tributos: arredonda(sem_tributos),
    tributos: arredonda(com_tributos - sem_tributos),
    cosip: arredonda(cosip),
    valor_total_estimado: arredonda(com_tributos + cosip),
    tributos_considerados: informouTributos,
  };
}
