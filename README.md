# Vestalia — catálogo editorial escalable

Catálogo móvil y sistema de administración para cafeterías. Puede ejecutarse localmente en Windows o publicarse con GitHub, Vercel, Neon y Vercel Blob.

El sitio, el editor y el PDF parten de una única fuente maestra: `data/catalogo.json`.

## Publicar sin instalar herramientas

La versión cloud se configura íntegramente desde el navegador: no requiere instalar GitHub CLI, Vercel CLI, Git ni Node en el computador del propietario. Consulta [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md) para ver el procedimiento completo.

En Vercel, el catálogo público consulta Neon y conserva `data/catalog-data.js` como respaldo. El editor usa una sesión segura de 12 horas, las imágenes nuevas se guardan en Vercel Blob y los PDF se regeneran con Chromium mediante un botón separado. La base de datos y la revisión inicial se crean automáticamente en la primera consulta.

## Empezar

### macOS o Linux

Abre una terminal en esta carpeta y ejecuta:

```bash
./iniciar_catalogo.sh
```

### Windows

Haz doble clic en:

```text
iniciar_catalogo.bat
```

En el primer inicio, el lanzador pedirá permiso para crear `.venv`, un entorno local que mantiene las dependencias de Vestalia separadas del resto del computador. Si aceptas, instalará los paquetes necesarios y Chromium; este proceso necesita Internet y puede tardar algunos minutos. Los inicios posteriores reutilizan ese entorno sin volver a instalarlo.

La versión de Playwright está limitada al rango validado por Vestalia para evitar que una actualización incompatible cambie el motor PDF durante una instalación nueva. WeasyPrint se conserva como alternativa opcional cuando el sistema ya dispone de sus bibliotecas nativas, pero no es necesario instalarlo en Windows.

Se abrirá el editor en `http://127.0.0.1:8080/editor.html`. Mientras editas, mantén abierta la ventana del servidor. Si el inicio falla, la ventana permanecerá abierta y mostrará el motivo.

Debes tener Python 3 instalado. El lanzador prueba primero `py -3` y luego `python`, por lo que funciona aunque Python esté registrado de una sola de esas formas.

#### Reparar la instalación local

Si una descarga se interrumpe o el lanzador indica que el entorno está incompleto, vuelve a ejecutar `iniciar_catalogo.bat` y acepta la reparación. Para repetir una instalación completamente limpia, elimina únicamente la carpeta `.venv` y abre nuevamente el lanzador. No es necesario eliminar el catálogo ni las imágenes.

## Editar productos

1. Selecciona un producto en la barra lateral.
2. Cambia nombre, categoría, fotografía, formato, precio o descripción.
3. Para una foto nueva, pulsa **Subir una imagen**. El archivo se guardará en `assets/images/`.
4. Pulsa **Aplicar cambios** o **Guardar catálogo**.
5. Abre **Ver catálogo** para revisar el resultado.

También puedes crear, duplicar, eliminar, buscar y reordenar productos. `Ctrl+S` o `Cmd+S` guarda el catálogo.

Sobre el formulario de producto hay dos administradores adicionales:

- **Categorías**: crea, elimina y reordena familias; edita su nombre, nombre corto, descripción y el color hexadecimal del borde superior del PDF.
- **Contenido general**: edita portada, índice, destacados comerciales, tabla de precios, preguntas de servicio, conservación, datos de contacto y WhatsApp.

El índice de ambos PDF se numera automáticamente y cada categoría queda hipervinculada a su primera página. Cada página de índice admite hasta 10 categorías; la página siguiente se crea desde la undécima. Las categorías nuevas aparecen de inmediato aunque todavía no tengan productos; en ese caso reciben una página de presentación con su nombre, descripción y color. Si aumentan las categorías, los productos, los precios o las preguntas, el generador agrega las páginas necesarias.

El botón **Descargar respaldo** genera un JSON fechado. **Importar** permite recuperar uno de esos respaldos.

## Fuente única y sincronización

- `data/catalogo.json`: base maestra y editable.
- `data/catalog-data.js`: fallback generado automáticamente para abrir el sitio sin servidor.
- `sync_catalogo.py`: valida IDs, categorías y campos obligatorios, y regenera el fallback.
- `servidor.py`: guarda cambios e imágenes directamente desde el editor.
- `build_print_static.py`: construye la versión de impresión desde el JSON maestro.

El precio de una ficha y la tabla comercial son campos explícitos e independientes. Esto permite mostrar un valor individual en el producto y, si corresponde, otro formato agrupado en la tabla sin que uno sobrescriba silenciosamente al otro.

No edites `data/catalog-data.js` manualmente. Si cambias el JSON con un editor de texto, sincroniza con:

```bash
python3 sync_catalogo.py
```

Al guardar desde `editor.html`, el servidor valida el conjunto completo, actualiza `data/catalog-data.js` y vuelve a generar las dos ediciones: `Vestalia_Catalogo_Cafeterias.pdf` y `Vestalia_Catalogo_Movil.pdf`. Si algo falla, conserva los archivos anteriores para evitar versiones mezcladas. El mismo proceso ocurre al iniciar `servidor.py`.

## Abrir solo para consulta

`index.html` se puede abrir directamente, sin servidor. En ese modo funcionan el catálogo, los filtros y la búsqueda. Para guardar desde el editor o subir imágenes debes usar `iniciar_catalogo`.

## Generar el PDF

Instala las dependencias una vez:

```bash
python3 -m pip install -r requirements.txt
```

Genera el PDF:

```bash
python3 generar_pdf.py
```

La salida es `Vestalia_Catalogo_Cafeterias.pdf`. Antes de generarla, el script reconstruye desde `data/catalogo.json` una edición A4 dinámica: portada, índice hipervinculado, fichas de producto, condiciones comerciales y cierre de contacto. Con los datos actuales son 18 páginas; el total se adapta al contenido. La composición conserva ingredientes, formatos, precios y transparencia real en los recortes de producto.

Para generar únicamente la edición para celular:

```bash
python3 generar_pdf_movil.py
```

La salida es `Vestalia_Catalogo_Movil.pdf`, en proporción vertical 9:16. Tiene una ficha por producto, texto ampliado para pantalla, índice hipervinculado, botones de consulta por WhatsApp y páginas comerciales adaptadas. Con los datos actuales son 32 páginas. Ambos PDF se regeneran automáticamente al guardar desde el editor.

## Archivos principales

- `index.html`, `styles.css`, `app.js`: catálogo público adaptable a móvil y escritorio.
- `editor.html`, `editor.css`, `editor.js`: administrador visual local.
- `data/catalogo.json`: contenidos, categorías, precios, FAQ y contacto.
- `assets/images/`: fotografías de productos.
- `assets/thumbs/`: miniaturas optimizadas usadas por las tarjetas móviles.
- `assets/print/`: fotografías y composiciones optimizadas para el PDF.
- `assets/print-transparent/`: recortes PNG que conservan transparencia y corrigen el halo del borde.
- `assets/brand/`: logotipo, isotipo y sello.
- `assets/fonts/`: Cormorant Garamond e Inter alojadas localmente.
- `print.html`, `print.css`, `print-static.html`: edición editorial A4.
- `mobile-print.css`, `mobile-print-static.html`: edición 9:16 para teléfonos.
- `generar_pdf.py`, `generar_pdf_movil.py`: generadores de los dos PDF.
- `servidor.py`: servidor y API local de guardado.
- `miniaturas.py`: genera automáticamente las versiones livianas de cada fotografía.

## Estructura de un producto

```json
{
  "id": "tradicional-limon-amapola",
  "category": "tradicionales",
  "name": "Limón amapola",
  "eyebrow": "Galleta tradicional",
  "image": "assets/images/tradicional-limon-amapola.webp",
  "imageMode": "contain",
  "imagePosition": "center center",
  "weight": "93 g aprox.",
  "format": "Unidad",
  "price": "$1.366 + IVA",
  "tags": ["Cítrica", "Centro de vainilla"],
  "detailsLabel": "Ingredientes y composición",
  "ingredients": "...",
  "insert": "..."
}
```

`imageMode` admite `contain` para productos recortados y `cover` para fotografías completas. `imagePosition` ajusta el foco, por ejemplo `center 60%`.

## Identidad aplicada

- Cormorant Garamond para títulos; Inter para textos y controles.
- Azul Vestalia `#B6D2EF` y Azul Marino `#11334A` como colores principales.
- Crema, salvia, arena y rosa para separar familias sin perder sobriedad.
- Composición amplia, fondos claros, ornamentos discretos y fotografía protagonista.
- Navegación móvil con filtros horizontales, fichas resumidas y detalle modal.

## Revisión antes de publicar

El catálogo original no especifica el gramaje de Pistacho premium ni aclara si los 120 g de Ferrero Rocher incluyen el bombón. Los nueve productos incorporados en la propuesta ampliada usan descripciones comerciales y precio “A cotizar”; conviene completar ingredientes, formato, gramaje y alérgenos antes de considerarlos fichas técnicas.

Por tratarse de alimentos, confirma especialmente gluten/trigo, leche, huevo, soja, maní, nueces, almendras, pistacho y avellana, además de posibles trazas y contaminación cruzada.
