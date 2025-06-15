const express = require("express");
const router = express.Router();
const supabase = require("../supabaseClient");
const { getResumenCliente } = require("./pagos"); // Asegúrate de exportarla correctamente

// GET /api/deuda-real
router.get("/", async (req, res) => {
  const { data: clientes, error } = await supabase
    .from("clientes")
    .select("id");

  if (error) {
    console.error("Error al obtener clientes:", error.message);
    return res.status(500).json({ error: "Error al obtener clientes" });
  }

  const resumenes = [];

  for (const cliente of clientes) {
    try {
      const resumen = await getResumenCliente(cliente.id);
      if (resumen) resumenes.push(resumen);
    } catch (err) {
      console.error(`Error generando resumen para cliente ${cliente.id}:`, err);
    }
  }

  res.json(resumenes);
});

module.exports = router;
