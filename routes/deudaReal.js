const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");

// ✅ Resumen de todos los clientes
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
    .select("id, clienteid, fecha, coste, cuadrado"); // solo si aún no has renombrado el campo

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
      (m) => m.clienteid === cliente.id // cambia a m.clienteId si renombras el campo
    );
    const pagosCliente = pagos.filter((p) => p.clienteId === cliente.id);

    const trabajosPendientes = trabajosCliente.filter((t) => !t.cuadrado);
    const materialesPendientes = materialesCliente.filter((m) => !m.cuadrado);

    const totalTrabajo = trabajosCliente.reduce(
      (acc, t) => acc + t.horas * precioHora,
      0
    );
    const totalMaterial = materialesCliente.reduce(
      (acc, m) => acc + m.coste,
      0
    );

    const totalCuadradoTrabajo = trabajosCliente
      .filter((t) => t.cuadrado)
      .reduce((acc, t) => acc + t.horas * precioHora, 0);

    const totalCuadradoMaterial = materialesCliente
      .filter((m) => m.cuadrado)
      .reduce((acc, m) => acc + m.coste, 0);

    const totalPagos = pagosCliente.reduce(
      (acc, p) => acc + Number(p.cantidad),
      0
    );

    const deudaReal =
      totalTrabajo +
      totalMaterial -
      totalCuadradoTrabajo -
      totalCuadradoMaterial -
      totalPagos;

    const deuda = Math.max(0, +deudaReal.toFixed(2));

    const saldoACuenta = +(
      totalPagos -
      (totalCuadradoTrabajo + totalCuadradoMaterial)
    ).toFixed(2);

    const totalTareasPendientes =
      trabajosPendientes.reduce((acc, t) => acc + t.horas * precioHora, 0) +
      materialesPendientes.reduce((acc, m) => acc + m.coste, 0);

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
      totalTareasPendientes, // ✅ Ya definido correctamente
      totalDeuda: deuda,
      saldoACuenta,
    };
  });

  res.json(resumen);
});

// ✅ Trabajos y materiales pendientes para un cliente
router.get("/:clienteId/pendientes", async (req, res) => {
  const clienteId = parseInt(req.params.clienteId);
  if (isNaN(clienteId)) {
    return res.status(400).json({ error: "ID de cliente no válido" });
  }

  const [trabajos, materiales] = await Promise.all([
    supabase
      .from("trabajos")
      .select("id, fecha, horas, cuadrado")
      .eq("clienteId", clienteId)
      .eq("cuadrado", 0),
    supabase
      .from("materiales")
      .select("id, fecha, coste, cuadrado")
      .eq("clienteid", clienteId) // cambia a .eq("clienteId", clienteId) si renombras el campo
      .eq("cuadrado", 0),
  ]);

  if (trabajos.error || materiales.error) {
    return res.status(500).json({
      error: trabajos.error?.message || materiales.error?.message,
    });
  }

  const clienteRes = await supabase
    .from("clientes")
    .select("precioHora")
    .eq("id", clienteId)
    .single();

  if (clienteRes.error) {
    return res
      .status(500)
      .json({ error: "Error obteniendo precio del cliente" });
  }

  const precioHora = clienteRes.data.precioHora;

  const trabajosPendientes = trabajos.data.map((t) => ({
    id: t.id,
    fecha: t.fecha,
    coste: +(t.horas * precioHora).toFixed(2),
    tipo: "trabajo",
  }));

  const materialesPendientes = materiales.data.map((m) => ({
    id: m.id,
    fecha: m.fecha,
    coste: +m.coste.toFixed(2),
    tipo: "material",
  }));

  res.json({
    trabajos: trabajosPendientes,
    materiales: materialesPendientes,
  });
});

module.exports = router;
