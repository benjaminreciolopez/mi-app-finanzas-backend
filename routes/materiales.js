const express = require("express");
const router = express.Router();
const { supabase } = require("../supabaseClient");

// ✅ Obtener todos los materiales
router.get("/", async (req, res) => {
  const { data, error } = await supabase.from("materiales").select("*");

  if (error) return res.status(400).json({ error: error.message });

  res.json({ data });
});

// ✅ Añadir nuevo material
router.post("/", async (req, res) => {
  const { descripcion, coste, nombre, fecha, pagado = 0 } = req.body;

  const { data, error } = await supabase
    .from("materiales")
    .insert([{ descripcion, coste, nombre, fecha, pagado }])
    .select();

  if (error) {
    console.error("❌ Error insertando material:", error.message);
    return res.status(400).json({ error: error.message });
  }

  res.json({ message: "Material añadido", id: data[0]?.id });
});

// ✅ Actualizar estado de pago de un material
router.put("/:id", async (req, res) => {
  const { pagado } = req.body;

  const { error } = await supabase
    .from("materiales")
    .update({ pagado })
    .eq("id", req.params.id);

  if (error) return res.status(400).json({ error: error.message });

  res.json({ message: "Material actualizado correctamente" });
});

module.exports = router;
