# ⚡️ API de Tarifas de Energia Elétrica - Brasil (v2)

Fork de [mpfarias/tarifas-energia-api](https://github.com/mpfarias/tarifas-energia-api) corrigido para usar
sempre a **tarifa residencial vigente** e a **bandeira tarifária do mês**, consultadas nos
[dados abertos da ANEEL](https://dadosabertos.aneel.gov.br/dataset/tarifas-distribuidoras-energia-eletrica).

## O que mudou em relação ao original

- Tarifa filtrada por vigência (antes pegava a primeira linha do histórico, de 2010).
- TUSD + TE somadas (antes só TE).
- Bandeira lida da ANEEL (antes tabela fixa até jun/2025).
- Consulta feita no servidor da ANEEL (`datastore_search`), sem baixar o CSV de 300 mil linhas; cache em memória (6h tarifas, 1h bandeira) e fallback para o último valor se a ANEEL cair.
- Tributos (ICMS, PIS/COFINS) e COSIP são parâmetros opcionais; o mínimo de 30/50/100 kWh depende de `tipo_ligacao` (antes era R$ 23,52 fixo).
- `slug` aceita apelidos (`energisa-pb`), sigla da ANEEL (`EPB`) ou CNPJ. Veja `data/aliases.js`.
- Removidos: `/carregar-cache`, `/estado/:uf` (a base da ANEEL não traz UF), `/slugs`, `/selecionaveis`, `/cache`.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/distribuidoras/status` | Saúde da API |
| GET | `/distribuidoras` | Distribuidoras com tarifa residencial vigente |
| GET | `/distribuidoras/buscar?nome=energisa` | Busca por nome |
| GET | `/distribuidoras/:distribuidora/tarifa` | Tarifa vigente (R$/kWh, sem tributos) |
| GET | `/distribuidoras/bandeira/atual[?mes=YYYY-MM]` | Bandeira tarifária |
| POST | `/distribuidoras/projecao` | Estimativa da fatura |

### POST /distribuidoras/projecao

```json
{
  "consumo_kwh": 150,
  "distribuidora_slug": "energisa-pb",
  "tipo_ligacao": "bifasico",
  "icms_percentual": 20,
  "pis_cofins_percentual": 5,
  "cosip": 0
}
```

Só `consumo_kwh` e `distribuidora_slug` são obrigatórios. Sem `icms_percentual`/`pis_cofins_percentual`
o resultado **não inclui tributos** e vem com um aviso. Confira as alíquotas na fatura do cliente: PIS/COFINS
variam todo mês e a COSIP é definida por município.

Limites: apenas classe residencial, subgrupo B1, modalidade convencional (não cobre tarifa branca,
baixa renda nem geração distribuída).

## Rodando

```bash
npm install
npm start        # http://localhost:3000
npm test
```

Requer Node 20+. Variáveis opcionais: `PORT`, `ANEEL_BASE_URL`, `ANEEL_TIMEOUT_MS`.

Licença: o repositório original declara MIT no README, mas não inclui arquivo LICENSE.
