const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");
// ⚠️ AVISO IMPORTANTE:
// La columna `nombre` en la tabla `pagos` está obsoleta.
// Ya no se utiliza en el frontend ni se rellena en nuevas inserciones.
// Se mantiene solo por compatibilidad temporal. El campo válido es `clienteId`.

// Obtener todos los pagos
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("pagos")
    .select("*")
    .order("fecha", { ascending: false });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.json({ data });
});

// Añadir nuevo pago
router.post("/", async (req, res) => {
  const { clienteId, cantidad, fecha, observaciones } = req.body;

  if (!clienteId || !cantidad || !fecha) {
    return res
      .status(400)
      .json({ error: "clienteId, cantidad y fecha son obligatorios" });
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

  res.json({ id: data.id });
});

// Actualizar un pago
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { cantidad, fecha, observaciones } = req.body;

  const { error, data } = await supabase
    .from("pagos")
    .update({ cantidad, fecha, observaciones })
    .eq("id", id)
    .select();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  if (!data || data.length === 0) {
    return res.status(404).json({ error: "Pago no encontrado" });
  }

  res.json({ message: "Pago actualizado correctamente" });
});

// Eliminar un pago
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase.from("pagos").delete().eq("id", id);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.json({ message: "Pago eliminado correctamente" });
});

module.exports = router;
