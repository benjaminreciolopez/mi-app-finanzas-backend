const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");

// Devuelve trabajos y materiales pendientes (con deuda real)
router.get("/:clienteId/pendientes", async (req, res) => {
  const clienteId = parseInt(req.params.clienteId);

  // Obtener trabajos no saldados
  const { data: trabajos, error: errorTrabajos } = await supabase
    .from("trabajos")
    .select("id, fecha, horas")
    .eq("clienteId", clienteId)
    .eq("cuadrado", false);

  if (errorTrabajos) {
    return res.status(400).json({ error: "Error al cargar trabajos" });
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

  const precioHora = cliente.precioHora;

  // Obtener materiales no saldados
  const { data: materiales, error: errorMateriales } = await supabase
    .from("materiales")
    .select("id, fecha, coste")
    .eq("clienteid", clienteId)
    .eq("cuadrado", false);

  if (errorMateriales) {
    return res.status(400).json({ error: "Error al cargar materiales" });
  }

  // Obtener todas las asignaciones de este cliente
  const { data: asignaciones, error: errorAsignaciones } = await supabase
    .from("asignaciones_pago")
    .select("trabajoid, materialid, usado")
    .eq("clienteid", clienteId);

  if (errorAsignaciones) {
    return res.status(400).json({ error: "Error al cargar asignaciones" });
  }

  // Agrupar pagos por trabajo/material
  const totalPagadoTrabajo = {};
  const totalPagadoMaterial = {};

  for (const asign of asignaciones) {
    if (asign.trabajoid) {
      totalPagadoTrabajo[asign.trabajoid] =
        (totalPagadoTrabajo[asign.trabajoid] || 0) + asign.usado;
    }
    if (asign.materialid) {
      totalPagadoMaterial[asign.materialid] =
        (totalPagadoMaterial[asign.materialid] || 0) + asign.usado;
    }
  }

  const resultado = [];

  for (const t of trabajos) {
    const coste = t.horas * precioHora;
    const pagado = totalPagadoTrabajo[t.id] || 0;
    const pendiente = +(coste - pagado).toFixed(2);

    resultado.push({
      id: t.id,
      tipo: "trabajo",
      fecha: t.fecha,
      coste,
      pagado,
      pendiente,
    });
  }

  for (const m of materiales) {
    const coste = m.coste;
    const pagado = totalPagadoMaterial[m.id] || 0;
    const pendiente = +(coste - pagado).toFixed(2);

    resultado.push({
      id: m.id,
      tipo: "material",
      fecha: m.fecha,
      coste,
      pagado,
      pendiente,
    });
  }

  // Ordenar por fecha ascendente
  resultado.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  res.json(resultado);
});

module.exports = router;
