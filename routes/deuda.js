const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");
const { Decimal } = require("decimal.js");

// Devuelve trabajos y materiales pendientes (sin usar asignaciones ni saldoACuenta)
router.get("/:clienteId/pendientes", async (req, res) => {
  const clienteId = Number(req.params.clienteId);
  if (Number.isNaN(clienteId)) {
    return res.status(400).json({ error: "clienteId inválido" });
  }

  // 1. Obtener trabajos no saldados
  const { data: trabajos, error: errorTrabajos } = await supabase
    .from("trabajos")
    .select("id, fecha, horas")
    .eq("clienteId", clienteId)
    .eq("cuadrado", 0);

  if (errorTrabajos) {
    console.error("❌ Error al obtener trabajos:", errorTrabajos.message);
    return res.status(500).json({ error: "Error al cargar trabajos" });
  }

  // 2. Obtener precioHora del cliente
  const { data: cliente, error: errorCliente } = await supabase
    .from("clientes")
    .select("precioHora")
    .eq("id", clienteId)
    .single();

  if (errorCliente || !cliente) {
    return res.status(400).json({ error: "Cliente no encontrado" });
  }
  const precioHora = new Decimal(cliente.precioHora || 0);

  // 3. Obtener materiales no saldados (incluyendo descripción)
  const { data: materiales, error: errorMateriales } = await supabase
    .from("materiales")
    .select("id, fecha, coste, descripcion")
    .eq("clienteId", clienteId) // Corregido de clienteid a clienteId
    .eq("cuadrado", 0);

  if (errorMateriales) {
    console.error("❌ Error al obtener materiales:", errorMateriales.message);
    return res.status(500).json({ error: "Error al cargar materiales" });
  }

  // 4. Mapear trabajos
  const trabajosPendientes = (trabajos || []).map((t) => {
    const horas = new Decimal(t.horas || 0);
    const coste = horas.times(precioHora);
    return {
      id: t.id,
      tipo: "trabajo",
      fecha: t.fecha,
      horas: horas.toNumber(),
      precioHora: precioHora.toNumber(),
      coste: coste.toNumber(), // o toFixed(2) si se prefiere string
      pendiente: coste.toNumber(), // o toFixed(2)
    };
  });

  // 5. Mapear materiales (añade descripción si la tienes)
  const materialesPendientes = (materiales || []).map((m) => {
    const coste = new Decimal(m.coste || 0);
    return {
      id: m.id,
      tipo: "material",
      fecha: m.fecha,
      coste: coste.toNumber(), // o toFixed(2)
      pendiente: coste.toNumber(), // o toFixed(2)
      descripcion: m.descripcion || "", // si la columna existe
    };
  });

  // 6. Ordenar por fecha (más antiguos primero)
  const safeDate = (str) => (str ? new Date(str).getTime() : 0);
  res.json({
    trabajos: trabajosPendientes.sort(
      (a, b) => safeDate(a.fecha) - safeDate(b.fecha)
    ),
    materiales: materialesPendientes.sort(
      (a, b) => safeDate(a.fecha) - safeDate(b.fecha)
    ),
  });
});

module.exports = router;
