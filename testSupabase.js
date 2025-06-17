// Script para probar la conexión con Supabase
require("dotenv").config();
const supabase = require("./supabaseClient");

async function testSupabaseConnection() {
  console.log("🔍 Probando conexión con Supabase...");
  
  try {
    // Intenta hacer una consulta simple
    const { data, error } = await supabase
      .from("clientes")
      .select("id, nombre")
      .limit(1);
    
    if (error) {
      console.error("❌ Error al conectar con Supabase:", error.message);
      return false;
    }
    
    console.log("✅ Conexión exitosa con Supabase");
    console.log("📊 Datos de prueba:", data);
    return true;
  } catch (err) {
    console.error("❌ Error inesperado:", err.message);
    return false;
  }
}

// Ejecuta la prueba
testSupabaseConnection().then(success => {
  if (!success) {
    console.log("⚠️ Verifica tus credenciales de Supabase en el archivo .env");
    process.exit(1);
  }
  
  console.log("🚀 Todo listo para usar Supabase");
});