const express = require("express");
const router = express.Router();
const { supabase } = require("../supabaseClient");

// Obtener todos los trabajos
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase.from("trabajos").select("*");

    if (error) {
      console.error("❌ Supabase error:", error.message); // 👈 LOG IMPORTANTE
      return res.status(500).json({ error: error.message });
    }

    console.log("✅ Trabajos cargados:", data); // 👈 LOG IMPORTANTE
    res.json({ data });
  } catch (err) {
    console.error("❌ Error inesperado:", err); // 👈 LOG IMPORTANTE
    res.status(500).json({ error: "Error al obtener trabajos" });
  }
});

// Añadir nuevo trabajo
router.post("/", async (req, res) => {
  const { nombre, fecha, horas, pagado } = req.body;

  const { data, error } = await supabase
    .from("trabajos")
    .insert([{ nombre, fecha, horas, pagado }])
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  res.json({ message: "Trabajo añadido", id: data.id });
});

// Actualizar estado de pago de un trabajo
router.put("/:id", async (req, res) => {
  const { pagado } = req.body;
  const id = parseInt(req.params.id);

  const { error } = await supabase
    .from("trabajos")
    .update({ pagado })
    .eq("id", id);

  if (error) return res.status(400).json({ error: error.message });

  if (pagado === 1) {
    await actualizarResumenMensual(id);
  }

  res.json({ updated: true });
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
