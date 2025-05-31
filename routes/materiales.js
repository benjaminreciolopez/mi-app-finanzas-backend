// backend/routes/materiales.js
const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient"); // ✅ sin llaves
const {
  recalcularAsignacionesCliente,
} = require("../utils/recalcularAsignacionesCliente");

// ✅ Obtener todos los materiales
router.get("/", async (req, res) => {
  const { data, error } = await supabase.from("materiales").select("*");

  if (error) return res.status(400).json({ error: error.message });

  res.json({ data });
});

// ✅ Añadir nuevo material y recalcular asignaciones del cliente
router.post("/", async (req, res) => {
  const { descripcion, coste, nombre, fecha, pagado = 0, clienteId } = req.body;

  const { data, error } = await supabase
    .from("materiales")
    .insert([{ descripcion, coste, nombre, fecha, pagado, clienteId }])
    .select();

  if (error) {
    console.error("❌ Error insertando material:", error.message);
    return res.status(400).json({ error: error.message });
  }

  // ⬇️ Recalcular asignaciones tras añadir el material
  if (clienteId) {
    await recalcularAsignacionesCliente(clienteId);
  }

  res.json({ message: "Material añadido", id: data[0]?.id });
});

// ✅ Actualizar estado de pago de un material y recalcular asignaciones
router.put("/:id", async (req, res) => {
  const { pagado, clienteId } = req.body;

  const { error } = await supabase
    .from("materiales")
    .update({ pagado })
    .eq("id", req.params.id);

  if (error) return res.status(400).json({ error: error.message });

  // ⬇️ Buscar el clienteId si no lo tienes en el body
  let realClienteId = clienteId;
  if (!realClienteId) {
    const { data: material } = await supabase
      .from("materiales")
      .select("clienteId")
      .eq("id", req.params.id)
      .single();
    realClienteId = material?.clienteId;
  }
  if (realClienteId) {
    await recalcularAsignacionesCliente(realClienteId);
  }

  res.json({ message: "Material actualizado correctamente" });
});

module.exports = router;
