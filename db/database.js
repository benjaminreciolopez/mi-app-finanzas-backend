const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const db = new sqlite3.Database(
  path.resolve(__dirname, "finanzas.db"),
  (err) => {
    if (err) {
      console.error("❌ Error al conectar con la base de datos:", err.message);
    } else {
      console.log("✅ Base de datos SQLite conectada.");
    }
  }
);

// Crear tablas si no existen
db.serialize(() => {
  // Tabla de Clientes
  db.run(`
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      precioHora REAL NOT NULL
    )
  `);

  // Tabla de Trabajos
  db.run(`
    CREATE TABLE IF NOT EXISTS trabajos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT,
      fecha TEXT,
      horas REAL,
      pagado INTEGER DEFAULT 0
    )
  `);

  // Tabla de Pagos
  db.run(`
    CREATE TABLE IF NOT EXISTS pagos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT,
      cantidad REAL,
      fecha TEXT
    )
  `);

  // Tabla de Materiales
  db.run(`
    CREATE TABLE IF NOT EXISTS materiales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      descripcion TEXT,
      coste REAL,
      nombre TEXT,
      fecha TEXT,
      pagado INTEGER DEFAULT 0
    )
  `);

  // Tabla de Resumen Mensual
  db.run(`
  CREATE TABLE IF NOT EXISTS resumen_mensual (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    año INTEGER,
    mes INTEGER,
    total REAL
  )
  `);
});

module.exports = db;
