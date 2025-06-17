// backend/supabaseClient.js
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

// Obtener credenciales del archivo .env
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ ERROR: Variables de entorno SUPABASE_URL o SUPABASE_KEY no definidas");
  console.error("Por favor, asegúrate de que el archivo .env contiene estas variables");
  process.exit(1);
}

console.log("✅ Configurando cliente Supabase con URL:", SUPABASE_URL);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

module.exports = supabase;