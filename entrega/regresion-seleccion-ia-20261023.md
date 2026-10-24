# Corrección de la selección automática de IA

Versión preparada para revisión: **20261023T165039222446Z**. Sin publicar ni desplegar. No se enviaron consultas reales a Gemini.

## Comparación y causa reproducida

Se comparó con la versión **20261023T153447010934Z**, que había superado la revisión manual, y con la entrega **20261023T155603656354Z** que añadió el acceso al respaldo. Los archivos de disponibilidad, cliente Gemini, transporte y extracción eran idénticos; la selección y sus temporizadores en Contratos también eran idénticos al ignorar el identificador de versión. El botón de respaldo no había añadido llamadas a IA.

Se reprodujeron debilidades del selector que explican esperas y reintentos:

- Un candidato podía consumir **25 segundos** de comprobación; `AI_TIMEOUT` interrumpía la selección sin probar la alternativa disponible. En la reproducción, A se atascó y B nunca recibió una solicitud.
- Al caducar una prueba válida de B, la renovación reiniciaba el catálogo: A, B, A, B; volvía a probar el modelo descartado en lugar de empezar por el que funcionó.
- El tiempo de espera de la promesa no cancelaba por sí mismo el transporte recibido por el selector. La prueba sintética mostró que la señal seguía activa al abandonar el intento. El cliente tenía su propio temporizador, pero la coordinación no estaba garantizada.
- Después de un fallo se programaban nuevas rondas sin un límite acumulado. Un timeout del selector podía además registrarse como cancelación en el cliente.

No se dispone del desglose de la última ejecución real para atribuir su duración concreta a conexión, Apps Script o Gemini. El respaldo HTTP no se considera un fallo por utilizarse.

## Corrección aplicada

- Se mantiene una única selección en curso, compartida por los consumidores. Una comprobación vigente se reutiliza sin renovar su antigüedad artificialmente.
- La renovación empieza por el último modelo que respondió. Si una ronda se queda sin presupuesto, la siguiente prioriza los modelos todavía no comprobados antes de repetir los anteriores.
- Cada prueba sintética dispone de hasta **10 segundos**, frente a 25 antes; el presupuesto total por ronda permanece en **45 segundos**. No se aumentó el timeout. La lectura de documentos mantiene su presupuesto propio.
- Timeout, cuota agotada, modelo ausente y fallos recuperables permiten pasar secuencialmente a una alternativa dentro del presupuesto. Cada modelo se intenta como máximo una vez por ronda.
- El agotamiento cancela la espera y la señal del transporte en el navegador antes de continuar. Las respuestas tardías no habilitan otro modelo o contexto. Una petición ya recibida por Apps Script puede continuar en el servidor; no se afirma que el navegador pueda detenerla allí.
- Como máximo hay **dos rondas consecutivas fallidas** por contexto: la inicial y un reintento automático. La pausa es de al menos **60 segundos**, respetando un `Retry-After` mayor cuando corresponda. Las interacciones no eluden la pausa ni reinician un ciclo agotado. Una comprobación satisfactoria restablece el ciclo; una sesión o contexto nuevos permiten una selección nueva.
- El aviso de error continúa visible. Sólo anuncia una nueva comprobación automática si hay una realmente programada. Si se agotan las rondas, se mantiene bloqueada la carga de documentos que requieren IA, sin un bucle indefinido. CUV sigue disponible localmente.

No se modificaron los criterios de extracción, las imágenes, los puntos del modelo, las comparaciones, los campos editables ni el acceso al respaldo. No requiere cambios en Apps Script.

## Comprobaciones puntuales

Satisfactorias, con servicios interceptados o simulados y documentos ficticios:

- `tests/ai-selection-regression.cjs`: alternativa tras timeout, cancelación de señales, doce consumidores agrupados, prueba vigente reutilizada, última IA válida priorizada, pausa y límite de rondas, presupuesto total, continuación por candidatos no comprobados y causa exacta del timeout; sin rechazos sin manejar.
- `tests/gemini-availability.cjs`: cuota, alternativas, respuestas inválidas, autenticación, vigencia, cambio de contexto, cancelación y presupuesto independiente de lectura.
- `tests/ai-latency.cjs`: HTTP inmediato cuando el puente no está listo, reutilización del puente conectado, sin doble envío ni serialización redundante.
- `tests/processing-browser.cjs`: carga bloqueada antes de una comprobación válida, recuperación automática, renovación y documentos/manuales conservados ante cancelación o cuota. Se actualizó su fixture para dejar un campo pendiente, porque el flujo vigente correctamente evita repetir documentos completos; también espera la finalización real de la comprobación.
- `tests/validation-focused.cjs`: abrir respaldos, editar, vaciar, cerrar, recalcular y volver a la pestaña **no incrementó el total de consultas**, incluidas las comprobaciones de disponibilidad. Se conservaron puntos, coincidencias, edición con imagen, cancelación y ausencia de Tesseract.

Los temporizadores cortos de las pruebas son sintéticos; no representan una mejora medida del backend. Queda pendiente la revisión manual de la selección con la cuenta y el backend reales. Los HTML y recursos JS llevan la nueva versión para evitar mezcla de cachés.
