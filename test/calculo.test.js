import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularFatura } from '../src/calculo.js';
import { numeroBR } from '../src/aneel.js';
import { slugify } from '../src/tarifas.js';

const conv = (t) => ({ convencional: t });

test('numeroBR interpreta o formato da ANEEL', () => {
  assert.equal(numeroBR('1509,97'), 1509.97);
  assert.equal(numeroBR(',00'), 0);
  assert.equal(numeroBR('1.234,5'), 1234.5);
  assert.equal(numeroBR(''), null);
  assert.equal(numeroBR(undefined), null);
});

test('slugify remove acentos e símbolos', () => {
  assert.equal(slugify('Neoenergia Brasília'), 'neoenergia-brasilia');
  assert.equal(slugify('CERAL ANITÁPOLIS'), 'ceral-anitapolis');
});

test('fatura residencial sem tributos', () => {
  const r = calcularFatura({ consumo_kwh: 100, tarifas: conv(0.7097), adicional_bandeira_kwh: 0.01885 });
  assert.equal(r.valor_sem_tributos, 72.86);
  assert.equal(r.valor_total_estimado, 72.86);
  assert.equal(r.tributos_considerados, false);
});

test('tributos por dentro e encadeados (confere com fatura real da Energisa PB)', () => {
  const r = calcularFatura({
    consumo_kwh: 100, tarifas: conv(0.8), adicional_bandeira_kwh: 0, icms_percentual: 20, pis_cofins_percentual: 5,
  });
  assert.equal(r.valor_sem_tributos, 80);
  assert.equal(r.valor_total_estimado, 105.26); // 80 / (0,8 * 0,95)
  assert.equal(r.tributos, 25.26);
});

test('fatura real: 1.041 kWh a 0,708558 com ICMS 20% e PIS/COFINS 9,25% -> 1.015,99', () => {
  const r = calcularFatura({
    consumo_kwh: 1041, tarifas: conv(0.708558), adicional_bandeira_kwh: 0, icms_percentual: 20, pis_cofins_percentual: 9.25,
  });
  assert.ok(Math.abs(r.valor_total_estimado - 1015.99) < 0.1, String(r.valor_total_estimado));
});

test('custo de disponibilidade fatura o mínimo da ligação', () => {
  const r = calcularFatura({ consumo_kwh: 10, tarifas: conv(1), adicional_bandeira_kwh: 0, tipo_ligacao: 'bifasico' });
  assert.equal(r.kwh_faturado, 50);
  assert.equal(r.valor_sem_tributos, 50);
});

test('alíquotas >= 100% são rejeitadas', () => {
  assert.throws(() => calcularFatura({ consumo_kwh: 1, tarifas: conv(1), adicional_bandeira_kwh: 0, icms_percentual: 100 }), RangeError);
});

test('tarifa social: 80 kWh isentos, resto na tarifa baixa renda', () => {
  const r = calcularFatura({ consumo_kwh: 100, enquadramento: 'tarifa_social', tarifas: { baixa_renda: 0.6 }, adicional_bandeira_kwh: 0.02 });
  assert.equal(r.energia_tusd_te, 12); // 20 kWh * 0,6
  assert.equal(r.adicional_bandeira, 0.4); // bandeira só nos 20 kWh pagos
});

test('tarifa social: consumo abaixo do limite não paga nada', () => {
  const r = calcularFatura({ consumo_kwh: 60, enquadramento: 'tarifa_social', tarifas: { baixa_renda: 0.6 }, adicional_bandeira_kwh: 0.02 });
  assert.equal(r.valor_total_estimado, 0);
});

test('desconto social: faixa 01 até 120 kWh, faixa 02 acima', () => {
  const r = calcularFatura({ consumo_kwh: 150, enquadramento: 'desconto_social', tarifas: { faixa01: 0.5, faixa02: 0.7 }, adicional_bandeira_kwh: 0 });
  assert.equal(r.energia_tusd_te, 81); // 120*0,5 + 30*0,7
});

test('tarifa branca: soma por posto horário', () => {
  const r = calcularFatura({
    consumo_kwh: 100, enquadramento: 'branca',
    tarifas: { fora_ponta: 0.5, intermediario: 0.8, ponta: 1.2 },
    consumo_por_posto: { fora_ponta: 70, intermediario: 20, ponta: 10 },
    adicional_bandeira_kwh: 0,
  });
  assert.equal(r.energia_tusd_te, 63); // 35 + 16 + 12
});
