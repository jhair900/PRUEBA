# Inicio de IA con presupuesto único — 28/10/2026

Versión revisada y probada: `20261028T153157569058Z`. Lista para revisión local; sin publicar ni desplegar.

## Causa comprobada y límites de la investigación

El código anterior cancelaba la espera/transporte del navegador a los 10 segundos y después iniciaba otra generación. No tenía un mensaje de cancelación hacia Apps Script ni hacia su `UrlFetchApp.fetch`. El puente RPC quitaba la respuesta pendiente de su mapa local; eso no confirmaba que la función remota hubiera terminado.

Se reprodujo por HTTP en loopback con trabajo del servidor independiente de la desconexión del cliente: la versión anterior envió cuatro solicitudes, las cuatro terminaron en el servidor de prueba después del corte local y hubo hasta tres trabajos activos simultáneos. La versión corregida recibió una respuesta en un solo envío, sin ese solapamiento. Otro caso de timeout confirmó que no se envía una segunda petición ni siquiera al cambiar sesión si el resultado remoto quedó desconocido.

Esto demuestra el riesgo de la implementación, pero **no acredita que las cuatro ejecuciones concretas de producción se solaparan**. No se dispuso de sus registros correlacionados de ejecución en Apps Script. Tampoco se atribuye a autenticación el 503 de alta demanda informado por el proveedor.

La documentación de [AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController) describe la cancelación de fetch, cuerpos y flujos del cliente. [UrlFetchApp](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app) es una llamada saliente independiente, con su propio límite; el archivo local no enlazaba esa llamada con la señal del navegador. La corrección no supone que cancelar una espera local detenga el trabajo de Gemini.

## Corrección aplicada

- Una sola espera compartida de autenticación y una sola ronda inicial. Se quitó el temporizador adicional de 50 ms y se mantuvo el bloqueo antes de confirmar sesión.
- Un presupuesto acumulado de 45 segundos, compartido por solicitudes y pausas. Se eliminó el corte individual de 10 segundos y la cola A/B/A/B. Cada modelo se envía como máximo una vez; el segundo sólo se considera después de una respuesta que permita decidir y si queda presupuesto, respetando Retry-After.
- Un timeout local, una pérdida de conexión o un cambio de sesión con envío pendiente dejan `AI_INITIAL_RESULT_UNKNOWN`, con la causa original conservada en Tiempos. La ronda se detiene sin reenvío ciego. El código no declara terminada la operación remota.
- Una respuesta explícita de sesión rechazada antes del procesamiento sí permite completar el inicio después del acceso correcto. Una selección ya terminada no se repite al autenticar ni al abrir respaldos, corregir campos o actualizar resultados.
- La comprobación utiliza la misma imagen ficticia legible y valida los mismos campos y JSON. Su petición tiene texto/esquema específicos más breves y un máximo de 256 tokens de salida, frente a 2048. No se cambió la imagen ni los criterios, presupuestos o respuestas de documentos reales.
- Sólo Gemini 3.5 Flash Lite y Gemini 3.1 Flash Lite. El elegido permanece fijo. Sin comprobaciones periódicas, nuevos modelos, botones o modalidades.
- Tiempos distingue respuesta completa, resultado remoto desconocido, timeout local, sesión, cuota y error 503 del proveedor. No se registran credenciales ni datos documentales.

## Única ronda real después de la corrección

Se abrió la versión local en el navegador integrado. El usuario ingresó sus credenciales; el agente no las introdujo ni registró. Tras el login correcto se inició automáticamente una única ronda con la imagen ficticia. No se cargaron ni procesaron documentos personales y no se recargó para repetir la prueba.

| Medición real | Resultado |
| --- | --- |
| Login | correcto; aproximadamente 2,85 s |
| Modelo seleccionado | Gemini 3.5 Flash Lite |
| Rondas / solicitudes de IA | 1 / 1 |
| Comprobación inicial completa | 22,37 s; correcta |
| Trayecto Apps Script–Gemini y respuesta | 20,59 s |
| Resto del trayecto | 1,78 s |
| Canal | google.script.run |
| Estado del proxy / origen | 200 / provider |
| Campos ficticios y esquema | correctos, verificados antes de seleccionar |
| Segundo modelo | no fue necesario intentarlo |

Los valores son los mostrados por Tiempos, redondeados a dos decimales. Esta respuesta llegó después del antiguo límite local de 10 segundos; habría sido abandonada por ese corte. El trayecto backend–Gemini incluye envío y respuesta, no es una medición aislada de inferencia del modelo.

La prueba confirma el funcionamiento del inicio corregido en esa ronda. No demuestra disponibilidad permanente ni una reducción general del tiempo de Gemini. La comparación con los 36,6 s fallidos anteriores es orientativa: también cambió el canal y la carga externa pudo variar. No se probó Gemini 3.1 porque la primera elección válida debe conservarse.

Datos sin identificación de usuario en `presupuesto-ia-real-20261028.json`. La versión quedó abierta para revisión y conservó el trabajo de la página original.

## Comprobaciones locales puntuales

- `initial-ai-remote-budget.cjs`: comparación por HTTP loopback del código anterior y el corregido; continuidad del servidor tras corte local; ausencia de reenvío con resultado incierto; petición más breve sin alterar la imagen.
- `initial-ai-recovery.cjs`: 503 confirmado y alternativa válida; dos fallos externos persistentes sin intentos extra; Retry-After; timeout; sesión confirmadamente rechazada frente a envío incierto; selección fija y privacidad.
- `initial-ai-browser.cjs`: sesión antes de Gemini, recuperación permitida, dos 503 persistentes, error de configuración, Tiempos y conservación de campos manuales incluidos vacíos.
- `gemini-availability.cjs`, `ai-selection-regression.cjs` y `ai-recovery-503.cjs`: agrupación de arranques, ausencia de corte prematuro, cancelación y recuperación documental existente.
- `session-browser.cjs`: reautenticación y conservación de documentos, resultados y vacíos manuales; ningún guardado o contrato repetido automáticamente.
- `regression.cjs`: sintaxis y 29 comprobaciones de permisos, guardados y transporte existentes.

La comparación del cuerpo de petición en la prueba local aisló la misma entrada ficticia: 1055 → 618 bytes y 2048 → 256 tokens máximos de salida. Son mediciones sintéticas; no prueban cuánto de los segundos reales se ahorró por ese cambio.

## Apps Script y entrega

`gas/script.gs` no se modificó. No se requiere una nueva implementación de Apps Script por esta corrección; se utilizó el backend activo durante la prueba real. No se supone que su código completo coincida con el archivo local: la prueba acredita las rutas ejercidas de acceso y generación, y su respuesta indica el origen `provider`.

No hay un impedimento externo en la ronda real comprobada: se obtuvo respuesta válida. La alta demanda puede volver a producir 503; ese error seguirá visible y separado de sesión o cuota. El caso de ambos modelos indisponibles se verificó sólo mediante simulación y se detiene sin declarar disponibilidad falsa. No se publicaron archivos ni se desplegó código.
