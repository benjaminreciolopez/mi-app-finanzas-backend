const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient"); // ✅ sin llaves

// Obtener todos los pagos
router.get("/", async (req, res) => {
  const { data, error } = await supabase.from("pagos").select("*");

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.json({ data });
});

// Añadir nuevo pago
router.post("/", async (req, res) => {
  const { clienteId, cantidad, fecha } = req.body;

  const { data, error } = await supabase
    .from("pagos")
    .insert([{ clienteId, cantidad, fecha }])
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.json({ id: data.id });
});

module.exports = router;
