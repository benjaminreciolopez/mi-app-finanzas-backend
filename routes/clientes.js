const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");

// Configura Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Obtener todos los clientes
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .order("orden", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

// Añadir nuevo cliente
router.post("/", async (req, res) => {
  const { nombre, precioHora } = req.body;
  if (!nombre || !precioHora) {
    return res
      .status(400)
      .json({ error: "Nombre y precioHora son obligatorios" });
  }

  const { data, error } = await supabase
    .from("clientes")
    .insert([{ nombre, precioHora }])
    .select();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ message: "Cliente añadido", id: data[0].id });
});

// Actualizar cliente
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { nombre, precioHora } = req.body;

  const { error, data } = await supabase
    .from("clientes")
    .update({ nombre, precioHora })
    .eq("id", id)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0)
    return res.status(404).json({ error: "Cliente no encontrado" });

  res.json({ message: "Cliente actualizado" });
});

// Eliminar cliente
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  const { error, data } = await supabase
    .from("clientes")
    .delete()
    .eq("id", id)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0)
    return res.status(404).json({ error: "Cliente no encontrado" });

  res.json({ message: "Cliente eliminado" });
});

// Actualizar orden de clientes
router.put("/orden", async (req, res) => {
  const { ordenes } = req.body; // [{ id: 1, orden: 0 }, { id: 3, orden: 1 }, ...]

  try {
    const updates = ordenes.map(({ id, orden }) =>
      supabase.from("clientes").update({ orden }).eq("id", id)
    );
    await Promise.all(updates);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
