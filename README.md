# AUTOCOR — Sistema de Gestión Documental

Aplicación web (HTML/JS estática) + backend Google Apps Script para gestionar
liquidaciones, pagos, ventas y contratos de vehículos.

---

## 📁 Estructura del proyecto

```
PRUEBAS AUTOCOR/
│
├── index.html                  ← Login / portal principal
├── liquidacion.html            ← Módulo de liquidaciones
├── pagos.html                  ← Módulo de pagos
├── ventas.html                 ← Módulo de ventas
├── contratos.html              ← Módulo de contratos (validación + generación Word)
│
├── assets/                     ← Imágenes estáticas
│   ├── logo.png
│   └── fondo.png
│
├── js/                         ← JavaScript usado por contratos.html
│   ├── cuv-parser.js           ← Parser del PDF CUV
│   ├── generador-contratos.js  ← Genera los .docx con docxtemplater + PizZip
│   └── contrato-templates.js   ← Plantillas Word embebidas en base64
│
├── gas/                        ← Backend Google Apps Script
│   └── script.gs               ← Pegar en el editor de Apps Script y publicar
│
├── templates/                  ← Plantillas Word fuente (.docx)
│   ├── encargo-soltero.docx
│   ├── encargo-casado.docx
│   ├── prestacion-soltero.docx
│   └── prestacion-casado.docx
│
└── tools/                      ← Scripts auxiliares (uso ocasional)
    ├── prepare_dilileg_templates.py ← Prepara los cuatro formatos Dilileg
    ├── use_qa_samples_as_templates.py ← Usa las muestras aprobadas como base visual
    └── encode_templates.py     ← Regenera js/contrato-templates.js desde templates/*.docx
```

---

## 🧩 Módulos

| HTML | Función |
|------|---------|
| `index.html` | Login. Guarda sesión en `localStorage.autocor_auth` |
| `liquidacion.html` | Procesa imágenes y datos de liquidaciones, genera PDF |
| `pagos.html` | Registro y seguimiento de pagos |
| `ventas.html` | Gestión de ventas |
| `contratos.html` | Extrae datos de cédula, matrícula, CUV y notaría; valida cruzadamente y genera contratos Word + guarda en hoja |

---

## 🔌 Backend (Google Apps Script)

Todo el backend está en `gas/script.gs`. Despliegue:

1. Abrir Google Apps Script vinculado a la hoja de cálculo
2. Pegar el contenido completo de `gas/script.gs`
3. Desplegar como **Web App** (ejecutar como tú, acceso para cualquiera)
4. Copiar el URL `https://script.google.com/macros/s/.../exec`
5. Configurar ese URL una sola vez en `js/api-config.js` (`apiUrl`).

### Hojas que se crean automáticamente
- `Liquidaciones` · `Pagos` · `Ventas` · `Contratos` · `Usuarios` · `Glosario`

### Acciones disponibles
- **Auth**: `login`, `changePassword`, `adminResetPassword`, `listUsers` (administración autenticada; inicialización solo desde el editor)
- **Liquidaciones**: `save`, `getByPlaca`, `list`, `delete`
- **Pagos**: `savePago`, `getPagoByPlaca`, `listPagos`, `deletePago`
- **Ventas**: `saveVenta`, `getVentaByPlaca`, `listVentas`, `deleteVenta`
- **Contratos**: `saveContrato`, `getContratoByPlaca`, `listContratos`, `deleteContrato`
- **Glosario**: `listGlossary`, `saveGlossaryTerm`, `deleteGlossaryTerm`, `resetGlossary`

---

## 🛠️ Mantenimiento de plantillas Word

Si necesitas actualizar los formatos visuales aprobados:

1. Reemplazar los cuatro archivos `MUESTRA_*.docx` dentro de `.qa-contracts/`, conservando sus nombres.
2. Ejecutar desde la raíz del proyecto:
   ```
   python tools/use_qa_samples_as_templates.py
   python tools/encode_templates.py
   ```
3. Eso conserva el formato de las muestras, prepara los campos automáticos y regenera `js/contrato-templates.js`.

---

## ▶️ Ejecución local

No requiere servidor — abre `index.html` con doble clic.
(Los archivos JS y assets se cargan por rutas relativas.)


## Correcciones de seguridad y concurrencia — 10 de septiembre de 2026

### Aplicar esta versión

1. Copiar **todo** `gas/script.gs` al proyecto de Apps Script existente.
2. En Gestionar implementaciones, editar el despliegue existente y elegir **Nueva versión**. Mantener la misma URL `/exec`.
3. Publicar juntos los HTML y la carpeta `js/` actualizados, incluido `js/gemini-client.js`. Cerrar las pestañas antiguas y volver a abrir la aplicación.
4. Comprobar con una cuenta normal y una administradora: login, búsqueda y actualización en los cuatro módulos, administración de usuarios, extracción con IA y expediente Drive.

Los cuatro modulos permiten reprocesar y sobrescribir una placa existente sin comparar versiones ni pedir confirmacion de reemplazo. El ultimo guardado recibido actualiza la misma fila; si la placa no existe, se crea. El bloqueo del servidor protege la busqueda y escritura frente a guardados simultaneos. Los reintentos automaticos de una misma solicitud conservan su identificador.

Para quitar el bloqueo en el sitio publicado es indispensable actualizar **todo `gas/script.gs` y desplegar una Nueva version** del Apps Script existente; actualizar solo los HTML no elimina la comprobacion del servidor. Despues publicar los HTML y `js/api-client.js` actualizados.

### Cambios incluidos

- `listUsers` y `adminResetPassword` validan la sesión y el rol del servidor; no confían en `adminUsername`.
- `setupUsers` no se puede ejecutar por web. `crearUsuariosAhora()` es una operación manual del editor que solo agrega usuarios faltantes y nunca restablece los existentes.
- En una instalación nueva, el propietario configura `INITIAL_ADMIN_PASSWORD` (mínimo 12 caracteres) en Script Properties antes de ejecutar `crearUsuariosAhora()`. Esa clave permite entrar como el administrador inicial JSANCHEZ; la propiedad se elimina al terminar. Los demás usuarios reciben claves aleatorias y el administrador debe asignarles claves temporales desde la aplicación. En una instalación existente no es necesario ejecutar esta inicialización.
- El proxy de Gemini exige sesión y recibe `{sessionToken, request}` por POST. Solo `request` se reenvía a Gemini. Su cliente está separado en `js/gemini-client.js`.
- Las escrituras pasan por un bloqueo de Apps Script. Los guardados de los cuatro módulos sobrescriben por placa y utilizan un identificador para reconocer reintentos de la misma operación.
- Los cambios de estado y los archivos de Drive se preservan al guardar contratos.
- Las operaciones que no tienen protección contra repetición ya no se reintentan automáticamente. Los errores HTTP y de API se propagan al llamador.
- Se unifica el mínimo de contraseña en seis caracteres y se rechazan fechas de expiración inválidas. Al cambiar la contraseña se cierra la sesión local, porque el servidor invalida el token.
- Se retira de `auth-ui.js` la limpieza heurística que podía eliminar nombres legítimos del formulario.

### Verificación local

Ejecutar `node tests/regression.cjs`. No requiere instalar dependencias. Comprueba sintaxis y regresiones con simulaciones de Apps Script/Sheets y de red; no reemplaza una prueba con el despliegue real, documentos y Drive.

Antes de editar se guardó una copia de los archivos afectados en `.backups/20260910-154821/`. Esa carpeta contiene versiones anteriores inseguras: mantenerla fuera de cualquier publicación web.


## Rendimiento y respuestas lentas — 11 de septiembre de 2026

- Cada guardado valida la sesión y busca/lee el registro una sola vez. La comprobación de reintentos utiliza esa misma lectura.
- Se guarda en caché únicamente la ubicación de la fila de usuario. Login y validación leen los datos actuales: desactivaciones, contraseñas y tokens revocados siguen siendo efectivos. Si la caché falta o la fila cambió, se busca de nuevo.
- La búsqueda de placa admite espacios antiguos mediante TextFinder sin descargar la columna completa cuando una placa no existe.
- Consultas idénticas simultáneas comparten petición; una búsqueda posterior vuelve al servidor. No se mantienen resultados de registros en caché.
- La conversión Word/PDF ya no mantiene ocupado el bloqueo global. La creación de carpetas, reemplazo de archivos y actualización del registro conservan secciones de escritura protegidas.
- Los guardados tienen hasta 60 segundos por intento; login 45 segundos y consultas 30 segundos. El plazo incluye leer la respuesta completa. Esto evita cancelar prematuramente respuestas lentas, pero no reduce por sí solo el tiempo de Google.
- Si se pierde la respuesta de un guardado, se consulta la placa para comprobar el identificador de esa solicitud antes de repetirla. Solo se muestra confirmación si el identificador coincide. Si no se puede confirmar, se conserva el error y el formulario.

Publicar los HTML y `js/api-client.js` (versión `20260911-rapidez-2`) junto con una **Nueva versión de todo `gas/script.gs`** en Apps Script. No hace falta cambiar la URL. Las pruebas locales verifican comportamiento y número de lecturas/búsquedas; los segundos reales de mejora deben medirse después del despliegue con las hojas de producción.


## Cancelaciones de IA — 14 de septiembre de 2026

El cliente de IA usa ahora 60 segundos incluyendo la lectura de la respuesta, distingue cancelacion y tiempo agotado, y rechaza respuestas incompletas. Los errores de transporte no desencadenan una cadena de intentos con otros modelos. Se conserva el cambio de modelo para respuestas HTTP de modelos no disponibles o cuotas agotadas. Publicar `contratos.html` y `js/gemini-client.js` (`20260914-1`) junto con las correcciones pendientes. Esta correccion no garantiza disponibilidad de Gemini ni elimina los limites externos de Google.


## Diagnostico de guardado — 15 de septiembre de 2026

Los reprocesos reutilizan la ubicacion de la fila de la placa y leen su contenido actual. Si se ordena o elimina una fila, se comprueba la placa y se busca de nuevo. No se almacenan datos de formularios en cache. Esto evita la busqueda completa en reprocesos con ubicacion conocida.

Cada respuesta incluye `timing` con espera de bloqueo, procesamiento, flush y tiempo total dentro del servidor. Los mismos tiempos quedan en el registro de ejecuciones de Apps Script. El navegador conserva la ultima medicion en `AutoCorApi.lastTiming` y la muestra en consola como `[AUTOCOR tiempo]`, sin datos del formulario ni tokens. La diferencia entre tiempo total del cliente y servidor puede incluir transporte, arranque del servicio, lectura de respuesta y reintentos; no equivale exclusivamente a tiempo de red. Publicar `gas/script.gs`, los HTML y `js/api-client.js` version `20260915-guardado-1`. Aun falta medir el guardado real de produccion para establecer la causa y mejora en segundos.


### Traza de cada intento de guardado

Publicar los HTML y `js/api-client.js` con version `20260915-traza-1`. Esta ampliacion no requiere modificar Apps Script si ya esta publicada la version con `timing`.

Despues de un guardado lento, ejecutar `JSON.stringify(AutoCorApi.lastSaveTiming)` en la consola. El informe conserva cada intento, HTTP recibido, si hubo redireccion, tiempo hasta recibir cabeceras, tiempo de lectura del cuerpo, etapa del fallo y consultas de confirmacion. No incluye placas, documentos, contraseñas, tokens ni URLs. Las cabeceras agrupan conexion, redirecciones y espera de Google: no separan por si solas esos componentes. Una busqueda posterior no reemplaza el informe del ultimo guardado. Registrar tiempos no acelera la conexion; sirve para decidir la siguiente correccion con evidencia.
