const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");

// Devuelve trabajos y materiales pendientes (sin usar asignaciones)
router.get("/:clienteId/pendientes", async (req, res) => {
  const clienteId = Number(req.params.clienteId);
  if (Number.isNaN(clienteId)) {
    return res.status(400).json({ error: "clienteId inválido" });
  }

  // Obtener trabajos no saldados
  const { data: trabajos, error: errorTrabajos } = await supabase
    .from("trabajos")
    .select("id, fecha, horas")
    .eq("clienteId", clienteId) // ✅ con "I" mayúscula
    .eq("cuadrado", false);

  if (errorTrabajos) {
    console.error("❌ Error al obtener trabajos:", errorTrabajos.message);
    return res.status(500).json({ error: "Error al cargar trabajos" });
  }

  // Obtener precioHora del cliente
  const { data: cliente, error: errorCliente } = await supabase
    .from("clientes")
    .select("precioHora")
    .eq("id", clienteId) // permanece como id
    .single();

  if (errorCliente || !cliente) {
    return res.status(400).json({ error: "Cliente no encontrado" });
  }

  const precioHora = cliente.precioHora;

  // Obtener materiales no saldados
  const { data: materiales, error: errorMateriales } = await supabase
    .from("materiales")
    .select("id, fecha, coste")
    .eq("clienteid", clienteId) // ⛔ inconsistente, pero si así está en la tabla, OK
    .eq("cuadrado", false);

  if (errorMateriales) {
    return res.status(400).json({ error: "Error al cargar materiales" });
  }

  // Mapear trabajos con su coste
  const trabajosPendientes = trabajos.map((t) => ({
    id: t.id,
    tipo: "trabajo",
    fecha: t.fecha,
    horas: t.horas,
    precioHora,
    coste: +(t.horas * precioHora).toFixed(2),
  }));

  const materialesPendientes = materiales.map((m) => ({
    id: m.id,
    tipo: "material",
    fecha: m.fecha,
    coste: +m.coste.toFixed(2),
  }));

  res.json({
    trabajos: trabajosPendientes.sort(
      (a, b) => new Date(a.fecha) - new Date(b.fecha)
    ),
    materiales: materialesPendientes.sort(
      (a, b) => new Date(a.fecha) - new Date(b.fecha)
    ),
  });
});

module.exports = router;
