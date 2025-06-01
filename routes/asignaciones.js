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

module.exports = router;
