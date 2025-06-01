const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");

router.get("/", async (req, res) => {
  // 1. Obtén clientes y precioHora
  const { data: clientes, error: clientesError } = await supabase
    .from("clientes")
    .select("id, nombre, precioHora");

  if (clientesError) {
    return res.status(500).json({ error: "Error al obtener clientes" });
  }

  // 2. Trabajos pendientes de cada cliente
  const { data: trabajos, error: trabajosError } = await supabase
    .from("trabajos")
    .select("id, clienteId, fecha, horas, cuadrado");

  // Materiales
  const { data: materiales, error: materialesError } = await supabase
    .from("materiales")
    .select("id, clienteid, fecha, coste, cuadrado");

  if (trabajosError || materialesError) {
    return res
      .status(500)
      .json({ error: "Error al obtener trabajos o materiales" });
  }

  // 3. Asignaciones de pagos
  const { data: asignaciones, error: asignacionesError } = await supabase
    .from("asignaciones_pago")
    .select("*");

  if (asignacionesError) {
    return res.status(500).json({ error: "Error al obtener asignaciones" });
  }

  // 4. Todos los pagos
  const { data: pagos, error: pagosError } = await supabase
    .from("pagos")
    .select("id, clienteId, cantidad");

  if (pagosError) {
    return res.status(500).json({ error: "Error al obtener pagos" });
  }

  // 5. Calcula resumen
  const resumen = clientes.map((cliente) => {
    const precioHora = cliente.precioHora ?? 0;

    // Trabajos pendientes
    const trabajosPendientes = (trabajos || [])
      .filter((t) => t.clienteId === cliente.id && t.cuadrado !== 1)
      .map((t) => ({
        id: t.id,
        tipo: "trabajo",
        fecha: t.fecha,
        coste: +(t.horas * precioHora).toFixed(2),
        horas: t.horas,
      }));

    // Materiales pendientes
    const materialesPendientes = (materiales || [])
      .filter((m) => m.clienteid === cliente.id && m.cuadrado !== 1)
      .map((m) => ({
        id: m.id,
        tipo: "material",
        fecha: m.fecha,
        coste: +m.coste.toFixed(2),
      }));

    // Dinero pendiente de cada tarea/material (total coste - asignado)
    let totalPendiente = 0;
    for (const t of trabajosPendientes) {
      const asignado = (asignaciones || [])
        .filter((a) => a.trabajoid === t.id && a.clienteid === cliente.id)
        .reduce((acc, a) => acc + Number(a.usado), 0);
      totalPendiente += Math.max(0, +(t.coste - asignado).toFixed(2));
    }
    for (const m of materialesPendientes) {
      const asignado = (asignaciones || [])
        .filter((a) => a.materialid === m.id && a.clienteid === cliente.id)
        .reduce((acc, a) => acc + Number(a.usado), 0);
      totalPendiente += Math.max(0, +(m.coste - asignado).toFixed(2));
    }

    // Suma lo asignado (dinero ya asignado a tareas)
    const totalAsignado = (asignaciones || [])
      .filter((a) => a.clienteid === cliente.id)
      .reduce((acc, a) => acc + Number(a.usado), 0);

    // Suma todos los pagos del cliente (total pagado aunque no cubra todo)
    const totalPagos = (pagos || [])
      .filter((p) => p.clienteId === cliente.id)
      .reduce((acc, p) => acc + Number(p.cantidad), 0);

    // Saldo a cuenta (pagos no asignados todavía a tareas completas)
    const saldoACuenta = totalPagos - totalAsignado;

    // Deuda real: lo pendiente - saldo a cuenta (si hay saldo suelto), nunca negativo
    const deudaReal = Math.max(0, +(totalPendiente - saldoACuenta).toFixed(2));

    // Horas pendientes (solo lo que queda por pagar de cada trabajo dividido precioHora)
    const totalHorasPendientes = trabajosPendientes.reduce((acc, t) => {
      const asignado = (asignaciones || [])
        .filter((a) => a.trabajoid === t.id && a.clienteid === cliente.id)
        .reduce((acc, a) => acc + Number(a.usado), 0);
      const pendienteDinero = Math.max(0, +(t.coste - asignado));
      const horasPendientes = +(pendienteDinero / (precioHora || 1)).toFixed(2);
      return acc + horasPendientes;
    }, 0);

    // Para la tabla de pagos por cliente
    const pagosUsados = (asignaciones || [])
      .filter((a) => a.clienteid === cliente.id)
      .reduce((acc, a) => {
        acc[a.pagoid] = (acc[a.pagoid] || 0) + Number(a.usado);
        return acc;
      }, {});

    return {
      clienteId: cliente.id,
      nombre: cliente.nombre,
      totalPagado: +totalAsignado.toFixed(2),
      totalHorasPendientes,
      totalMaterialesPendientes: materialesPendientes.reduce(
        (acc, m) => acc + m.coste,
        0
      ),
      totalDeuda: deudaReal,
      saldoACuenta: +saldoACuenta.toFixed(2),
      pagosUsados: Object.entries(pagosUsados).map(([id, usado]) => ({
        id,
        usado: +usado.toFixed(2),
      })),
    };
  });

  res.json(resumen);
});

module.exports = router;
