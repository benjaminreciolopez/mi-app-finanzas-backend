const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");

// Configura Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ✅ Obtener todos los clientes
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("clientes")
    .select("id, nombre, precioHora, orden, saldoDisponible")
    .order("orden", { ascending: true });

  if (error) {
    console.error("❌ Error al obtener clientes:", error.message);
    return res.status(500).json({ error: error.message });
  }

  res.json({ data });
});

// ✅ Añadir nuevo cliente
router.post("/", async (req, res) => {
  let { nombre, precioHora } = req.body;

  if (!nombre || precioHora === undefined || isNaN(Number(precioHora))) {
    return res
      .status(400)
      .json({ error: "Nombre y precioHora numérico son obligatorios" });
  }

  precioHora = Number(precioHora);

  // Busca el mayor valor de orden para asignar el siguiente
  const { data: existentes, error: errorConsulta } = await supabase
    .from("clientes")
    .select("orden")
    .order("orden", { ascending: false })
    .limit(1);

  if (errorConsulta) {
    return res.status(500).json({ error: errorConsulta.message });
  }

  const siguienteOrden =
    existentes?.[0]?.orden != null ? existentes[0].orden + 1 : 0;

  const { data, error } = await supabase
    .from("clientes")
    .insert([{ nombre, precioHora, orden: siguienteOrden, saldoDisponible: 0 }])
    .select();

  if (error) return res.status(500).json({ error: error.message });

  res.json({ message: "Cliente añadido", id: data[0].id });
});

// ✅ Actualizar orden de clientes
router.put("/orden", async (req, res) => {
  const { ordenes } = req.body;

  try {
    const updates = await Promise.allSettled(
      ordenes.map(({ id, orden }) =>
        supabase.from("clientes").update({ orden }).eq("id", id)
      )
    );

    const fallos = updates.filter((u) => u.status === "rejected");

    if (fallos.length) {
      return res
        .status(500)
        .json({ error: "Algún orden no se actualizó correctamente" });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ Actualizar cliente (nombre y precioHora, nunca saldoDisponible)
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  // Protección: nunca permitas actualizar saldoDisponible desde aquí
  if ("saldoDisponible" in req.body) delete req.body.saldoDisponible;

  const campos = {};
  if (req.body.nombre !== undefined) campos.nombre = req.body.nombre;
  if (req.body.precioHora !== undefined)
    campos.precioHora = Number(req.body.precioHora);

  if (Object.keys(campos).length === 0) {
    return res.status(400).json({ error: "No hay campos para actualizar" });
  }

  const { error, data } = await supabase
    .from("clientes")
    .update(campos)
    .eq("id", id)
    .select();

  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0)
    return res.status(404).json({ error: "Cliente no encontrado" });

  res.json({ message: "Cliente actualizado" });
});

// ✅ Eliminar cliente
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

// ✅ Actualizar solo el saldoDisponible del cliente (solo saldo)
router.put("/:id/saldo", async (req, res) => {
  const clienteId = Number(req.params.id);
  const nuevoSaldo = Number(req.body.nuevoSaldo);

  if (Number.isNaN(clienteId) || Number.isNaN(nuevoSaldo)) {
    return res.status(400).json({ error: "Datos inválidos" });
  }

  const saldoSeguro = Math.max(0, nuevoSaldo); // No permite negativos

  const { error } = await supabase
    .from("clientes")
    .update({ saldoDisponible: saldoSeguro })
    .eq("id", clienteId);

  if (error) {
    return res.status(500).json({ error: "Error al actualizar el saldo" });
  }

  res.json({ message: "Saldo actualizado correctamente" });
});

module.exports = router;
