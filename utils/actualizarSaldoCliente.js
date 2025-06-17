const supabase = require("../supabaseClient");
const { Decimal } = require("decimal.js");

/**
 * Actualiza el saldo disponible de un cliente.
 * El saldo se calcula como: total histórico de pagos - total histórico de deudas cuadradas.
 * Nunca puede ser negativo.
 */
async function actualizarSaldoCliente(clienteId) {
  console.log("→ Iniciando actualizarSaldoCliente para clienteId:", clienteId);

  // 1. Validar y convertir clienteId
  clienteId = Number(clienteId);
  if (Number.isNaN(clienteId)) {
    console.error(
      "❌ Error en actualizarSaldoCliente: clienteId no es un número válido:",
      clienteId
    );
    return;
  }

  // 2. Obtener precioHora del cliente
  let precioHoraDecimal;
  try {
    let clienteData;
    const { data: cliente, error: errorCliente } = await supabase
      .from("clientes")
      .select("precioHora")
      .eq("id", clienteId)
      .single();

    clienteData = cliente;

    if (errorCliente) {
      console.error(
        `❌ Error obteniendo cliente ${clienteId} para precioHora: ${errorCliente.message}`
      );
      throw errorCliente; // Error crítico, no se puede continuar sin el cliente o su precioHora
    }
    if (!cliente) {
      console.error(
        `❌ Error: Cliente ${clienteId} no encontrado al buscar precioHora.`
      );
      throw new Error(`Cliente ${clienteId} no encontrado.`);
    }
    if (cliente.precioHora === null || cliente.precioHora === undefined) {
      console.error(
        `❌ Error: precioHora es nulo o indefinido para el cliente ${clienteId}.`
      );
      throw new Error(`precioHora nulo/indefinido para cliente ${clienteId}.`);
    }

    console.log(`[FUNC_DEBUG] precioHora de DB: ${cliente.precioHora}`);
    // Intento de conversión de precioHora. Si falla o es NaN, se considera crítico.
    try {
      precioHoraDecimal = new Decimal(cliente.precioHora);
      if (precioHoraDecimal.isNaN()) {
        // Este console.error es el que espera el test 'precioHora no válido'
        console.error(
          `❌ Error: precioHora '${cliente.precioHora}' no es un número válido para cliente ${clienteId}.`
        );
        throw new Error(`precioHora NaN para cliente ${clienteId}.`);
      }
    } catch (decimalError) {
      // Captura error de new Decimal() si 'cliente.precioHora' es muy inválido
      console.error(
        `❌ Error: precioHora '${cliente.precioHora}' no es un número válido para cliente ${clienteId}.`
      );
      throw decimalError; // Relanzar para que el catch externo principal lo maneje
    }
    console.log(
      `[DEBUG] precioHoraDecimal para cliente ${clienteId}: ${precioHoraDecimal.toString()}`
    );
  } catch (error) {
    // Catch principal para la obtención de precioHora
    console.log(
      `[FUNC_DEBUG] Catch en obtener/validar precioHora (crítico). Error: ${error.message}`
    );
    return; // Detener si no se puede obtener un precioHora válido y válido.
  }

  // 3. Calcular totalPagadoHistoricoDecimal
  let totalPagadoHistoricoDecimal = new Decimal(0);
  try {
    const { data: pagosData, error: errorPagos } = await supabase
      .from("pagos")
      .select("cantidad")
      .eq("clienteId", clienteId);

    if (errorPagos) {
      console.error(
        `❌ Error obteniendo pagos para cliente ${clienteId}: ${errorPagos.message}`
      );
      // No re-lanzar, totalPagadoHistoricoDecimal permanecerá 0.
    } else if (pagosData) {
      totalPagadoHistoricoDecimal = pagosData.reduce((acc, p) => {
        try {
          // Usar p.cantidad directamente, si es null/undefined, Decimal(null||0) es Decimal(0)
          const cantidadDecimal = new Decimal(p.cantidad || 0);
          if (cantidadDecimal.isNaN() || cantidadDecimal.isNegative()) {
            // Considerar pagos negativos como inválidos
            console.warn(
              `⚠️ Cantidad de pago inválida o negativa '${p.cantidad}' para cliente ${clienteId}. Se tratará como 0.`
            );
            return acc;
          }
          return acc.plus(cantidadDecimal);
        } catch (e) {
          console.warn(
            `⚠️ Error al convertir cantidad de pago '${p.cantidad}' a Decimal para cliente ${clienteId}. Se tratará como 0. Error: ${e.message}`
          );
          return acc;
        }
      }, new Decimal(0));
    }
    console.log(
      `[DEBUG] totalPagadoHistoricoDecimal para cliente ${clienteId}: ${totalPagadoHistoricoDecimal.toFixed(
        2
      )}`
    );
  } catch (error) {
    console.error(
      `❌ Error INESPERADO calculando totalPagadoHistoricoDecimal para cliente ${clienteId}: ${error.message}`
    );
  }

  // 4. Calcular totalDeudaCuadradaDecimal
  let totalDeudaCuadradaDecimal = new Decimal(0);
  let totalDeudaTrabajosDecimal = new Decimal(0);
  let totalDeudaMaterialesDecimal = new Decimal(0);

  // --- Sumar trabajos cuadrados ---
  try {
    const { data: trabajosCuadradosData, error: errorTrabajos } = await supabase
      .from("trabajos")
      .select("id, horas") // Incluir ID para logs de advertencia más útiles
      .eq("clienteId", clienteId)
      .eq("cuadrado", 1);

    if (errorTrabajos) {
      console.error(
        `❌ Error obteniendo trabajos cuadrados para cliente ${clienteId}: ${errorTrabajos.message}`
      );
    } else if (trabajosCuadradosData) {
      trabajosCuadradosData.forEach((t) => {
        let horasDecimal = new Decimal(0);
        try {
          if (typeof t.horas !== "string" && typeof t.horas !== "number") {
            console.warn(
              `⚠️ Formato de horas inválido: ${typeof t.horas} ('${
                t.horas
              }') para trabajo ID ${
                t.id
              }, cliente ${clienteId}. Costo se tratará como 0.`
            );
            // horasDecimal ya es 0
          } else {
            const tempHoras = new Decimal(t.horas);
            if (tempHoras.isNaN() || tempHoras.isNegative()) {
              console.warn(
                `⚠️ Horas de trabajo inválidas o negativas '${t.horas}' para trabajo ID ${t.id}, cliente ${clienteId}. Costo se tratará como 0.`
              );
              // horasDecimal ya es 0
            } else {
              horasDecimal = tempHoras;
            }
          }
        } catch (e) {
          console.warn(
            `⚠️ Error al procesar horas de trabajo '${t.horas}' para trabajo ID ${t.id}, cliente ${clienteId}. Costo se tratará como 0. Detalle: ${e.message}`
          );
          // horasDecimal ya es 0
        }
        const costoTrabajo = horasDecimal.times(precioHoraDecimal);
        console.log(
          `[FUNC_DEBUG] Trabajo cliente ${clienteId}, ID ${t.id}: horas '${
            t.horas
          }', horasDecimal ${horasDecimal.toString()}, costoTrabajo ${costoTrabajo.toFixed(
            2
          )}`
        );
        totalDeudaTrabajosDecimal =
          totalDeudaTrabajosDecimal.plus(costoTrabajo);
      });
    }
  } catch (error) {
    console.error(
      `❌ Error INESPERADO procesando totalDeudaTrabajosDecimal para cliente ${clienteId}: ${error.message}`
    );
  }
  totalDeudaCuadradaDecimal = totalDeudaCuadradaDecimal.plus(
    totalDeudaTrabajosDecimal
  );

  // --- Sumar materiales cuadrados ---
  try {
    const { data: materialesCuadradosData, error: errorMateriales } =
      await supabase
        .from("materiales")
        .select("id, coste") // Incluir ID para logs
        .eq("clienteId", clienteId)
        .eq("cuadrado", 1);

    if (errorMateriales) {
      console.error(
        `❌ Error obteniendo materiales cuadrados para cliente ${clienteId}: ${errorMateriales.message}`
      );
    } else if (materialesCuadradosData) {
      (materialesCuadradosData || []).forEach((m) => {
        let costeDecimal = new Decimal(0); // Inicializar a Decimal(0)
        // let costoMaterial = new Decimal(0); // costoMaterial no es necesario, se puede usar costeDecimal directamente
        try {
          if (typeof m.coste !== "string" && typeof m.coste !== "number") {
            console.warn(
              `⚠️ Formato de coste inválido: ${typeof m.coste} ('${
                m.coste
              }') para material ID ${
                m.id
              }, cliente ${clienteId}. Costo se tratará como 0.`
            );
            // costeDecimal ya es 0
          } else {
            const tempCoste = new Decimal(m.coste); // Puede lanzar error
            if (tempCoste.isNaN() || tempCoste.isNegative()) {
              console.warn(
                `⚠️ Coste de material inválido o negativo '${m.coste}' para material ID ${m.id}, cliente ${clienteId}. Se tratará como 0.`
              );
              // costeDecimal ya es 0
            } else {
              costeDecimal = tempCoste;
            }
          }
        } catch (e) {
          console.warn(
            `⚠️ Error al procesar coste de material '${m.coste}' para material ID ${m.id}, cliente ${clienteId}. Costo se tratará como 0. Detalle: ${e.message}`
          );
          // costeDecimal ya es 0
        }
        console.log(
          `[FUNC_DEBUG] Material cliente ${clienteId}, ID ${m.id}: coste '${
            m.coste
          }', costeDecimal ${costeDecimal.toString()}`
        );
        totalDeudaMaterialesDecimal =
          totalDeudaMaterialesDecimal.plus(costeDecimal); // Usar costeDecimal directamente
      });
    }
  } catch (error) {
    console.error(
      `❌ Error INESPERADO procesando totalDeudaMaterialesDecimal para cliente ${clienteId}: ${error.message}`
    );
  }
  totalDeudaCuadradaDecimal = totalDeudaCuadradaDecimal.plus(
    totalDeudaMaterialesDecimal
  );

  console.log(
    `[DEBUG] totalDeudaCuadradaDecimal (trabajos + materiales) para cliente ${clienteId}: ${totalDeudaCuadradaDecimal.toFixed(
      2
    )}`
  );
  // No es necesario [FUNC_DEBUG] FIN Calculo Deuda aquí, se calcula y se usa.
  // El try-catch global anterior fue eliminado para permitir que los cálculos individuales fallen y se recuperen.

  // 5. Calcular nuevoSaldoDisponibleDecimal
  console.log(
    `[FUNC_DEBUG] Calculando Saldo: totalPagadoHistoricoDecimal (${totalPagadoHistoricoDecimal.toFixed(
      2
    )}) - totalDeudaCuadradaDecimal (${totalDeudaCuadradaDecimal.toFixed(2)})`
  );
  let nuevoSaldoDisponibleDecimal = totalPagadoHistoricoDecimal.minus(
    totalDeudaCuadradaDecimal
  );
  console.log(
    `[DEBUG] Saldo calculado (pre-ajuste) para cliente ${clienteId}: ${nuevoSaldoDisponibleDecimal.toFixed(
      2
    )}`
  );

  // 6. Asegurar que no sea negativo
  nuevoSaldoDisponibleDecimal = Decimal.max(0, nuevoSaldoDisponibleDecimal);
  console.log(
    `[DEBUG] Saldo disponible final para cliente ${clienteId}: ${nuevoSaldoDisponibleDecimal.toFixed(
      2
    )}`
  );

  // 7. Actualizar en Supabase
  try {
    const { error: errorUpdate } = await supabase
      .from("clientes")
      .update({ saldoDisponible: nuevoSaldoDisponibleDecimal.toNumber() })
      .eq("id", clienteId);

    console.log(`[FUNC_DEBUG] errorUpdate: ${JSON.stringify(errorUpdate)}`);
    if (errorUpdate) {
      console.error(
        `❌ Error actualizando saldoDisponible para cliente ${clienteId}:`,
        errorUpdate.message
      );
      console.log(`[FUNC_DEBUG] Lanzando error por errorUpdate.`);
      throw errorUpdate;
    }
    console.log(
      `✅ Saldo actualizado exitosamente a ${nuevoSaldoDisponibleDecimal.toFixed(
        2
      )}€ para cliente ${clienteId}`
    );
  } catch (error) {
    console.log(`[FUNC_DEBUG] Catch en actualizar BD. Error: ${error.message}`);
    // console.error(`❌ Falló la actualización del saldo en BD para cliente ${clienteId}: ${error.message}`);
    return;
  }
}

module.exports = { actualizarSaldoCliente };
