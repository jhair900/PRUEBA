# Revisión local del procesamiento de Contratos — 22/10/2026

Estado: implementado localmente y preparado para revisión. No publicado.

## Causa comprobada y versión publicada

Antes de editar se guardó la fuente completa y las pruebas en `C:/Users/USUARIO/.codex/backups/autocor/20261022-document-processing` y se ejecutaron 11 grupos de pruebas existentes, todos aprobados.

Se consultaron los archivos estáticos de `https://jhair900.github.io/PRUEBA/` sin iniciar sesión ni enviar documentos. `version.json` indicaba `20261016T181219075323Z`. Contratos y los clientes de análisis, extracción y Gemini coincidían con la fuente local anterior. El transporte también coincidía al normalizar los saltos de línea. En esa consulta no había una diferencia funcional de publicación que explicara por sí sola el retraso. Esto no identifica la versión desplegada del backend ni descarta cachés de otras pestañas.

Causas observadas en la fuente y reproducidas localmente:

- Cinco variantes por hasta tres PSM producen 15 reconocimientos por imagen. La salida anterior dependía de confianza, puntuación global y más de 100 caracteres, incluso cuando un documento corto ya contenía los campos necesarios.
- La matrícula pegada esperaba IA y después recorría las dos caras sin reevaluar lo pendiente tras la primera.
- La verificación de identificación, chasis y motor era necesaria, pero activaba el recorrido completo. Se mantiene la verificación y se cambia la decisión de repetir OCR.
- Los timeouts de generación eran por intento y los errores HTTP podían recorrer todos los modelos disponibles sin presupuesto conjunto.
- El aviso ocultaba la etapa real, la barra era decorativa y no existía cancelación que liberara el worker.

El bridge ya esperaba como máximo 1,5 segundos antes del respaldo HTTP. Sus 45 segundos corresponden a la apertura en segundo plano, no a una espera obligatoria por cada documento. Se conserva ese límite de 1,5 segundos y se permite cancelar también durante esa espera.

Pendiente de medir con producción: duración real de cada modelo, carga de idiomas con la red de los usuarios, tamaños/formatos reales, latencia de Apps Script/Gemini, cuotas y memoria total de los procesos. No hay evidencia para cambiar `gas/script.gs` en esta revisión.

## Implementación

1. Se mantiene IA primero, OCR de complemento/verificación y CUV por su lector local. Se conservan los esquemas de extracción y validadores existentes.
2. El OCR evalúa los campos solicitados y la evidencia contextual de los códigos críticos después de cada pasada. Confianza >=85 y todos los objetivos comprobados permiten salir pronto. Dos pasadas fiables consecutivas sin mejora permiten dejar ausencias explícitamente pendientes; no convierten un campo ausente o dudoso en confirmado. Las lecturas fiables contradictorias mantienen revisión. Confianza baja conserva las alternativas.
3. Cuando solo falta un campo y su etiqueta tiene una posición fiable, se permite una pasada sobre esa fila, con el ancho completo y líneas vecinas. Si no basta, se mantienen las variantes completas. Puede haber una pasada de zona adicional a las 15 alternativas completas; el límite temporal global sigue vigente.
4. Tras cada cara se vuelve a calcular lo pendiente. La siguiente cara se omite únicamente si los campos necesarios ya se completaron y los códigos críticos se comprobaron. Los PDF recorren todas sus páginas: usan texto nativo útil y rasterizan las páginas escaneadas de un PDF mixto.
5. Las imágenes pegadas se reutilizan como data URL, sin convertirlas a File/Blob ni volver a leerlas para enviarlas a IA. El OCR las decodifica solo si se necesita.
6. Se conservan variantes bajo demanda, su liberación al salir y el límite de 8 millones de píxeles por canvas preparado. No se ejecutan `setParameters`/`recognize` simultáneos sobre el mismo worker.
7. Se mantiene la anticipación del siguiente documento y la reutilización de peticiones idénticas en curso, aisladas por sesión/backend. Cancelar un consumidor no cancela otro consumidor activo; cancelar el lote descarta los anticipos pendientes.

### Presupuestos iniciales configurables

| Recurso | Límite inicial |
|---|---:|
| IA, todos los modelos del documento | 45 s |
| Un intento IA | Hasta 30 s, limitado por lo que queda del presupuesto |
| Modelos por solicitud | Hasta 3 |
| OCR, preparación/inicialización/caras/páginas | 60 s compartidos |
| Una pasada OCR | Hasta 15 s |
| Inicializar OCR | Hasta 20 s, limitado por el presupuesto OCR |
| Operación completa | 120 s |
| Aviso de demora | Desde 20 s |

Se pueden configurar mediante `window.AutoCorProcessingBudgets`. Son valores provisionales conservadores: las lecturas históricas aportadas incluían IA de aproximadamente 7–21 s y OCR de 19–24 s, y la inicialización local sintética rondó 1 s. Esas muestras no constituyen una distribución de producción ni permiten prometer un tiempo máximo de extracción satisfactoria. Agotar un presupuesto conserva datos y habilita revisión/reintento.

Solo cuota (429) o modelo inexistente (404/410) permiten cambiar de modelo. Autorización (401/403), rechazo de solicitud, servidor, red y timeout tienen códigos distintos; no provocan una cadena de reenvíos. Las duraciones de todos los intentos y su transporte se registran sin contenido documental.

## Cancelación y recuperación

La pantalla muestra documento, etapa, cara/página, tiempo transcurrido y actividad indeterminada. El porcentaje específico que emite Tesseract, cuando existe, se identifica como avance de esa pasada, no como progreso total.

Cancelar termina la espera inmediatamente, cancela lecturas/renderizados donde sus APIs lo permiten y retira el worker OCR activo. Antes de reconocer otra vez se espera su terminación. Si esta no se confirma, se bloquea la recreación y se indica guardar un borrador y recargar. Durante `createWorker`, Tesseract todavía no expone el handle: se cancela la espera y no se crean inicializaciones adicionales mientras la anterior siga pendiente.

Los archivos y las lecturas parciales se conservan. Hay revisión manual y reintento, también desde el documento detenido. Los identificadores de operación, las comprobaciones tras las esperas y el dueño vigente impiden aplicar resultados anteriores. Las ediciones manuales, incluidos campos vaciados, prevalecen. Una identificación/chasis/motor cuya verificación se interrumpió queda en revisión.

Cancelar el navegador no asegura detener una ejecución ya iniciada en Apps Script o Gemini. La interfaz lo explica; el resultado tardío no modifica el formulario. Un reintento explícito es una nueva consulta.

## Diagnóstico

En **Tiempos**, solo para administradores, cada operación muestra identificador y versión, total y etapas: preparación, páginas/caras y bytes de entrada, intento/modelo/resultado/canal de IA, inicialización OCR, cada página/variante/PSM/confianza/duración, evaluación de pendientes, validación/aplicación y motivo de detención. Las etapas usan una lista de metadatos permitidos.

Los nuevos diagnósticos excluyen imágenes, texto documental, valores de campos, nombres de archivo, identificaciones, tokens y credenciales. La evidencia que necesita la revisión por campo permanece separada dentro del formulario.

## Pruebas ejecutadas

19 grupos aprobados, más el benchmark real de OCR descrito abajo:

- Existentes: `analysis-speed`, `analysis-batch`, `document-reading-quality`, `ocr-memory`, `matricula-ocr`, `cedula-ocr`, `document-extraction`, `contract-pipeline`, `contract-normalization`, `papeleta-minimal`, `gemini-priority`, `channel-recovery`, `regression`.
- Nuevos: `processing-control`, `analysis-limits`, `analysis-adaptive`, `processing-browser`.
- Navegador adicionales: `workflow-browser` (Contratos, Liquidación, Pagos y Ventas) y `papeleta-layout-browser`.

Las pruebas nuevas verifican OCR que no termina, cancelación y recreación segura, cola serial de parámetros/reconocimiento, inicialización bloqueada sin multiplicar workers, presupuesto total/por modelos, errores por categoría, consumidores compartidos, respuestas tardías, manuales incluso vacíos, comprobación de los tres códigos críticos, segunda cara solo si hace falta, PDF mixto y cancelación de su render, privacidad del diagnóstico y detalle para administradores.

Los fallos de red/IA, los bloqueos de worker y los PDF mixtos se probaron con dobles controlados. Son pruebas funcionales, no mediciones de latencia ni exactitud del servicio de producción. El benchmark siguiente sí ejecuta Tesseract real sobre imágenes sintéticas. No se enviaron documentos a Gemini ni se accedió a datos productivos.

## Archivos de implementación

- `contratos.html`: flujo, decisión adaptativa, PDF/imágenes, carga, operaciones y recuperación.
- `js/document-processing.js` (nuevo): presupuestos, cancelación, metadatos permitidos y dueño serial del worker.
- `js/document-analysis.js`: conservación de anticipación/deduplicación con consumidores y cancelación de lote.
- `js/gemini-client.js`: cancelación, clasificación de errores y medición del transporte/cuerpo.
- `js/apps-script-transport.js`: cancelación durante apertura, sin reenviar una operación ya enviada.
- `js/workflow.js`: detalle de las etapas documentales en el panel de administradores.
- `README.md`: funcionamiento, límites, verificación y publicación.
- Cinco pruebas nuevas: `analysis-adaptive.cjs`, `analysis-limits.cjs`, `processing-control.cjs`, `processing-browser.cjs`, `analysis-benchmark.cjs`.

`js/document-extraction.js` y `gas/script.gs` conservan su contenido anterior. La preparación de la versión actualiza los identificadores de caché de los HTML y `version.json`.

## Publicación

El ZIP completo indicado al final se ha preparado para revisión local. Para aplicar la corrección, extraerlo y subir su contenido a la raíz del repositorio de GitHub Pages, conservando las carpetas. Publicar juntos todos los HTML, `version.json` y `js/`, incluido el nuevo `document-processing.js`. No hace falta desplegar otra versión de Apps Script para este cambio.

Después de publicarlo, comprobar que `version.json` y los `?v=` de Contratos coincidan con la versión entregada. Abrir una pestaña nueva e iniciar sesión. Con los mismos documentos reales, comparar las operaciones documentales en **Tiempos**, registrar campos correctos y pendientes y comprobar cancelación/reintento. Estas mediciones reales siguen pendientes; las pruebas locales no permiten declarar eliminado todo el retraso del servicio.

Vista previa de la carga: `procesamiento-documentos-20261022.png`. El umbral de aviso estaba reducido para esa prueba visual; en uso normal es 20 segundos.

## Comparación con OCR real y datos sintéticos

Tesseract real (spa + eng), Edge sin interfaz, la fuente anterior respaldada frente a la nueva. Mismas tres imágenes de 1200 × 380 píxeles (456.000 píxeles de entrada). Sin llamadas a IA ni documentos de clientes. La precisión se compara contra los valores conocidos del caso mediante el parser real de matrícula. Una sola ejecución por versión/caso; los tiempos no son percentiles ni una estimación de producción.

| Caso | Tiempo antes → después | Pasadas antes → después | Campos correctos antes → después | Pendientes antes → después |
|---|---:|---:|---:|---:|
| Documento corto claro | 3.826 s → 0.270 s | 15 → 1 | 3/3 → 3/3 | 0 → 0 |
| Imagen degradada / código alfanumérico | 4.131 s → 3.679 s | 15 → 15 | 2/3 → 2/3 | 1 → 1 |
| Documento sin motor visible | 2.603 s → 0.529 s | 15 → 3 | 2/2 → 2/2 | 1 → 1 |

El tiempo de la tabla excluye inicializar el worker: se midió por separado en 1058 ms antes y 922 ms después. La imagen difícil conserva todas las variantes y su campo pendiente. El documento sin motor conserva esa ausencia como pendiente; no la completa por suposición. Estas muestras justifican la salida por campos comprobados y la meseta fiable sin quitar alternativas a la imagen difícil.

### Memoria observada

| Caso | Máximo de píxeles de canvases vivos antes → después | Pico de heap JS de página antes → después |
|---|---:|---:|
| Documento corto claro | 1,662,272 → 1,059,136 | 32.7 MB → 13.9 MB |
| Imagen degradada / código alfanumérico | 1,825,176 → 1,825,176 | 63.0 MB → 45.1 MB |
| Documento sin motor visible | 1,167,512 → 811,756 | 18.4 MB → 52.9 MB |

No aumentó el máximo de píxeles de canvases en estos casos. El mayor heap JS observado en el lote pasó de 63,0 MB a 52,9 MB, pero el caso sin motor tuvo un heap mayor después que antes. La prueba no aísla la recolección de basura ni la retención entre casos; no permite atribuir esa diferencia ni afirmar una reducción general de memoria. Estas métricas excluyen memoria total de procesos, WASM/worker y GPU. Se mantienen las pruebas de liberación de canvases y un solo worker, con recreación únicamente después de terminarlo. Falta medir memoria total con documentos reales.

Datos completos reproducibles: `ocr-benchmark-20261022.json`. Vista de la carga verificada en navegador: `procesamiento-documentos-20261022.png`.

## Paquete preparado

Versión: `20261022T180855475051Z`. Archivo: `AUTOCOR-actualizacion-automatica-20261022T180855475051Z.zip`.

El ZIP pasó la comprobación de integridad; sus fuentes coinciden con las revisadas y todos los recursos locales de Contratos existen y usan la misma versión de caché.

Huellas SHA-256 para comparar una publicación posterior:

| Archivo | SHA-256 |
|---|---|
| `contratos.html` | `ed9bae2ee66215cf616bce5dd2b630aefe241c5a0dce2f2310e21dd268cf81d4` |
| `js/document-processing.js` | `84305d84067e7c38b5e05c8776eda7b025613a512c99ab3b44394dd0b852463f` |
| `js/document-analysis.js` | `8cdcdd461f3fdccbdeb15ae9f35bddcc79280c28813ccb3f12d5f7f85ca91080` |
| `js/gemini-client.js` | `dca0bb2fabd7e6e4cbd4f78c8f6621c5dea3a1c1f0fa0067af786bd9396081e3` |
| `js/apps-script-transport.js` | `5e23a6496985cb92c75943c129c320859501fc0a9420c2dcd803de87ff509e04` |
| `js/workflow.js` | `cccb89a7f7fce7cdc730c5f8d823b5d52b94ef828a9c5309721c0fc4ab9be5dc` |
| `version.json` | `6b30e8bbf5932d5309b74629ada4f40dcad09d835d8ac8485f90e1019820e257` |

La retención de archivos para reintentar dura mientras siga abierta la pestaña. Los borradores no convierten los archivos subidos en una copia persistente: si hay que recargar por una terminación fallida del motor, se deben seleccionar de nuevo esos archivos.
