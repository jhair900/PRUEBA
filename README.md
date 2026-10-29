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
- `setupUsers` no se puede ejecutar por web. `crearUsuariosAhora_()` es una operación manual del editor que solo agrega usuarios faltantes y nunca restablece los existentes.
- En una instalación nueva, el propietario configura `INITIAL_ADMIN_PASSWORD` (mínimo 12 caracteres) en Script Properties antes de ejecutar `crearUsuariosAhora_()`. Esa clave permite entrar como el administrador inicial JSANCHEZ; la propiedad se elimina al terminar. Los demás usuarios reciben claves aleatorias y el administrador debe asignarles claves temporales desde la aplicación. En una instalación existente no es necesario ejecutar esta inicialización.
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


## Conexion directa — 15 de septiembre de 2026

Este cambio sustituye para las operaciones del sitio la llamada `fetch` al Content Service por un canal HTML Service reutilizable (`google.script.run`). La pagina carga una vez un iframe sin interfaz, verifica origen, canal aleatorio y ventana emisora, y conserva la conexion para login, consultas, guardados y Gemini. Las sesiones y permisos siguen comprobándose en el servidor; no se incluyen credenciales en URLs. El canal solo admite el origen de GitHub configurado y desarrollo local.

### Publicacion obligatoria en este orden

1. Pegar TODO `gas/script.gs` y publicar una Nueva version del despliegue existente. Incluye `autocorRpc`, `bridgePage_` y `bridgeRuntime_`; no se necesita crear archivos HTML en Apps Script.
2. Publicar TODOS los HTML y la carpeta `js/`, incluido el NUEVO `js/apps-script-transport.js`. Las paginas usan la version `20260915-directo-1` del cliente.
3. Recargar con Ctrl+F5 e iniciar sesion. La primera carga abre el canal; las solicitudes siguientes lo reutilizan.

Si el canal no se establece en 12 segundos, la operacion indica que no se pudo abrir la conexion directa y no encadena automaticamente la ruta HTTP lenta. Reintentar permite abrir un canal nuevo. Si una solicitud ya fue enviada, nunca se cambia a HTTP como consecuencia de un error; los reintentos de guardado conservan el identificador existente. Una consulta fallida ahora muestra un mensaje de consulta, no una advertencia sobre guardados.

El campo `details[].transport` del diagnostico debe indicar `google.script.run`. Este cambio evita la redireccion Content Service por cada consulta; no elimina la dependencia de disponibilidad, red y cuotas de Google. Las pruebas locales simulan el canal y verifican permisos y serializacion; es imprescindible verificar la integracion real despues de desplegar. La funcion manual de inicializacion se llama ahora `crearUsuariosAhora_` para no exponerla por RPC; sigue disponible desde el editor.


### Correccion del arranque del canal

La version `20260915-respaldo-1` de `apps-script-transport.js` elimina el bloqueo obligatorio por falta de canal. Espera como maximo 1,5 segundos para aprovechar el canal que se precarga; si no esta listo, devuelve el control al transporte HTTP. Un canal fallido no se vuelve a abrir continuamente durante 60 segundos. El respaldo solo ocurre antes de enviar la operacion: una solicitud ya enviada por RPC no se repite automaticamente por HTTP. Esta correccion necesita publicar los HTML y `js/apps-script-transport.js`; no requiere otra implementacion de Apps Script. El respaldo evita la nueva interrupcion, pero no garantiza resolver la latencia previa del transporte HTTP.

## Extracción y validación de Contratos — 17 de septiembre de 2026

Publicar juntos `contratos.html` y el nuevo `js/document-extraction.js` (versión `20260917-criterios-1`), manteniendo la carpeta `js`. Este cambio se aplica sobre los archivos actuales del sitio y no requiere actualizar Apps Script. Después, recargar Contratos con Ctrl+F5. El paquete `entrega/AUTOCOR-contratos-IA-20260917.zip` contiene estos dos archivos.

- RUC, cédula, matrícula, notaría y papeleta intentan primero IA. El OCR completa campos faltantes o dudosos y respalda fallos de IA. CUV mantiene su lector/parser local, sin IA.
- Los criterios y el esquema de respuesta se comparten en `document-extraction.js`: separan contribuyente y representante, propietario y partes del último contrato, identificación y teléfono, chasis y motor, y fechas según su etiqueta. Las respuestas incompletas o con tipos incorrectos no se aceptan como resultados confirmados.
- Los nombres cortos/compuestos ya no se descartan por contener fragmentos como NAN. Los propietarios admiten razones sociales y RUC de 13 dígitos. No se reparten nombres por cantidad de palabras ni se cambian letras de códigos alfanuméricos a números.
- Frente y reverso se envían juntos como imágenes separadas. Los PDF de hasta seis páginas se envían completos, en orden; si superan ese límite, se avisa antes de procesar para seleccionar las páginas relevantes. El respaldo OCR de PDF escaneado también cubre hasta seis páginas.
- Papeleta incorpora respaldo OCR y campos editables, incluido el nombre completo cuando no hay separación de apellidos/nombres. Se extrae la fecha realmente impresa. La regla comercial existente de fecha esperada permanece separada y ya no sustituye el valor leído por una fecha sugerida fija.
- Una lectura marcada para revisión conserva ese estado en las comparaciones, aunque otros documentos tengan el mismo valor. Nombres parciales y modelos que difieren en un dígito ya no aparecen como coincidencias completas.

Pruebas sin dependencias adicionales:

```powershell
node tests/regression.cjs
node tests/document-extraction.cjs
node tests/contract-normalization.cjs
node tests/contract-pipeline.cjs
node tests/cedula-ocr.cjs
node tests/matricula-ocr.cjs
```

Estas pruebas usan documentos sintéticos y respuestas de IA simuladas. La exactitud con fotografías reales, plantillas específicas y el servicio Gemini debe comprobarse con los documentos del usuario después de publicar; no se midió una tasa de acierto real ni una mejora de latencia en producción.

## Extracción documental automática con Gemini — selección vigente al 26 de octubre de 2026

Contratos mantiene sus apartados y controles habituales. Matrícula usa frontal y reverso; no se añade una carga de PDF/imagen, un selector de modelo, un comprobador manual ni una modalidad de edición nueva. Los campos conservan su edición existente. El CUV conserva su carga y extracción local de PDF, sin Gemini.

El procesamiento documental usa Gemini, sin descargas, workers ni respaldo Tesseract. Al cargar la página, el sistema comprueba una generación sintética con imagen y el esquema de extracción por el mismo proxy autenticado antes de habilitar los documentos. Los únicos candidatos son `gemini-3.5-flash-lite` y `gemini-3.1-flash-lite`, en ese orden. Prueba el segundo si el primero no puede procesar durante esa única ronda inicial. Si ninguno responde correctamente, avisa y mantiene bloqueada la incorporación de documentos que requieren IA; el CUV continúa funcionando localmente.

El modelo elegido se conserva durante toda esa carga de la página, sin caducidad, comprobaciones periódicas ni consultas previas a cada documento. Cargar archivos, validar, corregir campos, abrir respaldos o volver a la pestaña no inicia otra selección. Los errores posteriores mantienen el modelo: los reintentos acotados usan la misma solicitud y el mismo modelo, respetando las esperas del servicio y el plazo acumulado. No se comprueba ni usa otro modelo durante la recuperación. Una nueva carga de la página permite otra selección inicial. Los cambios de sesión cancelan respuestas anteriores sin cambiar el modelo elegido. No hay controles ni pasos nuevos; el botón y el panel existentes de Tiempos están disponibles para todos los usuarios con sesión, con las mismas mediciones y sin cambiar otros permisos.

Los límites de recuperación son independientes por documento. Un fallo técnico aislado conserva lo leído y permite intentar los documentos siguientes; no se presenta como ausencia o ilegibilidad de todos los campos. Los impedimentos comunes (sesión, cuota, modelo no disponible o espera del servicio que no cabe en el plazo) sí pueden detener el lote y se distinguen de un documento aún no intentado. El reintento sólo procesa los documentos incompletos, sin repetir los completados. Se utiliza el límite individual ya definido de 30 segundos dentro de los 45 segundos acumulados de IA, sin aumentar los tres intentos máximos. La clave de solicitudes simultáneas conserva todos los criterios y la identidad exacta de las imágenes sin serializar nuevamente sus megabytes de base64; el cuerpo enviado, la resolución y los criterios de extracción permanecen iguales.

Se mantienen cancelación, protección contra respuestas tardías, archivos retenidos y ediciones manuales, incluidos vacíos intencionales. Las contradicciones continúan pendientes de revisión. Los PDF de los apartados que ya los admitían conservan su texto nativo y preparación existentes.

Esta corrección no modifica `gas/script.gs` ni necesita un nuevo despliegue de Apps Script: conserva el mismo proxy autenticado y sus parámetros. La restricción se aplica antes del envío tanto HTTP como RPC desde todas las rutas de selección y recuperación de la aplicación. No se ha desplegado ni publicado nada. La clave Gemini permanece en Script Properties.

Comprobaciones locales afectadas: `tests/gemini-availability.cjs`, `tests/processing-browser.cjs`, `tests/contract-pipeline.cjs`, `tests/ocr-contradictions.cjs`, `tests/processing-control.cjs` y `tests/document-reading-quality.cjs`. Son simulaciones locales; no miden disponibilidad ni latencia actuales de la cuenta real. Las pruebas con documentos reales siguen detenidas por indicación del usuario. Los nombres heredados de algunos parsers incluyen OCR, pero no ejecutan reconocimiento.

Preparar una versión revisable con `python tools/prepare-release.py`. El ZIP no publica ni despliega por sí solo. Los HTML, `version.json` y recursos JS deben corresponder a la misma versión.

## Sesión y recuperación en la misma página — 27 de octubre de 2026

Esta entrega sí modifica `gas/script.gs`. Para probarla con el servicio real es necesaria una Nueva versión del backend completo: añade `validateSession`, `logout`, fecha efectiva de vencimiento y origen/código explícitos para los rechazos de sesión del proxy Gemini. No cambia la URL ni la clave de Gemini. Se entrega sin publicar ni desplegar.

`js/session.js` comparte una única comprobación inicial de sesión por página, reutiliza su resultado y recibe la renovación deslizante en las respuestas existentes. No hay sondeos periódicos ni una petición adicional de autenticación antes de cada documento. El límite conocido se controla localmente; una revocación externa al navegador se reconoce en la siguiente solicitud autenticada. Un fallo de conexión deja la sesión sin comprobar; un rechazo de credenciales del proveedor no cierra la sesión AUTOCOR.

Las páginas abren el formulario de acceso existente en la misma pantalla. La reautenticación conserva archivos, imágenes, datos, correcciones y vacíos manuales, borradores y archivos pendientes de Drive. No repite automáticamente lecturas, guardados ni contratos. Tras ingresar con la cuenta original se puede continuar con las acciones existentes; sólo se reintentan documentos incompletos. Si se ingresa con otra cuenta, el trabajo anterior queda bloqueado y oculto hasta volver a su cuenta original, para impedir mezclar datos. Las respuestas de otra generación de sesión se descartan, también durante un guardado. Un guardado ya enviado cuya respuesta se perdió requiere verificar la placa antes de repetirlo.

La selección fija de Gemini se conserva: únicamente los dos modelos autorizados, una selección inicial y ningún cambio de modelo al reautenticar. La comprobación inicial interrumpida por autenticación puede terminar después de ingresar; una selección ya completada no se repite. CUV permanece local y no se ejecuta Tesseract.

Resultados y límites de las comprobaciones locales en `entrega/sesion-autocor-20261027.md`. Son simulaciones de red/backend y pruebas de navegador; no se enviaron documentos ni credenciales reales y no acreditan el estado del despliegue de producción.

## Presupuesto único del inicio de Gemini — 28 de octubre de 2026

Esta entrega sustituye la recuperación inicial de cuatro envíos y cortes individuales de 10 segundos. Conserva una única ronda posterior a la autenticación, con 45 segundos acumulados. No lanza una alternativa tras un timeout, un fallo de red o un cambio de sesión que deje un envío sin resultado remoto confirmado. Tiempos distingue el corte local de una respuesta completa del backend. La alternativa permitida se intenta solamente tras una respuesta que permita decidir, como 429 o 503, respetando Retry-After y el tiempo restante; hay como máximo un envío por modelo y dos por ronda. Un modelo elegido sigue fijo durante la página, sin comprobaciones periódicas ni selección por documento.

El arranque comparte también la espera de sesión y elimina el temporizador adicional de 50 ms. Un rechazo explícito de sesión anterior al procesamiento permite completar el inicio después de autenticarse; un envío cuyo resultado se desconoce no se repite al cambiar sesión. No se equipara cancelar la espera del navegador con terminar la generación en Apps Script/Gemini.

La comprobación mantiene la misma imagen ficticia legible y el mismo criterio de placa/color con JSON estructurado. Usa un esquema y un texto específicos más breves y 256 tokens máximos de salida en lugar de 2048; los documentos reales conservan sus criterios y presupuestos de salida. No se introducen parámetros de razonamiento cuya compatibilidad no esté comprobada.

El riesgo de solapamiento se reprodujo en loopback con trabajo remoto independiente de la cancelación local; eso no prueba que las ejecuciones concretas de producción se solaparan. No se atribuyen los 503 con mensaje de alta demanda a autenticación ni cuota. Al documentar esta entrega el 28/10 todavía no se había actualizado Apps Script ni publicado el frontend. La comprobación real se realizó una sola vez en el navegador integrado, con autenticación del usuario y sin documentos personales. Los resultados y sus límites se documentan en `entrega/presupuesto-inicio-ia-20261028.md`.

La única ronda real de la versión `20261028T153157569058Z` seleccionó Gemini 3.5 Flash Lite en un envío y 22,37 s; 20,59 s correspondieron al trayecto backend–Gemini y respuesta. No se intentó el segundo modelo ni se procesaron documentos personales. Es el resultado de esa ronda, no una garantía de latencia futura.

## Recorrido y trabajo redundante de IA — 28 de octubre de 2026

Versión preparada para revisión el 28/10: `20261028T161839136537Z` (a esa fecha aún sin publicar ni desplegar). El proxy RPC evita convertir repetidamente los objetos de entrada/salida a JSON; para la misma solicitud, pasa de cuatro serializaciones/cuatro análisis explícitos a uno de cada uno. HTTP conserva su formato y ambas rutas ejecutan la misma comprobación de sesión. Los criterios completos de extracción permanecen en las descripciones del esquema, retirando únicamente su copia duplicada en el prompt. No cambia la resolución, los campos, los límites, los modelos ni la selección fija.

El panel existente de Tiempos distingue sesión, preparación, llamada `UrlFetchApp.fetch`, lectura/análisis de respuesta y validación local. Los totales contienen las subetapas y no se suman entre sí. Se conservan las métricas antiguas para compatibilidad y se muestran sólo contadores/metadatos, sin datos documentales ni credenciales. Los 20,59 s reales anteriores también incluían interpretar el JSON remoto: no se atribuyen íntegramente a inferencia ni a un fallo de AUTOCOR.

Esta versión **requiere actualizar el backend completo `gas/script.gs` con una Nueva versión de la implementación existente** para activar la optimización RPC y el desglose nuevo. El frontend funciona con el backend anterior sin inventar las mediciones ausentes. No cambia la URL ni la clave. Al cierre del informe del 28/10 aún no se habían hecho nuevas consultas reales ni recargado la pestaña del usuario; las mejoras medidas entonces eran locales/sintéticas. Informe y resultados: `entrega/recorrido-ia-20261028.md` y `entrega/recorrido-ia-local-20261028.json`.

## Verificación HTTP posterior — 29 de octubre de 2026

Se completó una sola comprobación real por HTTP con Gemini 3.5 Flash Lite, usando únicamente la imagen sintética. Fue correcta, con 35,727 s totales: `UrlFetchApp.fetch` ocupó 33,991 s. Esto confirma el desglose del proxy, pero no una reducción de latencia; la comparación con 22,37 s anteriores usa otro canal y otras condiciones. Gemini 3.6 Flash y 3.8 Flash se probaron una vez cada uno y respondieron 503 por alta demanda; no se agregaron a producción. No se procesaron documentos personales. Detalle: `entrega/comprobacion-http-real-20261029.md` y `entrega/comparacion-candidatos-http-20261029.md`.
