const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");

// Marcar tareas como pagadas y cuadradas sin asignaciones
router.post("/", async (req, res) => {
  const { clienteId, tareas } = req.body;

  if (!clienteId || !Array.isArray(tareas)) {
    return res.status(400).json({ error: "Datos inválidos" });
  }

  const updates = await Promise.allSettled(
    tareas.map(({ id, tipo }) => {
      if (!id || !["trabajo", "material"].includes(tipo)) {
        return Promise.resolve({
          status: "rejected",
          reason: { id, error: "Tarea inválida" },
        });
      }

      const tabla = tipo === "trabajo" ? "trabajos" : "materiales";
      const campoCliente = tipo === "trabajo" ? "clienteId" : "clienteid";

      return supabase
        .from(tabla)
        .update({ pagado: 1, cuadrado: 1 })
        .eq("id", id)
        .eq(campoCliente, clienteId)
        .then(() => ({ status: "fulfilled" }))
        .catch((err) => ({
          status: "rejected",
          reason: { id, error: err.message },
        }));
    })
  );

  const errores = updates
    .filter((r) => r.status === "rejected")
    .map((r) => r.reason);

  if (errores.length > 0) {
    return res.status(207).json({ parcial: true, errores });
  }

  res.json({ actualizado: true });
});

module.exports = router;
