# Única comprobación real HTTP — 29 de octubre de 2026

**Resultado: correcto.** Un solo envío por `fetch`, modelo `gemini-3.5-flash-lite`, sin alternativa ni reintentos y sin documentos personales. Apps Script y el proveedor devolvieron HTTP 200. Se validaron la placa y el color de la imagen ficticia sin pendientes de revisión.

Se usaron los clientes del frontend `20261028T161839136537Z` mediante un arnés local temporal separado de la aplicación. Se omitió cargar el puente RPC para garantizar HTTP y se llamó una sola vez al cliente Gemini existente. No se creó otra ronda automática de selección. El generador de la imagen y `buildProbe` son los mismos de referencia: lienzo 520 × 180, texto negro sobre blanco, `PLACA ABC1234` y `COLOR AZUL`, temperatura 0 y máximo de 256 tokens. La respuesta se comprobó con el parser real de la aplicación.

La pestaña de trabajo en Chrome conservaba cargada la versión anterior `20261028T153157569058Z`; no se recargó ni se utilizaron sus tiempos para acreditar la versión nueva. El usuario inició sesión en el formulario compartido del navegador integrado. No se copiaron ni registraron sus credenciales.

## Tiempos reales

| Etapa | Tiempo | Relación |
| --- | ---: | --- |
| Comprobación previa de sesión | 1,871 s; rechazada | Anterior al envío de IA. Backend: 0,386 s. |
| Login posterior | 2,192 s; correcto | Operación separada. Backend: 0,703 s. |
| Preparar imagen y petición ficticias | 0,0394 s | Incluido en el total de comprobación. |
| Solicitud completa, reloj monotónico | 35,6867 s | Incluida en el total. |
| Recepción completa, reloj Date del cliente | 35,688 s | Mide el mismo envío; no sumarlo al renglón anterior. |
| **Apps Script: total antes de devolver** | **34,564 s** | Contiene las seis subetapas siguientes. |
| ↳ Analizar entrada JSON | 0 ms registrados | Resolución de milisegundos; no implica ausencia absoluta de trabajo. |
| ↳ Validar sesión en el backend | 0,514 s | La sesión del envío de IA fue aceptada. |
| ↳ Preparar petición al proveedor | 0,054 s | Construcción del cuerpo y preparación del proxy. |
| ↳ **Llamada externa `UrlFetchApp.fetch`** | **33,991 s** | Transporte, cola y generación juntos; no se pueden separar. |
| ↳ Obtener e interpretar respuesta | 0,004 s | Posterior a la llamada externa. |
| ↳ Otras tareas del proxy | 0,001 s | Resto del total interno. |
| Fuera del backend medido | 1,124 s | Recepción completa menos total del proxy; incluye cola, salida/serialización y transporte. No es red pura. |
| Validar los campos ficticios recibidos | 0,0005 s | Incluido en el total de comprobación. |
| **Total de comprobación, sin login** | **35,7267 s** | Preparación, solicitud y validación; redondeado: 35,727 s. |

El `upstreamMs` compatible con registros anteriores fue **33,995 s**: contiene la llamada externa de 33,991 s y la interpretación de 0,004 s. No se suma de nuevo. El resto antiguo `transportMs` fue 1,693 s e incluye también la preparación y sesión del backend; no debe confundirse con los 1,124 s que quedan fuera del backend nuevo.

La diferencia de unos 1,3 ms entre los relojes Date y performance corresponde a resoluciones/lecturas distintas. Las etapas del backend suman exactamente 34,564 s; ese total más el resto externo coincide con los 35,688 s de recepción del cliente.

## Errores y compatibilidad

- **Ningún error de IA, cuota, proveedor, configuración, HTTP o timeout en este envío.** Resultado remoto completo; referencia correcta.
- La sesión anterior no permitió continuar y se abrió el acceso existente; después del login, la IA sí respondió. El resumen de autenticación conserva resultado y duración, pero no el código preciso del rechazo anterior. No se atribuye a ese rechazo la espera posterior de la llamada externa.
- El backend devolvió `_proxy.timing.version = 1` con todas las etapas: se confirma que la ruta HTTP ejercitada dispone del desglose nuevo. Esto no equivale a verificar por hash todo el código remoto.
- Tokens informados: 1.101 de entrada, 32 de respuesta, 1.133 en total. No se informó `thoughtsTokenCount`; no se supone cero ni se deriva de ello una duración.

## Qué queda demostrado

**Trabajo eliminado:** la reducción RPC de conversiones JSON no se aplica a esta ruta HTTP. En una respuesta JSON normal HTTP mantiene los conteos 2/2 comprobados localmente. La segunda lectura de texto eliminada sólo se ejercía con respuesta no JSON, caso que no ocurrió aquí. El menor prompt de documentos reales tampoco se ejercita con este inicio sintético, cuyo cuerpo ya era breve y no cambió.

**Reducción medida:** esta única llamada acredita tiempos absolutos de las etapas nuevas y su coherencia, **no una reducción de segundos**. No existe una medición previa equivalente del desglose HTTP para calcular el ahorro de cada etapa. Las medianas de CPU locales del canal RPC no se utilizan como evidencia de mejora HTTP.

**Espera externa variable:** 33,991 s concentraron aproximadamente el 95 % del total de la comprobación. No se puede determinar cuánto corresponde a red, cola o inferencia. La referencia anterior fue 22,37 s, con 20,59 s de upstream, por RPC y bajo otras condiciones. La ejecución actual fue más lenta; no se atribuye la diferencia a la optimización ni se declara una mejora de latencia.

Se verificó que el backend local y los 27 archivos del frontend mantienen los SHA-256 del paquete preparado. No se modificó el código de la aplicación, no se ampliaron modelos, no se publicaron archivos ni se desplegó código durante esta comprobación. Se conserva la pestaña con el resultado para revisión y no se enviarán más solicitudes.

Mediciones originales: `comprobacion-http-real-20261029.json`. Evidencia visual sin datos personales: `comprobacion-http-real-20261029.jpg`.
