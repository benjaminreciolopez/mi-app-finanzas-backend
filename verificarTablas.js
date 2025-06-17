// Script para verificar la estructura de las tablas en Supabase
require("dotenv").config();
const supabase = require("./supabaseClient");

async function verificarTablas() {
  console.log("🔍 Verificando estructura de tablas en Supabase...");
  
  try {
    // Verificar tabla de clientes
    const { data: clientes, error: errorClientes } = await supabase
      .from("clientes")
      .select("*")
      .limit(1);
    
    if (errorClientes) {
      console.error("❌ Error al acceder a la tabla clientes:", errorClientes.message);
    } else {
      console.log("✅ Tabla clientes accesible");
      if (clientes && clientes.length > 0) {
        console.log("📋 Estructura de clientes:", Object.keys(clientes[0]));
      }
    }
    
    // Verificar tabla de materiales
    const { data: materiales, error: errorMateriales } = await supabase
      .from("materiales")
      .select("*")
      .limit(1);
    
    if (errorMateriales) {
      console.error("❌ Error al acceder a la tabla materiales:", errorMateriales.message);
    } else {
      console.log("✅ Tabla materiales accesible");
      if (materiales && materiales.length > 0) {
        console.log("📋 Estructura de materiales:", Object.keys(materiales[0]));
        console.log("🔑 Campo de cliente en materiales:", 
          Object.keys(materiales[0]).find(key => key.toLowerCase().includes('client')));
      }
    }
    
    // Verificar tabla de trabajos
    const { data: trabajos, error: errorTrabajos } = await supabase
      .from("trabajos")
      .select("*")
      .limit(1);
    
    if (errorTrabajos) {
      console.error("❌ Error al acceder a la tabla trabajos:", errorTrabajos.message);
    } else {
      console.log("✅ Tabla trabajos accesible");
      if (trabajos && trabajos.length > 0) {
        console.log("📋 Estructura de trabajos:", Object.keys(trabajos[0]));
        console.log("🔑 Campo de cliente en trabajos:", 
          Object.keys(trabajos[0]).find(key => key.toLowerCase().includes('client')));
      }
    }
    
    // Verificar tabla de pagos
    const { data: pagos, error: errorPagos } = await supabase
      .from("pagos")
      .select("*")
      .limit(1);
    
    if (errorPagos) {
      console.error("❌ Error al acceder a la tabla pagos:", errorPagos.message);
    } else {
      console.log("✅ Tabla pagos accesible");
      if (pagos && pagos.length > 0) {
        console.log("📋 Estructura de pagos:", Object.keys(pagos[0]));
        console.log("🔑 Campo de cliente en pagos:", 
          Object.keys(pagos[0]).find(key => key.toLowerCase().includes('client')));
      }
    }
    
  } catch (err) {
    console.error("❌ Error inesperado:", err.message);
  }
}

// Ejecuta la verificación
verificarTablas().then(() => {
  console.log("✅ Verificación de tablas completada");
});