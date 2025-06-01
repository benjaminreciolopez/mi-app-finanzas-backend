const supabase = require("../supabaseClient");

// Suma (o resta) el total de un trabajo al resumen mensual
async function actualizarResumenMensualTrabajo({
  fecha,
  horas,
  precioHora,
  operacion = "sumar",
}) {
  if (!fecha || !horas || !precioHora) return;

  const d = new Date(fecha);
  const año = d.getFullYear();
  const mes = d.getMonth() + 1;
  const total = horas * precioHora * (operacion === "restar" ? -1 : 1);

  // Busca el resumen mensual de ese mes
  const { data: resumen, error } = await supabase
    .from("resumen_mensual")
    .select("id, total")
    .eq("año", año)
    .eq("mes", mes)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Error buscando resumen mensual:", error.message);
    return;
  }

  if (resumen) {
    // Suma o resta al total
    await supabase
      .from("resumen_mensual")
      .update({ total: resumen.total + total })
      .eq("id", resumen.id);
  } else if (operacion === "sumar") {
    // Si no existe y es suma (nuevo pagado), crea el mes
    await supabase.from("resumen_mensual").insert([{ año, mes, total }]);
  }
}

module.exports = { actualizarResumenMensualTrabajo };
