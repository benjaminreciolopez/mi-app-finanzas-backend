const express = require("express");
const router = express.Router();
const { supabase } = require("../supabaseClient");

// Obtener evolución de un año concreto
router.get("/", async (req, res) => {
  const año = parseInt(req.query.año) || new Date().getFullYear();

  const { data, error } = await supabase
    .from("resumen_mensual")
    .select("*")
    .eq("año", año)
    .order("mes", { ascending: true });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.json({ data });
});

// Cerrar mes actual y guardar total
router.post("/cerrar-mes", async (req, res) => {
  const fecha = new Date();
  const año = fecha.getFullYear();
  const mes = fecha.getMonth() + 1;

  const mesInicio = `${año}-${mes.toString().padStart(2, "0")}-01`;
  const mesFin = `${año}-${(mes + 1).toString().padStart(2, "0")}-01`;

  const { data: trabajos, error } = await supabase
    .from("trabajos")
    .select("horas, nombre")
    .eq("pagado", 1)
    .gte("fecha", mesInicio)
    .lt("fecha", mesFin);

  if (error) return res.status(400).json({ error: error.message });

  const clientesMap = {};
  const { data: clientes } = await supabase
    .from("clientes")
    .select("nombre, precioHora");

  clientes.forEach((c) => {
    clientesMap[c.nombre] = c.precioHora;
  });

  const total = trabajos.reduce((acc, t) => {
    const precio = clientesMap[t.nombre] || 0;
    return acc + t.horas * precio;
  }, 0);

  const { error: insertError } = await supabase
    .from("resumen_mensual")
    .insert([{ año, mes, total }]);

  if (insertError) return res.status(400).json({ error: insertError.message });

  res.json({ message: "Mes cerrado exitosamente", totalCerrado: total });
});

module.exports = router;
