const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");
const {
  recalcularAsignacionesCliente,
} = require("../utils/recalcularAsignaciones"); // <--- Importa aquí

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

  console.log("Datos recibidos:", {
    clienteId,
    cantidad,
    fecha,
    observaciones,
  });

  if (!clienteId || !cantidad || !fecha || isNaN(cantidad) || cantidad <= 0) {
    return res.status(400).json({ error: "Datos de pago no válidos" });
  }

  const { data: cliente, error: errorCliente } = await supabase
    .from("clientes")
    .select("nombre")
    .eq("id", clienteId)
    .single();

  console.log("Resultado de búsqueda cliente:", { cliente, errorCliente });

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
    console.error("Error al insertar el pago:", error.message); // 👈 añade esta línea
    return res.status(400).json({ error: error.message });
  }
  await recalcularAsignacionesCliente(clienteId);

  res.json({ id: data.id });
});

// Actualizar un pago
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { cantidad, fecha, observaciones } = req.body;

  // Necesitas saber el clienteId. Lo buscas antes de actualizar.
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

  await recalcularAsignacionesCliente(pagoExistente.clienteId);

  res.json({ message: "Pago actualizado correctamente" });
});

// Eliminar un pago
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  // Busca primero el clienteId del pago a eliminar
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

  await recalcularAsignacionesCliente(pago.clienteId);

  res.json({ message: "Pago eliminado correctamente" });
});
