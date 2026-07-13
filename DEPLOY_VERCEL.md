# Publicar Vestalia en Vercel sin instalar nada

Este procedimiento se hace completamente en el navegador. No instales GitHub CLI, Vercel CLI, Git ni Node para publicar el sitio.

## Lo que ya queda preparado en el repositorio

- Sitio público con respaldo local si la API no responde.
- Editor protegido por contraseña y cookie segura de 12 horas.
- Catálogo versionado en Neon con control de conflictos entre pestañas.
- Historial de las últimas 50 revisiones.
- Bloqueo temporal después de cinco contraseñas incorrectas.
- Imágenes convertidas a WebP en el navegador antes de subirlas.
- PDF A4 y móvil guardados en Vercel Blob.
- Inicialización automática de tablas y catálogo al conectar la base.
- Pruebas automáticas en GitHub Actions.

## 1. Importar el repositorio

1. Entra a [Vercel](https://vercel.com/new) con la cuenta `falobo`.
2. Pulsa **Add New → Project**.
3. En **Import Git Repository**, conecta GitHub si Vercel lo solicita.
4. Autoriza únicamente el repositorio `falobo92/catalogo_vestalia` o todos los repositorios, según prefieras.
5. Selecciona `catalogo_vestalia` y pulsa **Import**.
6. Usa estos valores:
   - Project Name: `catalogo-vestalia`
   - Framework Preset: `Other`
   - Root Directory: `./`
   - Build Command y Output Directory: déjalos vacíos.
7. Pulsa **Deploy**.

El primer despliegue permite abrir el catálogo y los PDF incluidos. El editor todavía no permitirá iniciar sesión hasta completar las claves y el almacenamiento.

## 2. Crear Neon Postgres

1. Dentro del proyecto, abre **Storage**.
2. Pulsa **Create Database** y elige **Neon**.
3. Selecciona **Create New Neon Account** y acepta los términos.
4. Elige el plan gratuito y la región de São Paulo/South America si está disponible.
5. Conecta el recurso a **Production**, **Preview** y **Development**.
6. Comprueba en **Settings → Environment Variables** que aparece `DATABASE_URL`, `POSTGRES_URL` o `NEON_DATABASE_URL`.

No necesitas ejecutar migraciones: al abrir `/api/catalogo`, Vestalia crea las tablas y carga los 27 productos automáticamente.

## 3. Crear Vercel Blob

1. Vuelve a **Storage → Create Database**.
2. Elige **Blob** y pulsa **Continue**.
3. Selecciona acceso **Public**. Las imágenes y los PDF son contenidos públicos del catálogo.
4. Usa el nombre `vestalia-assets` y la región más cercana a Chile disponible.
5. Conéctalo a **Production**, **Preview** y **Development**.
6. Comprueba que el recurso aparece conectado al proyecto. Las conexiones nuevas usan OIDC automáticamente y no necesitan un `BLOB_READ_WRITE_TOKEN` permanente.

Vestalia utiliza `@vercel/blob` con la identidad OIDC que Vercel entrega a cada función. `BLOB_READ_WRITE_TOKEN` solo es opcional para herramientas locales o conexiones antiguas.

## 4. Crear las claves desde el navegador

1. Abre `https://TU-SITIO.vercel.app/setup.html`.
2. Escribe una contraseña fuerte de al menos 12 caracteres. No la compartas ni la guardes en GitHub.
3. Pulsa **Generar valores**.
4. En Vercel, abre **Settings → Environment Variables**.
5. Añade `ADMIN_PASSWORD_HASH` y pega el hash generado.
6. Añade `SESSION_SECRET` y pega el segundo valor generado.
7. Marca ambos valores para **Production**, **Preview** y **Development**.
8. Guarda y abre **Deployments**. En el último despliegue, pulsa **Redeploy**.

La página genera ambos valores localmente mediante la criptografía del navegador; la contraseña no se envía al servidor.

## 5. Primera comprobación

1. Abre la URL `vercel.app` y comprueba portada, filtros, 27 productos y 9 categorías.
2. Abre `/editor.html`. Debe enviarte a `/login.html`.
3. Entra con la contraseña elegida.
4. Comprueba que aparece **Nube conectada** y la revisión 1.
5. Pulsa **Regenerar PDF**. La primera ejecución puede tardar porque descarga Chromium; las siguientes suelen ser más rápidas.
6. Abre los enlaces A4 y móvil desde el editor.
7. Cambia un texto, guarda y comprueba que la revisión aumenta y los PDF quedan marcados como pendientes.
8. Regenera los PDF y confirma que ambos pasan a la nueva revisión.

## Chromium

Por defecto se utiliza el paquete x64 oficial de Chromium v149 publicado por Sparticuz. `CHROMIUM_PACK_URL` es opcional. Si más adelante alojas ese archivo en tu Blob Store para acelerar arranques en frío, añade su URL pública con ese nombre y vuelve a desplegar.

## Recuperación y respaldo

- **Respaldo manual:** en el editor pulsa **Descargar respaldo**.
- **Recuperar catálogo:** pulsa **Importar**, selecciona el JSON y guarda.
- **Contraseña olvidada:** abre `/setup.html`, genera un hash nuevo, reemplaza `ADMIN_PASSWORD_HASH` en Vercel y vuelve a desplegar.
- **Sesiones comprometidas:** genera un `SESSION_SECRET` nuevo y vuelve a desplegar; todas las sesiones anteriores quedan invalidadas.
- **Despliegue defectuoso:** en **Deployments**, abre una versión anterior y usa **Promote to Production** o corrige el repositorio y vuelve a desplegar.

## Costes

Hobby sirve para la evaluación técnica y personal. Antes de utilizar Vestalia comercialmente, revisa los límites vigentes y cambia el proyecto a Vercel Pro. Neon y Blob también tienen cuotas propias que deben vigilarse.
