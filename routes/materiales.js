const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");
const {
  actualizarResumenMensualMaterial,
} = require("../utils/actualizarResumenMensual");
const { actualizarSaldoCliente } = require("../utils/actualizarSaldoCliente");

// Obtener todos los materiales
router.get("/", async (req, res) => {
  const { data, error } = await supabase.from("materiales").select("*");
  if (error) return res.status(400).json({ error: error.message });
  res.json({ data });
});

// Añadir nuevo material
router.post("/", async (req, res) => {
  const {
    descripcion,
    coste,
    nombre,
    fecha,
    pagado = 0,
    cuadrado = 0,
    clienteId,
  } = req.body;

  const { data, error } = await supabase
    .from("materiales")
    .insert([
      { descripcion, coste, nombre, fecha, pagado, cuadrado, clienteId },
    ])
    .select()
    .single();

  if (error) {
    console.error("❌ Error insertando material:", error.message);
    return res.status(400).json({ error: error.message });
  }

  // ✅ Recalcula saldo tras añadir material
  await actualizarSaldoCliente(clienteId);

  res.json({ message: "Material añadido correctamente", id: data?.id });
});

// Actualizar material (pagado/cuadrado/cualquier campo)
router.put("/:id", async (req, res) => {
  const id = req.params.id;

  // Obtiene estado anterior
  const { data: materialAntes, error: errorAntes } = await supabase
    .from("materiales")
    .select("fecha, coste, pagado, cuadrado, clienteId")
    .eq("id", id)
    .single();

  if (errorAntes || !materialAntes) {
    return res.status(404).json({ error: "Material no encontrado" });
  }

  // 🔒 Protección: solo permite cuadrar si hay saldo suficiente
  if (
    req.body.cuadrado === 1 && // Se intenta marcar como cuadrado
    materialAntes.cuadrado !== 1 // ... y antes NO estaba cuadrado
  ) {
    // Va a cuadrar un material, verifica saldo disponible
    const { data: cliente } = await supabase
      .from("clientes")
      .select("saldoDisponible")
      .eq("id", materialAntes.clienteId)
      .single();

    if (!cliente) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }
    const costeMaterial = Number(materialAntes.coste);
    const saldo = Number(cliente.saldoDisponible);

    if (costeMaterial > saldo + 0.001) {
      return res.status(400).json({
        error: `Saldo insuficiente (${saldo.toFixed(
          2
        )}€) para cuadrar este material de ${costeMaterial.toFixed(2)}€`,
      });
    }
  }

  // Actualiza el material (puede cambiar cualquier campo)
  const { error } = await supabase
    .from("materiales")
    .update(req.body)
    .eq("id", id);

  if (error) return res.status(400).json({ error: error.message });

  // Compara y actualiza resumen mensual si cambia pagado/cuadrado
  const pagadoAntes = materialAntes.pagado;
  const cuadradoAntes = materialAntes.cuadrado;
  const pagadoAhora =
    req.body.pagado !== undefined ? req.body.pagado : pagadoAntes;
  const cuadradoAhora =
    req.body.cuadrado !== undefined ? req.body.cuadrado : cuadradoAntes;

  if (pagadoAntes !== pagadoAhora || cuadradoAntes !== cuadradoAhora) {
    if (
      (pagadoAhora === 1 || cuadradoAhora === 1) &&
      !(pagadoAntes === 1 || cuadradoAntes === 1)
    ) {
      await actualizarResumenMensualMaterial({
        fecha: materialAntes.fecha,
        coste: materialAntes.coste,
        operacion: "sumar",
      });
    } else if (
      !(pagadoAhora === 1 || cuadradoAhora === 1) &&
      (pagadoAntes === 1 || cuadradoAntes === 1)
    ) {
      await actualizarResumenMensualMaterial({
        fecha: materialAntes.fecha,
        coste: materialAntes.coste,
        operacion: "restar",
      });
    }
  }

  // ✅ Recalcula saldo del cliente SIEMPRE, aunque solo cambies el coste o la fecha
  await actualizarSaldoCliente(materialAntes.clienteId);

  res.json({ message: "Material actualizado correctamente" });
});

// Eliminar material
router.delete("/:id", async (req, res) => {
  const id = req.params.id;

  // Busca material antes de borrarlo
  const { data: material, error: errorMaterial } = await supabase
    .from("materiales")
    .select("fecha, coste, pagado, cuadrado, clienteId")
    .eq("id", id)
    .single();

  if (errorMaterial || !material) {
    return res.status(404).json({ error: "Material no encontrado" });
  }

  // Elimina
  const { error } = await supabase.from("materiales").delete().eq("id", id);
  if (error) return res.status(400).json({ error: error.message });

  // Si estaba saldado, resta del resumen mensual
  if (material.pagado === 1 || material.cuadrado === 1) {
    await actualizarResumenMensualMaterial({
      fecha: material.fecha,
      coste: material.coste,
      operacion: "restar",
    });
  }

  // ✅ Recalcula saldo SIEMPRE, aunque no estuviera pagado/cuadrado
  await actualizarSaldoCliente(material.clienteId);

  res.json({ message: "Material eliminado correctamente" });
});

module.exports = router;
