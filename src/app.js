import express from 'express';
import { calcularFatura, DISPONIBILIDADE_KWH } from './calculo.js';
import { bandeiraDoMes, buscarPorNome, listarDistribuidoras, resolverDistribuidora, tarifaVigente } from './tarifas.js';

const ok = (res, dados) => res.json({ sucesso: true, dados });
const falha = (res, status, erro) => res.status(status).json({ sucesso: false, erro });

// Express 5 já encaminha rejeições de handlers async para o error handler.
export function criarApp() {
  const app = express();
  app.use(express.json());
  const r = express.Router();

  r.get('/status', (req, res) => ok(res, { status: 'ok', versao: '2.0.0', fonte: 'ANEEL - dados abertos' }));

  r.get('/', async (req, res) => ok(res, await listarDistribuidoras()));

  r.get('/buscar', async (req, res) => {
    if (!req.query.nome) return falha(res, 400, 'Informe o parâmetro ?nome=');
    const dados = await buscarPorNome(String(req.query.nome));
    if (!dados.length) return falha(res, 404, 'Nenhuma distribuidora encontrada com esse nome.');
    ok(res, dados);
  });

  r.get('/bandeira/atual', async (req, res) => {
    const mes = req.query.mes ? String(req.query.mes) : undefined;
    if (mes && !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return falha(res, 400, 'mes deve estar no formato YYYY-MM.');
    const dados = await bandeiraDoMes(mes);
    if (!dados) return falha(res, 404, 'Bandeira não encontrada para o período.');
    ok(res, dados);
  });

  r.get('/:distribuidora/tarifa', async (req, res) => {
    const dist = await resolverDistribuidora(req.params.distribuidora);
    if (!dist) return falha(res, 404, 'Distribuidora não encontrada. Consulte GET /distribuidoras.');
    const tarifa = await tarifaVigente(dist);
    if (!tarifa) return falha(res, 404, 'Tarifa residencial não encontrada para esta distribuidora.');
    ok(res, tarifa);
  });

  r.post('/projecao', async (req, res) => {
    const { consumo_kwh, distribuidora_slug, tipo_ligacao, icms_percentual, pis_cofins_percentual, cosip } = req.body ?? {};

    if (typeof consumo_kwh !== 'number' || !Number.isFinite(consumo_kwh) || consumo_kwh <= 0)
      return falha(res, 400, 'consumo_kwh deve ser um número positivo.');
    if (typeof distribuidora_slug !== 'string' || !distribuidora_slug.trim())
      return falha(res, 400, 'distribuidora_slug deve ser uma string não vazia.');
    if (tipo_ligacao !== undefined && !(tipo_ligacao in DISPONIBILIDADE_KWH))
      return falha(res, 400, `tipo_ligacao deve ser um de: ${Object.keys(DISPONIBILIDADE_KWH).join(', ')}.`);
    for (const [campo, v] of Object.entries({ icms_percentual, pis_cofins_percentual, cosip })) {
      if (v !== undefined && (typeof v !== 'number' || v < 0)) return falha(res, 400, `${campo} deve ser um número >= 0.`);
    }
    if ((icms_percentual ?? 0) + (pis_cofins_percentual ?? 0) >= 100)
      return falha(res, 400, 'A soma das alíquotas deve ser menor que 100.');

    const dist = await resolverDistribuidora(distribuidora_slug);
    if (!dist) return falha(res, 404, 'Distribuidora não encontrada com o slug informado.');

    const [tarifa, bandeira] = await Promise.all([tarifaVigente(dist), bandeiraDoMes()]);
    if (!tarifa) return falha(res, 404, 'Tarifa residencial não encontrada para esta distribuidora.');

    const calculo = calcularFatura({
      consumo_kwh,
      tarifa_kwh: tarifa.tarifa_kwh,
      adicional_bandeira_kwh: bandeira?.valor_adicional_kwh ?? 0,
      tipo_ligacao,
      icms_percentual,
      pis_cofins_percentual,
      cosip,
    });

    const avisos = [];
    if (!calculo.tributos_considerados)
      avisos.push('ICMS e PIS/COFINS não informados: valor_total_estimado não inclui tributos e ficará abaixo da fatura real.');
    if (!tarifa.vigente) avisos.push(`Tarifa vigente ainda não publicada pela ANEEL; usada a de ${tarifa.inicio_vigencia}.`);
    if (!bandeira) avisos.push('Bandeira tarifária indisponível; considerado adicional zero.');
    else if (!bandeira.exata) avisos.push(`Bandeira de ${bandeira.mes_solicitado} ainda não publicada; usada a de ${bandeira.mes_referencia}.`);

    ok(res, {
      distribuidora: tarifa.distribuidora,
      consumo_kwh,
      tarifa_kwh: tarifa.tarifa_kwh,
      vigencia_tarifa: { inicio: tarifa.inicio_vigencia, fim: tarifa.fim_vigencia },
      bandeira: bandeira && { tipo: bandeira.tipo, mes: bandeira.mes_referencia, adicional_kwh: bandeira.valor_adicional_kwh },
      ...calculo,
      avisos,
    });
  });

  app.use('/distribuidoras', r);
  app.get('/', (req, res) => res.send('API de Tarifas Elétricas do Brasil'));

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (!err.status) console.error(err);
    falha(res, err.status || 500, err.status ? err.message : 'Erro interno.');
  });

  return app;
}
