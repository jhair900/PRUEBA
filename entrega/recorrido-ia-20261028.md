# Demora de IA: recorrido y correcciones comprobadas

Versión para revisión: `20261028T161839136537Z`. Sin publicar ni desplegar. No se hicieron nuevas consultas a Gemini ni se procesaron documentos personales en esta revisión.

## Qué se sabe de la prueba real

La ronda previa de `20261028T153157569058Z` recibió una respuesta válida en **22,37 s**, con **un solo envío**, mediante `google.script.run`. Su `upstreamMs` fue **20,59 s**, aproximadamente el 92 % del total. El resto, **1,78 s**, no es sólo red: incluye sesión/preparación en Apps Script, colas de ejecución, transporte y tratamiento del sobre en el navegador. El login previo tardó unos 2,85 s y es una operación separada; no forma parte de esos 22,37 s.

El temporizador anterior `upstreamMs` empieza antes de `UrlFetchApp.fetch` y termina después de obtener el texto, analizar su JSON y consultar las cabeceras. Por tanto, **no mide exclusivamente generación de Gemini**. Tampoco separa red, cola del proveedor e inferencia. No hay evidencia suficiente para atribuir los 20,59 s a una de ellas ni para asegurar que la nueva corrección los reducirá.

## Causas comprobadas y corrección

1. **Conversiones redundantes en Apps Script/RPC.** El puente recibía el documento como objeto, lo serializaba con el token, el proxy lo analizaba, volvía a serializar la petición, convertía la respuesta a texto y a objeto, y repetía esa última normalización. Ahora HTTP y RPC comparten una función interna que devuelve objetos. HTTP conserva su codificación de entrada/salida; RPC sólo serializa el cuerpo que realmente exige Gemini y analiza la respuesta del proveedor. Las otras acciones conservan su normalización de fechas original. Se mantiene la misma autenticación en el backend, sin caché ni omisión de controles.

2. **Criterios documentales enviados por duplicado.** Cada descripción figuraba íntegra tanto en el prompt como en `responseSchema.properties`. Se conserva una copia íntegra en el esquema, las reglas generales y específicas, los campos, el orden y contenido de los adjuntos, la resolución y los presupuestos de respuesta. No se cambian modelos, razonamiento ni criterios de lectura. La comprobación ficticia inicial ya era independiente y ligera; no se volvió a modificar.

3. **Mediciones con alcance confuso.** La antigua etiqueta de «solicitud y respuesta completas» utilizaba `headersMs`, que en HTTP aún no incluye leer el cuerpo. Ahora se distingue hasta cabeceras/respuesta RPC de recepción completa. El panel existente advierte que un total contiene sus subetapas. Se añaden sólo metadatos numéricos, sin credenciales, texto, imágenes ni identificadores documentales.

No se encontraron consultas nuevas de disponibilidad por documento ni esperas fijas antes de cada lectura en las rutas revisadas. La selección comparte la ronda inicial después de sesión confirmada; la sesión ya confirmada se reutiliza en el cliente y cada petición sigue validándose en el servidor. La recuperación sólo espera cuando corresponde a un error/reintento limitado. El lote conserva los documentos completados y las correcciones.

## Cómo interpretar los tiempos nuevos

| Medición | Alcance y relación |
| --- | --- |
| Login / validateSession | Operaciones de autenticación separadas. No sumarlas otra vez a sus tiempos de servidor. |
| Preparación de archivo/PDF/imagen | Lectura local, texto nativo, preparación visual y recorte sin pérdida existente. El total documental ya las contiene; la preparación PDF puede contener el texto nativo. |
| Preparación local de la solicitud | Construcción del cuerpo y clave para compartir solicitudes; serialización HTTP cuando corresponde. |
| Apps Script `serverMs` del proxy | Desde entrada a la función hasta tener el objeto de salida, antes de serializar/devolver. Contiene las subetapas siguientes. |
| Entrada, sesión, preparar petición | Análisis JSON HTTP, comprobación/renovación de sesión y construcción del cuerpo Gemini. RPC evita el análisis JSON de entrada adicional. |
| `providerFetchMs` | Sólo `UrlFetchApp.fetch`: transporte, espera del servicio y generación juntos. No separa inferencia de cola/red. |
| `providerDecodeMs` | Obtener texto y estado, interpretar JSON y cabeceras de la respuesta Gemini. |
| `upstreamMs` | Mantiene el alcance antiguo para compatibilidad; contiene llamada remota e interpretación. No sumarlo a esas dos subetapas. |
| Fuera del backend medido | Recepción completa menos `serverMs`: incluye colas, transferencias, salida del servidor y lectura del sobre en el cliente. No es exclusivamente red. |
| Interpretar/validar campos y aplicar resultado | Se mide la interpretación del JSON de campos; la validación y aplicación documental mantienen sus etapas existentes. Están contenidas en el total de lectura. |

«Respuesta IA», «Extracción IA» y `ai-response` pueden describir la misma solicitud desde distintos niveles; **no se suman**. Los contadores de tokens de entrada, respuesta y pensamiento son cantidades informadas por Gemini, no tiempos. Un campo ausente sigue pendiente; una respuesta técnica correcta no acredita una validación completa.

## Mejora medida localmente

Comparación con las funciones anteriores conservadas como fixtures, usando la misma petición ficticia con dos adjuntos, 2.400.000 caracteres base64 y respuesta fija:

- RPC: **4 → 1 serializaciones y 4 → 1 análisis JSON explícitos**; un envío antes y después. Se eliminan 3 de cada uno dentro del código AUTOCOR; no incluye la serialización interna de Google.
- CPU Node, tres series de medianas: antes **9,349 / 11,909 / 7,980 ms**; después **4,052 / 2,743 / 2,839 ms**. Son milisegundos locales con servicio simulado, no resultados de Apps Script. No explican por sí solos los 20,59 s.
- Bytes del prompt, sin contar esquema ni imágenes: cédula **3.751 → 2.304**; matrícula **3.672 → 2.156**; notaría **4.623 → 2.280**; RUC **3.386 → 2.165**. Los criterios completos permanecen en el esquema. Estas cifras no son porcentajes de reducción del tiempo ni mediciones de tokens reales.

Datos en `recorrido-ia-local-20261028.json`. La exactitud real tras quitar texto duplicado y cualquier reducción de segundos con Google siguen pendientes de la revisión manual. No se toma una respuesta ocasional más rápida como prueba.

## Comprobaciones puntuales

- `gemini-pipeline-latency.cjs`: cuerpo Gemini idéntico para la misma entrada, esquema/adjuntos conservados, una solicitud, equivalencia HTTP/RPC, permisos, cuota/503, configuración y error de transporte; menos conversiones y mediciones comparables.
- `gemini-pipeline-timing.cjs`: reloj determinista para recepción, sesión, llamada remota, interpretación y validación; compatibilidad con backend anterior y diagnósticos sin contenido personal.
- `initial-ai-browser.cjs`: una ronda tras autenticar, dos modelos permitidos, alternativa sólo en el inicio, modelo fijo, errores distintos, campos manuales/vacíos conservados y nuevas mediciones visibles en el panel existente. Backend interceptado, sin Google real.
- `session-backend.cjs`, `ai-latency.cjs`, `initial-ai-recovery.cjs`, `document-extraction.cjs`, `document-reading-quality.cjs`, `cross-chassis.cjs`, `validation-pending.cjs` y sintaxis/29 comprobaciones de `regression.cjs`: correctas. No son pruebas nuevas con documentos reales.

## Apps Script y límites

**Esta versión sí necesita actualizar `gas/script.gs` completo y crear una Nueva versión de la implementación existente** para activar la optimización RPC y las mediciones del backend. No cambia URL, claves ni permisos. No se realizó esa actualización. El frontend sigue siendo compatible con el backend anterior: las etapas nuevas ausentes quedan sin medición. La pestaña ya abierta mantiene su código cargado y no se recargó para generar otra ronda.

La petición no usa herramientas, búsqueda, alternativas ocultas ni parámetros adicionales de razonamiento. No hay evidencia de trabajo extra por estas opciones. Se mantienen exclusivamente Gemini 3.5 Flash Lite y 3.1 Flash Lite, selección inicial única y modelo fijo, CUV local y flujo sin Tesseract.

Referencias primarias revisadas: [UrlFetchApp](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app), [esquemas y descripciones de salida estructurada](https://ai.google.dev/gemini-api/docs/structured-output), [documentación de razonamiento](https://ai.google.dev/gemini-api/docs/thinking). Las descripciones del esquema guían la lectura; no se inferió una duración de generación a partir del límite de tokens o de un nivel de razonamiento no medido.
