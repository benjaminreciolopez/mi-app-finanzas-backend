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

  // 👇 Recalcula saldo tras crear trabajo
  await actualizarSaldoCliente(clienteId);

  res.json({ id: data.id });
});
// ... justo antes de actualizar el trabajo:

// Actualizar trabajo
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);

  // Estado ANTERIOR
  const { data: trabajoAntes, error: errorTrabajo } = await supabase
    .from("trabajos")
    .select("fecha, horas, pagado, cuadrado, clienteId")
    .eq("id", id)
    .single();

  if (errorTrabajo || !trabajoAntes) {
    return res.status(404).json({ error: "Trabajo no encontrado" });
  }

  // 🔒 Protección: solo permite cuadrar si hay saldo suficiente
  if (
    req.body.cuadrado === 1 && // Se intenta marcar como cuadrado
    trabajoAntes.cuadrado !== 1 // ... y antes NO estaba cuadrado
  ) {
    // Va a cuadrar un trabajo, verifica saldo disponible
    const { data: cliente } = await supabase
      .from("clientes")
      .select("precioHora, saldoDisponible")
      .eq("id", trabajoAntes.clienteId)
      .single();

    if (!cliente) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }
    const costeTrabajo =
      Number(trabajoAntes.horas) * Number(cliente.precioHora);
    const saldo = Number(cliente.saldoDisponible);

    if (costeTrabajo > saldo + 0.001) {
      return res.status(400).json({
        error: `Saldo insuficiente (${saldo.toFixed(
          2
        )}€) para cuadrar este trabajo de ${costeTrabajo.toFixed(2)}€`,
      });
    }
  }

  // Actualiza el trabajo
  const { error } = await supabase
    .from("trabajos")
    .update(req.body)
    .eq("id", id);

  if (error) return res.status(400).json({ error: error.message });

  // Actualiza resumen mensual si cambia pagado/cuadrado
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

  // ⚠️ Recalcula SIEMPRE el saldo (aunque no haya cambios en pagado/cuadrado)
  await actualizarSaldoCliente(trabajoAntes.clienteId);

  res.json({ updated: true });
});

// Eliminar trabajo
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);

  // Busca el trabajo antes de borrarlo
  const { data: trabajo } = await supabase
    .from("trabajos")
    .select("fecha, horas, pagado, cuadrado, clienteId")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("trabajos").delete().eq("id", id);
  if (error) return res.status(400).json({ error: error.message });

  // Actualiza resumen mensual si era pagado/cuadrado
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
    }
  }

  // ⚠️ Recalcula SIEMPRE el saldo, aunque no estuviera pagado/cuadrado
  if (trabajo) {
    await actualizarSaldoCliente(trabajo.clienteId);
  }

  res.json({ deleted: true });
});

module.exports = router;
