# Versão para o app Lovable (TanStack Start)

A API também roda embutida no app, sem hospedagem separada:

- `tarifas.server.ts` -> `src/lib/tarifas.server.ts`
- `api.tarifas.$.ts` -> `src/routes/api/tarifas.$.ts`
- No cliente, `VITE_TARIFAS_API` fica vazio e o app usa `/api/tarifas` (mesma origem, sem CORS).

É a mesma lógica da API Node (`src/`), em TypeScript estrito, sem dependências. Ao mudar uma, atualize a outra.
