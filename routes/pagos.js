const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");
const { recalcularAsignaciones } = require("../utils/recalcularAsignaciones");

// Obtener todos los pagos
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("pagos")
    .select("*")
    .order("fecha", { ascending: false });

  if (error) return res.status(400).json({ error: error.message });

  res.json({ data });
});

// Añadir nuevo pago
router.post("/", async (req, res) => {
  const { clienteId, cantidad, fecha, observaciones } = req.body;

  if (!clienteId || !cantidad || !fecha || isNaN(cantidad) || cantidad <= 0) {
    return res.status(400).json({ error: "Datos de pago no válidos" });
  }

  const { data: cliente, error: errorCliente } = await supabase
    .from("clientes")
    .select("nombre")
    .eq("id", clienteId)
    .single();

  if (errorCliente || !cliente) {
    return res.status(400).json({ error: "Cliente no encontrado" });
  }

  const { data, error } = await supabase
    .from("pagos")
    .insert([
      {
        clienteId,
        nombre: cliente.nombre,
        cantidad,
        fecha,
        observaciones,
      },
    ])
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }
  // ⬇️ Recalcular tras insertar
  await recalcularAsignaciones(clienteId);

  res.json({ id: data.id });
});

// Actualizar un pago
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { cantidad, fecha, observaciones } = req.body;

  // Buscar clienteId antes de actualizar
  const { data: pagoExistente, error: errPago } = await supabase
    .from("pagos")
    .select("clienteId")
    .eq("id", id)
    .single();

  if (errPago || !pagoExistente) {
    return res.status(404).json({ error: "Pago no encontrado" });
  }

  const { error, data } = await supabase
    .from("pagos")
    .update({ cantidad, fecha, observaciones })
    .eq("id", id)
    .select();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  // ⬇️ Recalcular tras actualizar
  await recalcularAsignaciones(pagoExistente.clienteId);

  res.json({ message: "Pago actualizado correctamente" });
});

// Eliminar un pago
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  // Buscar clienteId antes de eliminar
  const { data: pago, error: errPago } = await supabase
    .from("pagos")
    .select("clienteId")
    .eq("id", id)
    .single();

  if (errPago || !pago) {
    return res.status(404).json({ error: "Pago no encontrado" });
  }

  const { error } = await supabase.from("pagos").delete().eq("id", id);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  // ⬇️ Recalcular tras eliminar
  await recalcularAsignaciones(pago.clienteId);

  res.json({ message: "Pago eliminado correctamente" });
});

module.exports = router;
