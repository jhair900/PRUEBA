# Revisión de sesión AUTOCOR — 27/10/2026

Versión: `20261027T162110818336Z`. Estado: preparada para revisión local. Sin publicación ni despliegue.

## Causas comprobadas en el código anterior

- El estado de acceso y las variables de página se recuperaban de `localStorage` sin acreditar que el backend aceptara el token. No se comunicaba el vencimiento efectivo al cliente.
- El proxy devolvía 401 sin indicar su origen: no distinguía el rechazo de la sesión AUTOCOR de un rechazo de autenticación/permisos del proveedor. La disponibilidad de IA podía mostrar un diagnóstico equivocado.
- Contratos redirigía al inicio; Inicio y Firmas se recargaban ante cambios de acceso en otra pestaña. La sincronización de los módulos restantes se difería durante guardados.
- Cerrar o cambiar la sesión eliminaba borradores y la cola de Drive. No había una protección central para impedir aplicar respuestas API de una sesión anterior.
- La validación de sesión del backend convertía también errores internos de consulta en `AUTH_REQUIRED`; no eran necesariamente un vencimiento.

## Corrección

- Nuevo estado compartido de sesión acreditado por el backend. Una comprobación al abrir cada página; las llamadas simultáneas comparten esa comprobación. La sesión vigente y la renovación de su vencimiento se aprovechan sin sondeos continuos ni comprobaciones extra por documento.
- Código de sesión vencida/rechazada separado de `FORBIDDEN`, indisponibilidad del servicio de sesiones, conexión y error de credenciales del proveedor IA. La contraseña incorrecta permanece como error del acceso.
- Reutilización del acceso dentro de cada página. Un formulario visible por página, envío de login protegido contra doble activación y sin navegación ni recarga para reautenticar. Firmas reutiliza solamente el cuadro de acceso, sin nuevos controles administrativos.
- Vencimiento y cambios entre pestañas invalidan inmediatamente el contexto anterior. Los permisos mostrados proceden del backend, no de la marca administrativa almacenada.
- Archivos, imágenes, lecturas terminadas, datos manuales y vacíos intencionales permanecen en memoria. Los borradores conservan su vencimiento de 24 horas y su propietario; la reautenticación no elimina los archivos pendientes de Drive.
- El trabajo de una cuenta no se habilita con otra cuenta: queda oculto y bloqueado hasta recuperar la cuenta original. No se aplica una respuesta de un token/generación anterior a una sesión nueva.
- Iniciar sesión permite continuar con los botones existentes; no vuelve a ejecutar automáticamente guardados ni generación. Si un guardado ya enviado pierde confirmación por cambio de sesión, se indica verificar la placa antes de repetirlo. Si no se puede confirmar el cierre remoto, se informa de ello sin ocultar el fallo de conexión.
- La IA seleccionada se conserva durante toda la carga. Sólo los dos modelos autorizados. Una selección inicial sin terminar por autenticación puede completarse tras ingresar; una selección terminada no se vuelve a consultar. CUV local, sin Tesseract ni nuevos selectores.

## Comprobaciones locales realizadas

Todas con datos ficticios, backend/transporte interceptados y cero consultas a Gemini real.

- `session-browser.cjs`: Contratos, Liquidación, Pagos, Ventas, Firmas e Inicio. Sesión vigente, permisos verificados, vencimiento con trabajo abierto, acceso incorrecto y correcto, tres solicitudes simultáneas, un único modal, cierre desde otra pestaña sin recarga, respuesta anterior tardía y bloqueo de trabajo de otra cuenta.
- En el mismo navegador: Cédula completada → sesión rechazada al leer Matrícula → acceso en la página → se continúan solamente Matrícula y Notaría. CUV y vacío manual conservados; misma IA y una única comprobación inicial de Gemini.
- Generación: rechazo de sesión al guardar; ninguna descarga de contratos, datos de contacto conservados y ninguna repetición automática tras autenticar.
- `session-backend.cjs`: funciones reales del backend con hoja simulada. Renovación deslizante y vencimiento; credenciales incorrectas/correctas; token reemplazado y cierre revocado; permisos insuficientes; error de consulta de sesión distinto de vencimiento; proxy separa sesión y proveedor y no llama a Gemini con sesión rechazada.
- `session-state.cjs`: tres comprobaciones simultáneas comparten un envío; sesión vigente reutilizada; vencimiento local conocido; renovación efectiva; conexión fallida queda como sesión sin comprobar.
- `validation-focused.cjs`, `validation-pending.cjs`, `validation-recovery-503.cjs`: puntos del modelo, comparación, revisión con respaldo, vacíos manuales, pendientes reales, recuperación 503 acotada y cancelación conservados.
- `workflow-browser.cjs`: borradores, bloqueo de operaciones simultáneas, guardado/generación y descarga ordenados, cola Drive y Tiempos en las cuatro páginas.
- `gemini-availability.cjs`, `ai-recovery-503.cjs`, `stability.cjs` y `regression.cjs`: selección fija, recuperación limitada y permisos/guardados/transporte existentes; sintaxis de JS y scripts HTML. La regresión general completó 29 comprobaciones.

## Apps Script y pendiente real

Esta versión necesita actualizar el backend completo `gas/script.gs` mediante una Nueva versión cuando se autorice el despliegue. Incluye las acciones de comprobación y cierre, el vencimiento efectivo (también después de renovar), códigos explícitos de permisos/servicio de sesiones y el origen de los errores del proxy. Publicar sólo los HTML/JS contra el backend anterior deja el acceso sin poder acreditarse; no se declara una sesión válida por compatibilidad ni se omite la autenticación.

Pendiente: prueba manual contra ese backend actualizado, incluidas las condiciones reales de cookies/canal, cuenta y revocación. La latencia y disponibilidad reales no se han medido en esta entrega. Una revocación en otro dispositivo, sin evento de almacenamiento en este navegador, se detecta en la siguiente solicitud; no se añaden sondeos periódicos.
