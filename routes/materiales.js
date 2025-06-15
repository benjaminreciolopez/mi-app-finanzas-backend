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

  res.json({ message: "Material añadido correctamente", id: data?.id });
});

// Actualizar material (pagado/cuadrado)
router.put("/:id", async (req, res) => {
  const { pagado, cuadrado } = req.body;

  const { data: materialAntes } = await supabase
    .from("materiales")
    .select("fecha, coste, pagado, cuadrado, clienteId")
    .eq("id", req.params.id)
    .single();

  const updateFields = {};
  if (pagado !== undefined) updateFields.pagado = pagado;
  if (cuadrado !== undefined) updateFields.cuadrado = cuadrado;

  const { error } = await supabase
    .from("materiales")
    .update(updateFields)
    .eq("id", req.params.id);

  if (error) return res.status(400).json({ error: error.message });

  const pagadoAntes = materialAntes?.pagado;
  const cuadradoAntes = materialAntes?.cuadrado;
  const pagadoAhora = pagado !== undefined ? pagado : pagadoAntes;
  const cuadradoAhora = cuadrado !== undefined ? cuadrado : cuadradoAntes;

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

  // ✅ Recalcular saldo del cliente
  await actualizarSaldoCliente(materialAntes.clienteId);

  res.json({ message: "Material actualizado correctamente" });
});

// Eliminar material
router.delete("/:id", async (req, res) => {
  const id = req.params.id;

  const { data: material, error: errorMaterial } = await supabase
    .from("materiales")
    .select("fecha, coste, pagado, cuadrado, clienteId")
    .eq("id", id)
    .single();

  if (errorMaterial || !material) {
    return res.status(404).json({ error: "Material no encontrado" });
  }

  const { error } = await supabase.from("materiales").delete().eq("id", id);
  if (error) return res.status(400).json({ error: error.message });

  if (material.pagado === 1 || material.cuadrado === 1) {
    await actualizarResumenMensualMaterial({
      fecha: material.fecha,
      coste: material.coste,
      operacion: "restar",
    });
  }

  // ✅ Recalcular saldo del cliente
  await actualizarSaldoCliente(material.clienteId);

  res.json({ message: "Material eliminado correctamente" });
});

module.exports = router;
