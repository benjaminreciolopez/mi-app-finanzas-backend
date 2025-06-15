const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");

// ✅ Resumen de todos los clientes (sin saldoDisponible ni saldoACuenta)
router.get("/", async (req, res) => {
  const { data: clientes, error: clientesError } = await supabase
    .from("clientes")
    .select("id, nombre, precioHora");

  if (clientesError) {
    return res.status(500).json({ error: "Error al obtener clientes" });
  }

  const { data: trabajos, error: trabajosError } = await supabase
    .from("trabajos")
    .select("id, clienteId, fecha, horas, cuadrado");

  const { data: materiales, error: materialesError } = await supabase
    .from("materiales")
    .select("id, clienteid, fecha, coste, cuadrado");

  const { data: pagos, error: pagosError } = await supabase
    .from("pagos")
    .select("id, clienteId, cantidad");

  if (trabajosError || materialesError || pagosError) {
    console.error("Errores al obtener datos:");
    if (trabajosError) console.error("Trabajos:", trabajosError.message);
    if (materialesError) console.error("Materiales:", materialesError.message);
    if (pagosError) console.error("Pagos:", pagosError.message);
    return res.status(500).json({ error: "Error al obtener datos" });
  }

  const resumen = clientes.map((cliente) => {
    const precioHora = cliente.precioHora ?? 0;

    const trabajosCliente = trabajos.filter((t) => t.clienteId === cliente.id);
    const materialesCliente = materiales.filter(
      (m) => m.clienteid === cliente.id
    );
    const pagosCliente = pagos.filter((p) => p.clienteId === cliente.id);

    const trabajosPendientes = trabajosCliente.filter((t) => !t.cuadrado);
    const materialesPendientes = materialesCliente.filter((m) => !m.cuadrado);

    const totalPagos = pagosCliente.reduce(
      (acc, p) => acc + Number(p.cantidad),
      0
    );

    const totalPendienteTrabajo = trabajosPendientes.reduce(
      (acc, t) => acc + t.horas * precioHora,
      0
    );

    const totalPendienteMaterial = materialesPendientes.reduce(
      (acc, m) => acc + m.coste,
      0
    );

    const totalTareasPendientes = +(
      totalPendienteTrabajo + totalPendienteMaterial
    ).toFixed(2);

    let deudaReal = +(totalTareasPendientes - totalPagos).toFixed(2);

    // ✅ Si no quedan tareas/materiales, deuda = 0
    if (trabajosPendientes.length === 0 && materialesPendientes.length === 0) {
      deudaReal = 0;
    } else {
      deudaReal = Math.max(0, deudaReal);
    }

    return {
      clienteId: cliente.id,
      nombre: cliente.nombre,
      totalPagado: totalPagos,
      totalHorasPendientes: trabajosPendientes.reduce(
        (acc, t) => acc + t.horas,
        0
      ),
      totalMaterialesPendientes: materialesPendientes.reduce(
        (acc, m) => acc + m.coste,
        0
      ),
      totalTareasPendientes,
      totalDeuda: deudaReal,
    };
  });

  res.json(resumen);
});

module.exports = router;
