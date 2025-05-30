const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");

router.get("/", async (req, res) => {
  const [clientesRes, trabajosRes, materialesRes, pagosRes] = await Promise.all(
    [
      supabase.from("clientes").select("id, nombre, precioHora"),
      supabase.from("trabajos").select("clienteId, horas, pagado"),
      supabase.from("materiales").select("clienteid, coste, pagado"),
      supabase.from("pagos").select("clienteId, cantidad"),
    ]
  );

  if (
    clientesRes.error ||
    trabajosRes.error ||
    materialesRes.error ||
    pagosRes.error
  ) {
    console.error("Errores detectados:", {
      clientesRes: clientesRes.error,
      trabajosRes: trabajosRes.error,
      materialesRes: materialesRes.error,
      pagosRes: pagosRes.error,
    });
    return res
      .status(500)
      .json({ error: "Error al obtener datos de Supabase" });
  }

  const clientes = clientesRes.data;
  const trabajos = trabajosRes.data;
  const materiales = materialesRes.data;
  const pagos = pagosRes.data;

  const resumen = clientes.map((cliente) => {
    const trabajosCliente = trabajos.filter((t) => t.clienteId === cliente.id);
    const materialesCliente = materiales.filter(
      (m) => m.clienteid === cliente.id
    );
    const pagosCliente = pagos.filter((p) => p.clienteId === cliente.id);

    const precioHora = cliente.precioHora ?? 0;

    // Suma solo los trabajos NO pagados
    const totalHorasPendientes = trabajosCliente
      .filter((t) => !t.pagado)
      .reduce((acc, t) => acc + Number(t.horas), 0);

    // Suma solo los materiales NO pagados
    const totalMaterialesPendientes = materialesCliente
      .filter((m) => !m.pagado)
      .reduce((acc, m) => acc + Number(m.coste), 0);

    const costePendiente =
      totalHorasPendientes * precioHora + totalMaterialesPendientes;
    const totalPagado = pagosCliente.reduce(
      (acc, p) => acc + Number(p.cantidad),
      0
    );
    const deudaReal = Math.max(0, costePendiente - totalPagado);

    return {
      clienteId: cliente.id,
      nombre: cliente.nombre,
      totalPagado,
      totalHorasPendientes: totalHorasPendientes,
      totalMaterialesPendientes: totalMaterialesPendientes,
      totalDeuda: deudaReal,
    };
  });

  res.json(resumen);
});

module.exports = router;
