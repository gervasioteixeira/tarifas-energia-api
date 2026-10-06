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
- Enquadramentos: residencial, tarifa social, desconto social e tarifa branca (ver abaixo).
- CORS habilitado, para uso direto de front-ends (Lovable, etc.).
- `GET /distribuidoras` devolve `slug` e `nome` amigáveis para as principais distribuidoras (`energisa-pb` = Energisa Paraíba). O slug aceita também a sigla da ANEEL (`EPB`) ou o CNPJ. Veja `data/aliases.js`.
- A resposta de `/projecao` inclui `tarifa_kwh` (média efetiva sem tributos) e `bandeira.nome`.
- Removidos: `/carregar-cache`, `/estado/:uf` (a base da ANEEL não traz UF), `/slugs`, `/selecionaveis`, `/cache`.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/distribuidoras/status` | Saúde da API |
| GET | `/distribuidoras/enquadramentos` | Valores aceitos em `enquadramento` e `tipo_ligacao` |
| GET | `/distribuidoras` | Distribuidoras com tarifa residencial vigente |
| GET | `/distribuidoras/buscar?nome=energisa` | Busca por nome |
| GET | `/distribuidoras/:distribuidora/tarifa[?enquadramento=...]` | Tarifa(s) vigente(s) (R$/kWh, sem tributos) |
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

Só `distribuidora_slug` e `consumo_kwh` são obrigatórios (na tarifa branca, `consumo_kwh` é substituído por
`consumo_por_posto`). Sem `icms_percentual`/`pis_cofins_percentual` o resultado **não inclui tributos** e vem com um
aviso. Confira as alíquotas na fatura do cliente: PIS/COFINS variam todo mês e a COSIP é definida por município.

## Enquadramentos

| `enquadramento` | Como é calculado |
|---|---|
| `residencial` (padrão) | Tarifa convencional B1 (TUSD + TE) sobre todo o consumo |
| `tarifa_social` | Primeiros 80 kWh com tarifa zerada; acima, tarifa "Baixa Renda" da ANEEL (**estimativa**) |
| `desconto_social` | Até 120 kWh na "faixa 01" da ANEEL; acima, "faixa 02" |
| `branca` | Tarifa por posto horário (fora ponta / intermediário / ponta); envie `consumo_por_posto` |

Outros eixos:

- **Monofásico / bifásico / trifásico:** `tipo_ligacao` aplica o custo de disponibilidade (mínimo faturado de 30, 50 ou 100 kWh).
- **Tributos e COSIP:** informados pelo app, pois variam por estado e município.
- **Fora do escopo:** consumidores comerciais/industriais (grupo A), rurais e geração distribuída (SCEE).

Os limites de 80 e 120 kWh estão em `src/calculo.js`; revise se a regulamentação mudar. A resposta traz `segmentos`
(kWh, tarifa e valor de cada faixa) e `avisos` para o app exibir ao usuário.

## Deploy e uso em apps (Lovable)

- Há um `render.yaml` pronto: no [Render](https://render.com), *New → Blueprint* e aponte para este repositório.
- Guia, cliente TypeScript e prompt para o Lovable: [docs/lovable.md](docs/lovable.md).
- Para aceitar só o seu domínio: variável `CORS_ORIGIN=https://seuapp.lovable.app`.

## Rodando

```bash
npm install
npm start        # http://localhost:3000
npm test
```

Requer Node 20+. Variáveis opcionais: `PORT`, `CORS_ORIGIN`, `ANEEL_BASE_URL`, `ANEEL_TIMEOUT_MS`.

Licença: o repositório original declara MIT no README, mas não inclui arquivo LICENSE.
