# Nexo Digital Pro — notas del entorno

El código fuente actual implementa una API de datos de mercado y señales indicativas; no implementa todavía el producto Nexo Digital Pro de punta a punta. La guía operativa y el mapa de arquitectura están en `README.md`.

Para desarrollo en este entorno, se inicia la API con `pnpm run dev` (puerto 5000 por defecto). El paquete `artifacts/mockup-sandbox` es una galería de componentes de desarrollo, no el frontend funcional del producto.

No se debe ejecutar `lib/db` ni configurar `DATABASE_URL` como requisito de la API: es un scaffolding sin esquema, migraciones ni consumidor activo.
