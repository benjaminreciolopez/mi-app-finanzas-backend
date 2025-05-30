const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");

router.get("/:clienteId", async (req, res) => {
  const clienteId = req.params.clienteId;
  const { data, error } = await supabase
    .from("asignaciones_pago")
    .select("*")
    .eq("clienteId", clienteId)
    .order("fecha_pago", { ascending: true });

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

module.exports = router;
