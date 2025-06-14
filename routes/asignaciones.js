// backend/routes/asignaciones.js
const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");

// Devuelve todas (o solo las pendientes/saldadas) asignaciones de pago de un cliente
router.get("/:clienteId", async (req, res) => {
  const clienteId = req.params.clienteId;
  const { cuadrado } = req.query; // puede ser "0", "1" o undefined

  let query = supabase
    .from("asignaciones_pago")
    .select("*")
    .eq("clienteid", clienteId)
    .order("fecha_pago", { ascending: true });

  if (cuadrado === "0" || cuadrado === "1") {
    query = query.eq("cuadrado", Number(cuadrado));
  }

  const { data, error } = await query;

  if (error) return res.status(400).json({ error: error.message });
  res.json(Array.isArray(data) ? data : []);
});

// Guarda asignaciones manuales de un pago
router.post("/", async (req, res) => {
  const { pagoId, asignaciones } = req.body;

  if (!pagoId || !Array.isArray(asignaciones)) {
    return res.status(400).json({ error: "Datos inválidos" });
  }

  // Obtener pago y cliente para asociarlo
  const { data: pago, error: errorPago } = await supabase
    .from("pagos")
    .select("clienteId, fecha")
    .eq("id", pagoId)
    .single();

  if (errorPago || !pago) {
    return res.status(404).json({ error: "Pago no encontrado" });
  }

  const inserts = asignaciones.map((a) => ({
    clienteid: pago.clienteId,
    pagoid: pagoId,
    tipo: a.tipo,
    trabajoid: a.tipo === "trabajo" ? a.tareaId : null,
    materialid: a.tipo === "material" ? a.tareaId : null,
    usado: a.usado,
    fecha_pago: pago.fecha,
    fecha_tarea: a.fechaTarea || null,
    cuadrado: 0,
  }));

  const { error } = await supabase.from("asignaciones_pago").insert(inserts);

  if (error) return res.status(400).json({ error: error.message });

  res.json({ success: true });
});

module.exports = router;
