const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");
const { actualizarSaldoCliente } = require("../utils/actualizarSaldoCliente");

// Marcar tareas como pagadas y cuadradas sin asignaciones
router.post("/", async (req, res) => {
  const { clienteId, tareas } = req.body;

  if (!clienteId || !Array.isArray(tareas) || tareas.length === 0) {
    return res.status(400).json({ error: "Datos inválidos" });
  }

  let algunCambio = false;

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
        .then((res) => {
          if (res.error) {
            return {
              status: "rejected",
              reason: { id, error: res.error.message },
            };
          }
          algunCambio = true;
          return { status: "fulfilled" };
        })
        .catch((err) => ({
          status: "rejected",
          reason: { id, error: err.message },
        }));
    })
  );

  const errores = updates
    .filter((r) => r.status === "rejected")
    .map((r) => r.reason);

  // ✅ Recalcula el saldo SOLO si alguna tarea ha cambiado
  if (algunCambio) {
    await actualizarSaldoCliente(clienteId);
  }

  if (errores.length > 0) {
    console.warn("🟡 Hubo errores al cuadrar tareas:", errores);
    return res.status(207).json({ parcial: true, errores });
  }

  res.json({ actualizado: true });
});

module.exports = router;
