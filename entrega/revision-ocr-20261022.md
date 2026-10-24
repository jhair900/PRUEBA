# Revisión previa a publicación: contradicciones y retirada OCR

Fecha: 22 de octubre de 2026. Proyecto: PRUEBAS AUTOCOR.

Versión nueva: `20261022T201444372389Z`.
Paquete: `AUTOCOR-actualizacion-automatica-20261022T201444372389Z.zip`.
Estado: preparado localmente para revisión; **no publicado**.

## 1. Contradicciones propagadas a campos ya completos

En `contratos.html`, `mergearDatosConOCR` examina los campos del documento además de los que estaban faltando. Las claves de `_reviewKeys` marcan el origen como `review`, aunque una lectura anterior ya hubiera completado el campo. La discrepancia entre un valor confirmado y otro valor OCR también exige revisión. Los pendientes se recalculan al terminar el procesamiento.

No se sobrescribe una edición manual, incluido un campo vaciado. Se mantiene la posibilidad de resolver con OCR una sugerencia de IA previamente marcada como dudosa, cuando el parser no señala contradicción. Un valor anterior que ahora tiene evidencia contradictoria puede seguir visible para revisión, pero no queda confirmado.

Los lectores de matrícula, cédula, RUC y propietario de notaría reúnen los candidatos del mismo campo y rol antes de confirmar una identificación. Dos candidatos distintos dejan el campo pendiente; tampoco se confirma el primero por descartar únicamente el dígito inválido del segundo. Las identificaciones de propietario/contribuyente y representante se tratan por separado; las partes del último contrato de notaría no se usan como propietario actual.

Regresión exacta con `parseMatricula` real, sus normalizadores y la verificación final de matrícula:

```
IA: datos vacíos
Campos solicitados: placa, color
Frontal: PLACA ABC1234
Reverso: PLACA ABC1235\nCOLOR BLANCO
Resultado: _origins.placa === 'review'
           _missing incluye 'placa'
           color === 'BLANCO'
```

Antes de la corrección esta regresión fallaba porque el origen era `ocr`. Se añadieron también casos de identificaciones diferentes, roles distintos y valores manuales llenos/vacíos.

## 2. Retirada fallida o sin respuesta

En `js/document-processing.js`, `retire()` devuelve directamente una única promesa con su rechazo manejado, sin un wrapper `async` que produzca otra promesa descartada. `bounded()` maneja también los rechazos de la limpieza que dispara al cancelar o agotar la espera.

Un rechazo de `terminate()` o una retirada sin respuesta durante 2 segundos fija el estado terminal `OCR_RESTART_REQUIRED`. Los intentos posteriores reciben ese estado; no se vuelve a llamar a la fábrica ni se crea otro worker. Si la terminación se confirma normalmente, sigue disponible la recreación segura ya existente.

La configuración inicial de parámetros se ejecuta ahora dentro de la misma pasada protegida que el reconocimiento. Se conservan idioma, parámetros y estrategias adaptativas, y un fallo al configurar el worker también pasa por la retirada controlada.

La causa original se conserva en `error.cause` como propiedad no enumerable. El diagnóstico registra únicamente categorías seguras: `OCR_TERMINATION_REJECTED` u `OCR_TERMINATION_TIMEOUT`, tipo de error y duración. No serializa la causa, su mensaje, stack ni datos documentales. `js/workflow.js` muestra esas categorías en el detalle de Tiempos, cuyo acceso sigue siendo exclusivo de administradores.

La interfaz indica: **«Guarda un borrador y recarga la página»**, y recuerda volver a seleccionar los archivos. Deshabilita los reintentos que no pueden recuperarse y mantiene «Revisar datos». Si el fallo llega después de cancelar, sólo cambia esa presentación: no vuelve a aplicar datos parciales sobre ediciones posteriores.

Antes de la corrección, la prueba de rechazo recibía el error original sin código `OCR_RESTART_REQUIRED`. Las nuevas pruebas comprueban la normalización, la causa interna, la ausencia de rechazos sin manejar y el límite de un worker.

## 3. Pruebas ejecutadas

**27 suites aprobadas: 22 de lógica/regresiones y 5 de navegador. Cero suites fallidas.**

Nuevas:

- `tests/ocr-contradictions.cjs`: parser real, contradicción entre caras, identificaciones por rol, dígito inválido, pendientes y protección manual.
- `tests/ocr-retirement.cjs`: rechazo y falta de respuesta de `terminate()`, estado terminal estable, causa interna, diagnósticos sin contenido y un solo worker.
- `tests/ocr-retirement-browser.cjs`: cuatro escenarios con la interfaz real: rechazo y falta de respuesta, tanto tras timeout como tras cancelación; instrucciones de recuperación, revisión disponible, conservación de manuales y ausencia de rechazos sin manejar.

Regresiones de lógica también aprobadas:

`analysis-adaptive`, `analysis-batch`, `analysis-limits`, `analysis-speed`, `auto-update`, `cedula-ocr`, `channel-recovery`, `contract-normalization`, `contract-pipeline`, `contract-values`, `document-extraction`, `document-reading-quality`, `gemini-priority`, `matricula-ocr`, `ocr-memory`, `papeleta-minimal`, `processing-control`, `regression`, `save-confirmation-budget`, `stability`.

Otras pruebas de navegador aprobadas:

`contract-values-browser`, `papeleta-layout-browser`, `processing-browser`, `workflow-browser`.

Se conservan las comprobaciones de una pasada cuando la evidencia es completa, meseta fiable sin inventar datos, variantes para baja confianza, comprobación de identificación/chasis/motor, PDF mixto, liberación al cancelar, respuestas tardías, inicialización compartida, permisos de Tiempos y borradores. `contract-pipeline` añade una aserción para exigir revisión cuando OCR contradice un RUC confirmado por IA.

Los resultados completos, con salida, código de retorno y duración por suite, están en:

- `revision-ocr-pruebas-unitarias-20261022.json`.
- `revision-ocr-pruebas-navegador-20261022.json`.

Estas suites usan datos ficticios y dobles de Gemini/Tesseract para controlar los errores y la cancelación. Las pruebas de navegador ejecutaron Edge con Playwright; esto no equivale a una prueba del servicio Gemini de producción.

## 4. Comparación adicional con Tesseract real e imágenes sintéticas

Se ejecutó `tests/analysis-benchmark.cjs` contra la copia previa a esta revisión (`20261022-revision-ocr-retirada`) y el código corregido. Archivo: `revision-ocr-benchmark-20261022.json`. No hubo llamadas a IA ni documentos de clientes.

| Imagen sintética | Antes | Después | Pasadas antes/después | Campos correctos antes/después | Pendientes antes/después |
| --- | ---: | ---: | ---: | ---: | ---: |
| Clara, tres campos | 305 ms | 265 ms | 1 / 1 | 3 / 3 | 0 / 0 |
| Degradada | 4015 ms | 3401 ms | 15 / 15 | 2 / 2 | 1 / 1 |
| Motor ausente | 522 ms | 483 ms | 3 / 3 | 2 / 2 | 1 / 1 |

Los tiempos de cada imagen excluyen inicialización del worker, que fue 1943 ms antes y 1003 ms después. Es una ejecución por caso, con posibles efectos de caché y variación del equipo: **no demuestra una mejora de latencia en producción**. Lo comprobable en estas muestras es que se conservan las pasadas adaptativas, los campos correctos y los pendientes.

El máximo observado de píxeles de canvases fue igual por caso. El heap JS observado subió ligeramente en uno de los tres casos; estas métricas no incluyen toda la memoria del proceso, WASM o GPU y no justifican afirmar una reducción global de memoria.

## 5. Entrega y verificaciones pendientes

El ZIP contiene los archivos del sitio con versión actualizada, `tests/` para reproducir la revisión y `revision/` con este informe y las evidencias. `tests/` y `revision/` son material de revisión y no son necesarios para servir el sitio. Se comprobó la integridad del ZIP, la coherencia de versión de los HTML y recursos JS, la presencia de archivos locales referenciados y la coincidencia de los fuentes empaquetados. Los resultados de empaquetado se incluyen en `revision-ocr-paquete-20261022.json`.

Las pruebas pueden ejecutarse desde la raíz con `node tests/ocr-contradictions.cjs`, `node tests/ocr-retirement.cjs` y `node tests/ocr-retirement-browser.cjs`. La última necesita Playwright y Edge. El benchmark necesita acceso de red a Tesseract e idiomas y no usa Gemini.

Se mantiene el flujo **IA primero → OCR después → CUV local**, la anticipación y el uso compartido de consultas, la cancelación y la protección de ediciones manuales. No se modificó `gas/script.gs`; esta corrección no requiere otro despliegue de Apps Script.

Sigue pendiente validar con sesión real de Gemini y documentos autorizados del usuario: exactitud por formato, fotos difíciles, cuotas, latencia de extremo a extremo y uso de memoria durante una jornada. Las pruebas sintéticas no certifican esos resultados. La publicación queda pendiente de la revisión del paquete.
