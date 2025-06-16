const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");

// ✅ Resumen de todos los clientes (con logs de depuración)
router.get("/", async (req, res) => {
  // 1. Obtener clientes (incluyendo saldoDisponible)
  const { data: clientes, error: clientesError } = await supabase
    .from("clientes")
    .select("id, nombre, precioHora, saldoDisponible"); // <--- añadido saldoDisponible

  if (clientesError || !clientes) {
    console.error("❌ Error al obtener clientes:", clientesError?.message);
    return res.status(500).json({ error: "Error al obtener clientes" });
  }

  // 2. Obtener trabajos
  const { data: trabajos, error: trabajosError } = await supabase
    .from("trabajos")
    .select("id, clienteId, fecha, horas, cuadrado");

  // 3. Obtener materiales (forzamos clienteId en vez de clienteid)
  const { data: materiales, error: materialesError } = await supabase
    .from("materiales")
    .select("id, clienteId:clienteid, fecha, coste, cuadrado"); // <-- alias aquí

  // 4. Obtener pagos
  const { data: pagos, error: pagosError } = await supabase
    .from("pagos")
    .select("id, clienteId, cantidad");

  // 5. Comprobar errores después de obtener todos los datos
  if (trabajosError || materialesError || pagosError) {
    console.error("❌ Error al obtener datos desde Supabase:");
    console.error("Trabajos error:", trabajosError);
    console.error("Materiales error:", materialesError);
    console.error("Pagos error:", pagosError);
    return res.status(500).json({ error: "Error al obtener datos" });
  }

  console.log("📦 Clientes:", clientes.length);
  console.log("🔧 Trabajos:", trabajos.length);
  console.log("🧱 Materiales:", materiales.length);
  console.log("💳 Pagos:", pagos.length);

  try {
    const resumen = clientes.map((cliente) => {
      const precioHora = cliente.precioHora ?? 0;
      const saldoACuenta = Number(cliente.saldoDisponible) || 0; // <--- aquí

      const trabajosCliente = trabajos.filter(
        (t) => t.clienteId === cliente.id
      );
      const materialesCliente = materiales.filter(
        (m) => m.clienteId === cliente.id
      );
      const pagosCliente = pagos.filter((p) => p.clienteId === cliente.id);

      const trabajosPendientes = trabajosCliente.filter((t) => !t.cuadrado);
      const materialesPendientes = materialesCliente.filter((m) => !m.cuadrado);

      // No uses totalPagos para calcular la deuda, sino saldoACuenta
      const totalPagos = pagosCliente.reduce(
        (acc, p) => acc + Number(p.cantidad),
        0
      );

      const totalPendienteTrabajo = trabajosPendientes.reduce(
        (acc, t) => acc + (t.horas || 0) * precioHora,
        0
      );

      const totalPendienteMaterial = materialesPendientes.reduce(
        (acc, m) => acc + (m.coste || 0),
        0
      );

      const totalTareasPendientes = +(
        totalPendienteTrabajo + totalPendienteMaterial
      ).toFixed(2);

      // La deuda real es el total de tareas pendientes menos el saldo disponible
      let deudaReal = +(totalTareasPendientes - saldoACuenta).toFixed(2);
      deudaReal = Math.max(0, deudaReal);

      return {
        clienteId: cliente.id,
        nombre: cliente.nombre,
        totalPagado: totalPagos,
        totalHorasPendientes: trabajosPendientes.reduce(
          (acc, t) => acc + (t.horas || 0),
          0
        ),
        totalMaterialesPendientes: materialesPendientes.reduce(
          (acc, m) => acc + (m.coste || 0),
          0
        ),
        totalTareasPendientes,
        totalDeuda: deudaReal,
        saldoACuenta, // <--- para que el frontend lo muestre
      };
    });

    console.log("🧾 RESUMEN:", resumen);
    res.json(resumen);
  } catch (err) {
    console.error("❌ Error al construir resumen:", err);
    res.status(500).json({ error: "Error interno al construir resumen" });
  }
});

module.exports = router;
