import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularFatura } from '../src/calculo.js';
import { numeroBR } from '../src/aneel.js';
import { slugify } from '../src/tarifas.js';

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

test('fatura sem tributos', () => {
  const r = calcularFatura({ consumo_kwh: 100, tarifa_kwh: 0.7097, adicional_bandeira_kwh: 0.01885 });
  assert.equal(r.valor_sem_tributos, 72.86);
  assert.equal(r.valor_total_estimado, 72.86);
  assert.equal(r.tributos_considerados, false);
});

test('tributos incidem por dentro', () => {
  const r = calcularFatura({
    consumo_kwh: 100, tarifa_kwh: 0.8, adicional_bandeira_kwh: 0, icms_percentual: 20, pis_cofins_percentual: 5,
  });
  assert.equal(r.valor_sem_tributos, 80);
  assert.equal(r.valor_total_estimado, 106.67); // 80 / 0,75
  assert.equal(r.tributos, 26.67);
});

test('custo de disponibilidade fatura o mínimo da ligação', () => {
  const r = calcularFatura({ consumo_kwh: 10, tarifa_kwh: 1, adicional_bandeira_kwh: 0, tipo_ligacao: 'bifasico' });
  assert.equal(r.kwh_faturado, 50);
  assert.equal(r.valor_sem_tributos, 50);
});

test('alíquotas >= 100% são rejeitadas', () => {
  assert.throws(() => calcularFatura({ consumo_kwh: 1, tarifa_kwh: 1, adicional_bandeira_kwh: 0, icms_percentual: 100 }), RangeError);
});
