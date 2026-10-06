# Prompt para colar no chat do Lovable

(Gasta 1 mensagem de crédito. O repositório é público, então o agente consegue ler os arquivos pelas URLs abaixo.)

---

Embuta a API de tarifas no próprio app como server route, para o "Simulador de tarifa" (/energia) funcionar sem hospedagem externa. Faça só isto:

1. Crie `src/lib/tarifas.server.ts` com o conteúdo EXATO de:
   https://raw.githubusercontent.com/gervasioteixeira/tarifas-energia-api/main/lovable/tarifas.server.ts
2. Crie `src/routes/api/tarifas.$.ts` com o conteúdo EXATO de:
   https://raw.githubusercontent.com/gervasioteixeira/tarifas-energia-api/main/lovable/api.tarifas.%24.ts
3. Em `src/lib/energy.ts`:
   - troque a linha `const API = (import.meta.env['VITE_TARIFAS_API'] as string | undefined) ?? "";`
     por `const API = (import.meta.env['VITE_TARIFAS_API'] as string | undefined) || "/api/tarifas";`
   - na interface `ProjecaoInput`, troque `ponta?: number` por `ponta?: number | undefined` (corrige o erro de build, por causa de `exactOptionalPropertyTypes`).
4. Garanta que compila e que `routeTree.gen.ts` foi regenerado. Não altere mais nada.
