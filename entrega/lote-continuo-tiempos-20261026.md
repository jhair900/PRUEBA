# Validación continua, preparación y Tiempos para todos

Versión para revisión: **20261026T175631976075Z**. Sin publicar ni desplegar. No se hicieron consultas reales a Gemini. No requiere modificar Apps Script.

## Causas reproducidas y corrección

Los contadores ya empezaban de nuevo en cada documento; no se encontró un contador compartido que arrastrara los intentos anteriores. El problema era el corte del lote: cualquier recuperación agotada o error terminal de un documento también detenía los siguientes. Se reprodujo con Matrícula y con Cédula Propietario, dejando Cónyuge, Matrícula y Notaría sin intentar según el caso.

Ahora un fallo técnico aislado agota únicamente la recuperación de ese documento y el lote intenta los demás, manteniendo el modelo fijo. Los impedimentos comunes —sesión, cuota, modelo no disponible o una espera indicada por el servicio que no cabe en el plazo— sí pueden detener el lote. El aviso identifica el documento cuya recuperación se agotó y distingue los documentos fallidos de los aún no intentados. No declara una validación completa si quedan lecturas o campos obligatorios pendientes.

El formulario de recuperación se inicializaba vacío y esos vacíos se presentaban como datos ausentes/ilegibles. Ahora conserva una causa técnica separada y muestra «NO EVALUADO» cuando no hubo una lectura utilizable. Se agrupa el fallo por documento en el aviso existente, con acceso al respaldo. Un HTTP 200 con un objeto vacío tampoco acredita una lectura válida; los campos omitidos en una respuesta parcial requieren revisión. Los valores explícitamente vacíos de una lectura válida siguen siendo pendientes de datos. Las correcciones manuales, incluidos vacíos, se conservan.

Se utiliza el límite individual de 30 segundos que ya estaba definido pero no se aplicaba al envío, dentro de los mismos 45 segundos acumulados de IA y los mismos tres intentos máximos por documento. Esto deja margen para recuperar una solicitud atascada sin ampliar el plazo total. Se respetan cancelación, esperas progresivas y `Retry-After`. El siguiente documento comienza en intento y solicitud 1; una lectura posterior válida elimina su error técnico anterior. Al repetir la validación sólo se procesan los documentos incompletos.

## Demora: mejora medida y límites

Se eliminó una serialización completa adicional del cuerpo con todos sus adjuntos, utilizada únicamente como clave de deduplicación. La nueva clave conserva modelo, criterios e identidad exacta de cada adjunto sin modificar el cuerpo enviado. Las referencias se liberan al acabar las solicitudes; no se mantiene una caché de lecturas completadas. Imágenes, resolución, prompts y reglas de extracción permanecen iguales.

Última medición **sintética local**, 12 repeticiones, con un cuerpo de aproximadamente 4,2 millones de caracteres:

- Clave completa anterior: mediana **3,728 ms** y **4.198.870 caracteres**.
- Primera clave compacta: **0,244 ms**; mediana de claves repetidas: **0,042 ms** y **4.620 caracteres**.
- El cuerpo de solicitud permaneció idéntico. Dos solicitudes simultáneas equivalentes compartieron un único envío; cambios de adjunto, modelo o criterios produjeron claves diferentes.

Los valores de 24,1 s para Cédula, 10,9 s para Matrícula y 8,1 s para Notaría aportados anteriormente incluyen el trayecto completo de respuesta y no separan retrospectivamente conexión, backend y Gemini. Los milisegundos anteriores **no demuestran una reducción de esos segundos ni del tiempo completo en producción**. La latencia y exactitud con el backend real quedan para la prueba manual; no se atribuyó todo el retraso a Gemini ni al respaldo HTTP.

## Tiempos y comprobaciones

El botón y el panel existentes están disponibles para todos los usuarios con sesión en Contratos, Liquidación, Pagos y Ventas, mostrando las mismas mediciones y detalles. No cambian administración de usuarios ni los demás permisos; al perder la sesión se retira el panel.

Pruebas locales satisfactorias:

- `validation-recovery-503.cjs`: recuperación temporal; fallo persistente de Matrícula; fallo de Propietario seguido por Cónyuge, Matrícula y Notaría; HTTP 200 sin campos; cuota que exige detenerse; cancelación. Reintentar sólo el fallido conserva todos los documentos completados y elimina el error anterior.
- `ai-recovery-503.cjs`: límites independientes, intento atascado recuperable dentro del plazo, presupuesto agotado, espera del servicio, mismo modelo y cancelación sin envíos adicionales.
- `workflow-browser.cjs`: acceso de usuarios normales al mismo panel y detalle en las cuatro páginas, sin administración adicional.
- `request-preparation.cjs`, `analysis-speed.cjs`, `document-extraction.cjs`, `contract-pipeline.cjs`, `gemini-availability.cjs`, `validation-focused.cjs` y `validation-pending.cjs`: deduplicación, cuerpo intacto, respuestas inválidas, valores manuales, cancelación, modelo fijo, puntos del modelo, revisión con imagen y pendientes reales.

Se conserva la selección inicial única entre Gemini 3.5 Flash Lite y Gemini 3.1 Flash Lite; no hay comprobaciones periódicas ni cambios de modelo. CUV continúa local y no se ejecuta Tesseract. El ZIP queda preparado para revisión manual, con versión uniforme, informe, medición sintética y pruebas.
