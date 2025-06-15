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
    .eq("clienteId", clienteId)
    .eq("cuadrado", 0);

  if (errorTrabajos) {
    console.error("❌ Error al obtener trabajos:", errorTrabajos.message);
    return res.status(500).json({ error: "Error al cargar trabajos" });
  }

  // Obtener precioHora del cliente
  const { data: cliente, error: errorCliente } = await supabase
    .from("clientes")
    .select("precioHora")
    .eq("id", clienteId)
    .single();

  if (errorCliente || !cliente) {
    return res.status(400).json({ error: "Cliente no encontrado" });
  }

  const precioHora = parseFloat(cliente.precioHora) || 0;

  // Obtener materiales no saldados
  const { data: materiales, error: errorMateriales } = await supabase
    .from("materiales")
    .select("id, fecha, coste")
    .eq("clienteid", clienteId)
    .eq("cuadrado", 0);

  if (errorMateriales) {
    console.error("❌ Error al obtener materiales:", errorMateriales.message);
    return res.status(500).json({ error: "Error al cargar materiales" });
  }

  // Obtener pagos del cliente
  const { data: pagos } = await supabase
    .from("pagos")
    .select("cantidad")
    .eq("clienteId", clienteId);

  // Obtener asignaciones del cliente
  const { data: asignaciones } = await supabase
    .from("asignaciones_pago")
    .select("usado")
    .eq("clienteid", clienteId);

  const totalPagado = (pagos || []).reduce(
    (acc, p) => acc + (parseFloat(p.cantidad) || 0),
    0
  );

  const totalAsignado = (asignaciones || []).reduce(
    (acc, a) => acc + (parseFloat(a.usado) || 0),
    0
  );

  const saldoACuenta = +(totalPagado - totalAsignado).toFixed(2);

  // Mapear trabajos
  const trabajosPendientes = (trabajos || []).map((t) => {
    const horas = parseFloat(t.horas) || 0;
    const coste = +(horas * precioHora).toFixed(2);
    return {
      id: t.id,
      tipo: "trabajo",
      fecha: t.fecha,
      horas,
      precioHora,
      coste,
      pendiente: coste,
    };
  });

  // Mapear materiales
  const materialesPendientes = (materiales || []).map((m) => {
    const coste = parseFloat(m.coste) || 0;
    return {
      id: m.id,
      tipo: "material",
      fecha: m.fecha,
      coste,
      pendiente: coste,
    };
  });

  res.json({
    saldoACuenta,
    trabajos: trabajosPendientes.sort(
      (a, b) => new Date(a.fecha) - new Date(b.fecha)
    ),
    materiales: materialesPendientes.sort(
      (a, b) => new Date(a.fecha) - new Date(b.fecha)
    ),
  });
});

module.exports = router;
