import { createFileRoute } from "@tanstack/react-router";
import { handleTarifas } from "@/lib/tarifas.server";

// API pública e somente-leitura de tarifas (dados abertos da ANEEL), servida pelo próprio app.
// GET  /api/tarifas/distribuidoras
// GET  /api/tarifas/distribuidoras/:slug/tarifa?enquadramento=residencial
// GET  /api/tarifas/distribuidoras/bandeira/atual
// POST /api/tarifas/distribuidoras/projecao
export const Route = createFileRoute("/api/tarifas/$")({
  server: {
    handlers: {
      GET: ({ request, params }) => handleTarifas(request, `/${params._splat ?? ""}`),
      POST: ({ request, params }) => handleTarifas(request, `/${params._splat ?? ""}`),
    },
  },
});
