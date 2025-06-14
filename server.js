require("dotenv").config();
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

console.log("Archivos en ./routes:", fs.readdirSync("./routes"));

// Importar rutas
const clientesRoutes = require("./routes/clientes");
const trabajosRoutes = require("./routes/trabajos");
const pagosRoutes = require("./routes/pagos");
const materialesRoutes = require("./routes/materiales");
const evolucionRoutes = require("./routes/evolucion");
const deudaRealRoutes = require("./routes/deudaReal");
const asignacionesRoutes = require("./routes/asignaciones");
const deudaRoutes = require("./routes/deuda");

const app = express();
const PORT = process.env.PORT || 3001;

// Orígenes permitidos (producción + builds temporales de Vercel)
const allowedOrigins = [
  "https://mi-app-finanzas-frontend.vercel.app",
  /^https:\/\/mi-app-finanzas-frontend-git-.*\.vercel\.app$/,
];

// Middleware CORS dinámico
app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.some((o) =>
          typeof o === "string" ? o === origin : o.test(origin)
        )
      ) {
        callback(null, true);
      } else {
        callback(new Error("No permitido por CORS"));
      }
    },
  })
);

// Otros middlewares
app.use(bodyParser.json());
app.use(express.json());

// Registrar rutas con prefijos claros
app.use("/api/clientes", clientesRoutes);
app.use("/api/trabajos", trabajosRoutes);
app.use("/api/pagos", pagosRoutes);
app.use("/api/materiales", materialesRoutes);
app.use("/api/evolucion", evolucionRoutes);
app.use("/api/deuda-real", deudaRealRoutes);
app.use("/api/asignaciones", asignacionesRoutes);
app.use("/api/deuda", deudaRoutes);

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});
