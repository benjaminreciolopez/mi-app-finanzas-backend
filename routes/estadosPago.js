const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");

// Marcar tareas como pagadas y cuadradas sin asignaciones
router.post("/", async (req, res) => {
  const { clienteId, tareas } = req.body;

  if (!clienteId || !Array.isArray(tareas)) {
    return res.status(400).json({ error: "Datos inválidos" });
  }

  let errores = [];

  for (const tarea of tareas) {
    const { id, tipo } = tarea;

    if (!id || !["trabajo", "material"].includes(tipo)) {
      errores.push({ id, error: "Tarea inválida" });
      continue;
    }

    const tabla = tipo === "trabajo" ? "trabajos" : "materiales";
    const campoCliente = tipo === "trabajo" ? "clienteId" : "clienteid";

    const { error } = await supabase
      .from(tabla)
      .update({ pagado: true, cuadrado: true })
      .eq("id", id)
      .eq(campoCliente, clienteId);

    if (error) {
      errores.push({ id, error: error.message });
    }
  }

  if (errores.length > 0) {
    return res.status(207).json({ parcial: true, errores });
  }

  res.json({ actualizado: true });
});

module.exports = router;
