const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");
const {
  recalcularAsignacionesCliente,
} = require("../utils/recalcularAsignacionesCliente");

// Obtener todos los trabajos
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase.from("trabajos").select("*");
    if (error) {
      console.error("❌ Supabase error:", error.message);
      return res.status(500).json({ error: error.message });
    }
    res.json({ data });
  } catch (err) {
    console.error("❌ Error inesperado:", err);
    res.status(500).json({ error: "Error al obtener trabajos" });
  }
});

// Añadir nuevo trabajo y recalcular asignaciones
router.post("/", async (req, res) => {
  const { clienteId, nombre, fecha, horas, pagado = 0 } = req.body;

  const { data, error } = await supabase
    .from("trabajos")
    .insert([{ clienteId, nombre, fecha, horas, pagado }])
    .select("id") // Para devolver el id del nuevo trabajo
    .single();

  if (error) {
    console.error("❌ Supabase error al crear trabajo:", error.message);
    return res.status(500).json({ error: error.message });
  }

  // ⬇️ Recalcular asignaciones tras añadir el trabajo
  if (clienteId) {
    await recalcularAsignacionesCliente(clienteId);
  }

  res.json({ id: data.id });
});

// Actualizar trabajo (estado o campos generales) y recalcular asignaciones
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);

  // Buscar el clienteId si no viene en el body
  let clienteId = req.body.clienteId;
  if (!clienteId) {
    const { data: trabajo } = await supabase
      .from("trabajos")
      .select("clienteId")
      .eq("id", id)
      .single();
    clienteId = trabajo?.clienteId;
  }

  const { error } = await supabase
    .from("trabajos")
    .update(req.body)
    .eq("id", id);

  if (error) return res.status(400).json({ error: error.message });

  // ⬇️ Recalcular asignaciones tras la actualización
  if (clienteId) {
    await recalcularAsignacionesCliente(clienteId);
  }

  // Si se marcó como pagado, actualizar resumen mensual
  if (req.body.pagado === 1) {
    await actualizarResumenMensual(id);
  }

  res.json({ updated: true });
});

// Eliminar trabajo y recalcular asignaciones
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);

  // Buscar el clienteId del trabajo a eliminar
  const { data: trabajo } = await supabase
    .from("trabajos")
    .select("clienteId")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("trabajos").delete().eq("id", id);

  if (error) return res.status(400).json({ error: error.message });

  // ⬇️ Recalcular asignaciones tras eliminar el trabajo
  if (trabajo?.clienteId) {
    await recalcularAsignacionesCliente(trabajo.clienteId);
  }

  res.json({ deleted: true });
});

// Función para actualizar resumen mensual en Supabase
async function actualizarResumenMensual(trabajoId) {
  const { data: trabajo, error: errorTrabajo } = await supabase
    .from("trabajos")
    .select("fecha, horas, nombre")
    .eq("id", trabajoId)
    .single();

  if (errorTrabajo || !trabajo) {
    console.error("❌ Error obteniendo trabajo:", errorTrabajo?.message);
    return;
  }

  const { data: cliente, error: errorCliente } = await supabase
    .from("clientes")
    .select("precioHora")
    .eq("nombre", trabajo.nombre)
    .single();

  if (errorCliente || !cliente) {
    console.error("❌ Error obteniendo cliente:", errorCliente?.message);
    return;
  }

  const fecha = new Date(trabajo.fecha);
  const año = fecha.getFullYear();
  const mes = fecha.getMonth() + 1;
  const total = trabajo.horas * cliente.precioHora;

  const { data: resumen, error: errorResumen } = await supabase
    .from("resumen_mensual")
    .select("id, total")
    .eq("año", año)
    .eq("mes", mes)
    .single();

  if (errorResumen && errorResumen.code !== "PGRST116") {
    console.error("❌ Error comprobando resumen:", errorResumen.message);
    return;
  }

  if (resumen) {
    await supabase
      .from("resumen_mensual")
      .update({ total: resumen.total + total })
      .eq("id", resumen.id);
  } else {
    await supabase.from("resumen_mensual").insert([{ año, mes, total }]);
  }
}

module.exports = router;
