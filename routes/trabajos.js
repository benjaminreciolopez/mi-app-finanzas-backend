const { actualizarSaldoCliente } = require("../utils/actualizarSaldoCliente");

const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");
const {
  actualizarResumenMensualTrabajo,
} = require("../utils/actualizarResumenMensual");

// Obtener todos los trabajos
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase.from("trabajos").select("*");
    if (error) {
      console.error("❌ Supabase error:", error.message);
      return res.status(500).json({ error: error.message });
    }
    res.json({ data });
  } catch (err) {
    console.error("❌ Error inesperado:", err);
    res.status(500).json({ error: "Error al obtener trabajos" });
  }
});

// Añadir nuevo trabajo
router.post("/", async (req, res) => {
  const {
    clienteId,
    nombre,
    fecha,
    horas,
    pagado = 0,
    cuadrado = 0,
  } = req.body;

  const { data, error } = await supabase
    .from("trabajos")
    .insert([{ clienteId, nombre, fecha, horas, pagado, cuadrado }])
    .select("id")
    .single();

  if (error) {
    console.error("❌ Supabase error al crear trabajo:", error.message);
    return res.status(500).json({ error: error.message });
  }

  res.json({ id: data.id }); // ✅ ESTO FALTABA
});

// Actualizar trabajo (estado o campos generales)
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);

  // Obtener el estado ANTERIOR del trabajo (antes de actualizar)
  const { data: trabajoAntes, error: errorTrabajo } = await supabase
    .from("trabajos")
    .select("fecha, horas, pagado, cuadrado, clienteId")
    .eq("id", id)
    .single();

  if (errorTrabajo || !trabajoAntes) {
    return res.status(404).json({ error: "Trabajo no encontrado" });
  }

  // Actualizar el trabajo con los datos nuevos
  const { error } = await supabase
    .from("trabajos")
    .update(req.body)
    .eq("id", id);

  if (error) return res.status(400).json({ error: error.message });

  // Calcular si hay cambio de estado pagado/cuadrado
  const pagadoAntes = trabajoAntes.pagado;
  const cuadradoAntes = trabajoAntes.cuadrado;
  const pagadoAhora =
    req.body.pagado !== undefined ? req.body.pagado : pagadoAntes;
  const cuadradoAhora =
    req.body.cuadrado !== undefined ? req.body.cuadrado : cuadradoAntes;

  if (pagadoAntes !== pagadoAhora || cuadradoAntes !== cuadradoAhora) {
    const { data: cliente } = await supabase
      .from("clientes")
      .select("precioHora")
      .eq("id", trabajoAntes.clienteId)
      .single();

    if (cliente) {
      if (
        (pagadoAhora === 1 || cuadradoAhora === 1) &&
        !(pagadoAntes === 1 || cuadradoAntes === 1)
      ) {
        await actualizarResumenMensualTrabajo({
          fecha: trabajoAntes.fecha,
          horas: trabajoAntes.horas,
          precioHora: cliente.precioHora,
          operacion: "sumar",
        });
      } else if (
        !(pagadoAhora === 1 || cuadradoAhora === 1) &&
        (pagadoAntes === 1 || cuadradoAntes === 1)
      ) {
        await actualizarResumenMensualTrabajo({
          fecha: trabajoAntes.fecha,
          horas: trabajoAntes.horas,
          precioHora: cliente.precioHora,
          operacion: "restar",
        });
      }
    }
  }

  // ⚠️ MUY IMPORTANTE: recalcular saldo SOLO después de todo lo demás
  await actualizarSaldoCliente(trabajoAntes.clienteId);

  res.json({ updated: true });
});

// Eliminar trabajo
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);

  // Busca trabajo antes de borrarlo
  const { data: trabajo } = await supabase
    .from("trabajos")
    .select("fecha, horas, pagado, cuadrado, clienteId")
    .eq("id", id)
    .single();

  // Elimina el trabajo
  const { error } = await supabase.from("trabajos").delete().eq("id", id);
  if (error) return res.status(400).json({ error: error.message });

  // Si estaba pagado/cuadrado, resta del resumen
  if (trabajo && (trabajo.pagado === 1 || trabajo.cuadrado === 1)) {
    const { data: cliente } = await supabase
      .from("clientes")
      .select("precioHora")
      .eq("id", trabajo.clienteId)
      .single();
    if (cliente) {
      await actualizarResumenMensualTrabajo({
        fecha: trabajo.fecha,
        horas: trabajo.horas,
        precioHora: cliente.precioHora,
        operacion: "restar",
      });
      await actualizarSaldoCliente(trabajo.clienteId);
    }
  }

  res.json({ deleted: true });
});

module.exports = router;
