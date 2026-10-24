# Recuperación automática del lote ante HTTP 503

Versión para revisión: **20261024T024756572304Z** (identificador UTC). Sin publicar ni desplegar. No se hicieron consultas reales a Gemini.

## Causa localizada

La lectura documental sólo cambiaba de modelo ante cuota agotada o modelo inexistente. Un `AI_UPSTREAM_ERROR` terminaba Matrícula, invalidaba la disponibilidad y programaba una comprobación posterior. Esa comprobación podía tener éxito, pero su promesa ya no pertenecía al lote terminado: no reanudaba Matrícula. El siguiente documento podía fallar en la comprobación previa sin haber enviado una solicitud documental; el resumen no distinguía ese caso.

Un 503 conserva su clasificación de error del servicio, **sin convertirlo en falta de cuota ni pérdida de conexión**. Los registros recibidos no separaban el HTTP externo del estado interno del proxy; por tanto, no permiten atribuir retrospectivamente el fallo concreto a Gemini o a la infraestructura de Apps Script. El backend local reenvía el estado recibido de Gemini dentro de `_proxy.status`. Ahora «Tiempos», para administradores, distingue el HTTP externo observado, el estado del proxy y el estado estructurado del servicio cuando existe. Un HTTP 503 externo con cuerpo HTML tampoco se confunde con JSON inválido o falta de conexión. En el canal RPC no se inventa un HTTP externo observado.

## Corrección

- La recuperación permanece dentro de la misma lectura y la misma promesa del lote. Reutiliza el cuerpo ya preparado, sin repetir documentos completados ni preparar otra vez sus archivos.
- Ante un error temporal del servicio, espera y reintenta el mismo modelo. Si persiste, comprueba una alternativa compatible y continúa la solicitud pendiente. Las esperas progresivas predeterminadas son de 1 y 2 segundos y se respeta una indicación de espera mayor del servicio.
- Se mantienen **45 segundos acumulados del tramo IA por documento**, incluyendo las esperas y comprobaciones de recuperación. Hay como máximo **3 envíos documentales y 5 solicitudes en total dentro de la lectura**, contando las pruebas de alternativas. La comprobación inicial, realizada antes de cargar documentos, es independiente. Si el servicio exige esperar más de lo que cabe en el presupuesto, se conserva el 503 y se detiene la recuperación en lugar de ignorar la indicación o alargar el plazo.
- Al recuperarse Matrícula, se aplica su resultado y el mismo lote continúa con Notaría. Cédula y CUV completados permanecen intactos. Los campos manuales, también vacíos, siguen protegidos.
- Si se agotan los límites, se conserva lo leído y el resumen distingue «No se completó: Matrícula» de «Sin intentar: Print Notaría». Una comprobación posterior de disponibilidad no reinicia por su cuenta un lote cuyo límite ya se agotó.
- Cancelar detiene la espera, la comprobación de alternativa y los siguientes envíos. Se conserva la protección frente a respuestas tardías y la promesa única evita recuperaciones duplicadas. Una solicitud ya recibida por el servidor puede continuar allí, pero no reanuda el lote cancelado.

## Verificación local

Satisfactoria con servicios interceptados y documentos ficticios:

1. Cédula correcta → Matrícula 503, 503 → alternativa comprobada → Matrícula correcta → Notaría. Cédula se envió una sola vez; CUV quedó idéntico y no se reprocesó. No hubo envíos duplicados al invocar de nuevo la validación en curso.
2. 503 persistentes: se alcanzó el límite; no se creó una operación ni se envió una solicitud para Notaría. El resumen distinguió fallo de documento sin intentar.
3. Cancelación durante la recuperación: no hubo reintento ni envío de Notaría. También se comprobó la cancelación durante la prueba de una alternativa.
4. `Retry-After`, presupuesto de solicitudes, vencimiento del plazo durante un reintento atascado, distinción HTTP externo/proxy y ausencia de datos documentales en diagnósticos.

Pruebas ejecutadas: `tests/ai-recovery-503.cjs`, `tests/validation-recovery-503.cjs`, `tests/gemini-availability.cjs`, `tests/ai-selection-regression.cjs`, `tests/ai-latency.cjs`, `tests/validation-focused.cjs` y `tests/cross-chassis.cjs`. Se conservaron selección automática, puntos del modelo, comparación de chasis, edición con imagen, campos vacíos manuales, acceso al respaldo y ausencia de Tesseract.

Las esperas cortas de los fixtures son sintéticas; no son mediciones del backend real. Queda pendiente la revisión manual de esta versión con la cuenta real. `gas/script.gs` no cambió: esta corrección no requiere modificar ni volver a desplegar Apps Script.
