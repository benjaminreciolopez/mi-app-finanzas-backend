// routes/deuda.js
const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");

// Ruta: /api/deuda/:clienteId/pendientes
router.get("/:clienteId/pendientes", async (req, res) => {
  const clienteId = parseInt(req.params.clienteId);

  const { data: cliente, error: clienteError } = await supabase
    .from("clientes")
    .select("precioHora")
    .eq("id", clienteId)
    .single();

  if (clienteError || !cliente) {
    return res.status(400).json({ error: "Cliente no encontrado" });
  }

  const precioHora = cliente.precioHora ?? 0;

  const { data: trabajos } = await supabase
    .from("trabajos")
    .select("id, fecha, horas, cuadrado")
    .eq("clienteId", clienteId)
    .neq("cuadrado", 1);

  const { data: materiales } = await supabase
    .from("materiales")
    .select("id, fecha, coste, cuadrado")
    .eq("clienteid", clienteId)
    .neq("cuadrado", 1);

  const { data: asignaciones } = await supabase
    .from("asignaciones_pago")
    .select("*")
    .eq("clienteid", clienteId);

  const trabajosPendientes = (trabajos || []).map((t) => {
    const asignado = (asignaciones || [])
      .filter((a) => a.trabajoid === t.id)
      .reduce((acc, a) => acc + Number(a.usado), 0);
    return {
      id: t.id,
      fecha: t.fecha,
      coste: +(t.horas * precioHora).toFixed(2),
      tipo: "trabajo",
      cuadrado: t.cuadrado,
      pendiente: +(t.horas * precioHora - asignado).toFixed(2),
    };
  });

  const materialesPendientes = (materiales || []).map((m) => {
    const asignado = (asignaciones || [])
      .filter((a) => a.materialid === m.id)
      .reduce((acc, a) => acc + Number(a.usado), 0);
    return {
      id: m.id,
      fecha: m.fecha,
      coste: +m.coste.toFixed(2),
      tipo: "material",
      cuadrado: m.cuadrado,
      pendiente: +(m.coste - asignado).toFixed(2),
    };
  });

  res.json({
    trabajos: trabajosPendientes.filter((t) => t.pendiente > 0),
    materiales: materialesPendientes.filter((m) => m.pendiente > 0),
  });
});

module.exports = router;
