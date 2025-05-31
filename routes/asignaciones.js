// backend/routes/asignaciones.js
const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");

// Devuelve todas las asignaciones de pago de un cliente
router.get("/:clienteId", async (req, res) => {
  const clienteId = req.params.clienteId;

  // Asegúrate del nombre correcto del campo: clienteid
  const { data, error } = await supabase
    .from("asignaciones_pago")
    .select("*")
    .eq("clienteid", clienteId) // <-- normalmente es 'clienteid' en minúscula
    .order("fecha_pago", { ascending: true });

  if (error) return res.status(400).json({ error: error.message });
  res.json({ data }); // Uniformiza la respuesta
});

module.exports = router;
