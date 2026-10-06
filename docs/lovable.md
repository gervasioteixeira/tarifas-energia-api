# Usando a API no Lovable (ou qualquer front-end)

A API tem CORS aberto, então pode ser chamada direto do navegador. Ela precisa estar hospedada em **HTTPS**
(ver "Deploy" no README); `localhost` não funciona a partir do app publicado.

## Cliente TypeScript (copie para o projeto)

```ts
const API = import.meta.env.VITE_TARIFAS_API ?? "https://SUA-API.onrender.com";

export type Enquadramento = "residencial" | "tarifa_social" | "desconto_social" | "branca";

export interface ProjecaoInput {
  distribuidora_slug: string;            // ex.: "energisa-pb"
  consumo_kwh?: number;                  // obrigatório, exceto na tarifa branca
  enquadramento?: Enquadramento;
  tipo_ligacao?: "monofasico" | "bifasico" | "trifasico";
  consumo_por_posto?: { fora_ponta?: number; intermediario?: number; ponta?: number }; // tarifa branca
  icms_percentual?: number;
  pis_cofins_percentual?: number;
  cosip?: number;
}

export async function projetarFatura(input: ProjecaoInput) {
  const res = await fetch(`${API}/distribuidoras/projecao`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!json.sucesso) throw new Error(json.erro);
  return json.dados;
}

export async function tarifaVigente(slug: string, enquadramento: Enquadramento = "residencial") {
  const res = await fetch(`${API}/distribuidoras/${slug}/tarifa?enquadramento=${enquadramento}`);
  const json = await res.json();
  if (!json.sucesso) throw new Error(json.erro);
  return json.dados;
}
```

## Prompt sugerido para o Lovable

> Crie uma página "Simulador de tarifa" que chame a API em `VITE_TARIFAS_API`. Campos: distribuidora (select
> alimentado por `GET /distribuidoras`), consumo em kWh, tipo de ligação (monofásico/bifásico/trifásico),
> enquadramento (residencial, tarifa social, desconto social, tarifa branca) e, opcionalmente, ICMS %, PIS/COFINS % e
> COSIP. Envie `POST /distribuidoras/projecao` e mostre `valor_total_estimado`, a tarifa por kWh, a bandeira do mês,
> a tabela `segmentos` e a lista `avisos`. Para tarifa branca, peça o consumo por posto (fora de ponta,
> intermediário e ponta) em vez do consumo total.

## Dica

A primeira chamada ao plano gratuito do Render pode levar ~30 s (cold start). Mostre um estado de "carregando"
e/ou chame `GET /distribuidoras/status` ao abrir o app para "acordar" a API.
