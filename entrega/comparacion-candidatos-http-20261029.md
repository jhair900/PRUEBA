# Comparación aislada de candidatos — 29 de octubre de 2026

**Se realizaron exactamente dos envíos nuevos: uno a Gemini 3.8 Flash y uno a Gemini 3.6 Flash. Ambos devolvieron 503 por alta demanda.** Sin reintentos, sin timeouts ni documentos personales. No se incorporó ningún candidato a producción.

| Modelo | Total sin login | Llamada externa | HTTP Apps Script / proveedor | Lectura y exactitud |
| --- | ---: | ---: | --- | --- |
| Gemini 3.5 Flash Lite, referencia HTTP anterior | 35,727 s | 33,991 s | 200 / 200 | Referencia ficticia correcta |
| Gemini 3.8 Flash, una muestra | 5,676 s | 3,328 s | 200 / 503 `UNAVAILABLE` | No evaluable: no se obtuvo extracción |
| Gemini 3.6 Flash, una muestra | 4,466 s | 2,517 s | 200 / 503 `UNAVAILABLE` | No evaluable: no se obtuvo extracción |

Los tiempos de los candidatos miden **respuestas de error**, no extracciones correctas más rápidas. No deben interpretarse como una mejora frente a los 35,727 s de la referencia. No se utilizó la referencia anterior por RPC.

## Error real y secuencia

Los dos proveedores respondieron con el mismo mensaje:

> This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.

Origen `provider`, estado `UNAVAILABLE`, HTTP 503 del proxy y HTTP 200 del transporte a Apps Script. No es una clasificación por falta de cuota ni por sesión de usuario. Los resultados remotos quedaron **completamente confirmados**, no desconocidos.

La prueba fue secuencial. Después del 503 completo de 3.8 se envió 3.6 una sola vez. No hubo una solicitud posterior para intentar conseguir un resultado mejor. Si el primer resultado hubiera quedado desconocido por timeout, no se habría iniciado el segundo.

Antes de 3.8, la sesión previa requirió ingreso del usuario. El login correcto tardó 1,837 s y queda fuera del total de IA. Antes de 3.6, la sesión se comprobó correctamente en 1,639 s, también fuera del total. Cada llamada Gemini validó además su sesión en el backend existente; sus duraciones están incluidas en el desglose siguiente.

## Desglose sin doble conteo

| Etapa | 3.8 Flash | 3.6 Flash |
| --- | ---: | ---: |
| Preparar imagen y petición ficticias | 0,0106 s | 0,007 s |
| Sesión dentro del backend | 0,344 s | 0,475 s |
| Preparar petición al proveedor | 0,032 s | 0,081 s |
| Llamada externa `UrlFetchApp.fetch` | 3,328 s | 2,517 s |
| Leer/interpretar respuesta del proveedor | 0,001 s | 0,001 s |
| Otras tareas del proxy | 0,001 s | 0 ms registrados |
| **Total del backend** | **3,706 s** | **3,074 s** |
| Fuera del backend medido | 1,958 s | 1,384 s |

Los totales del backend contienen sus subetapas. El resto incluye cola, transferencia y salida del servidor; no es exclusivamente red. La llamada externa mezcla transporte, cola y procesamiento remotos. Las diferencias de pocos milisegundos entre relojes Date/performance no se presentan como ahorro.

## Aislamiento y parámetros

La restricción de producción está en el controlador de selección, que mantiene sólo `gemini-3.5-flash-lite` y `gemini-3.1-flash-lite`. El proxy autenticado y el cliente HTTP de bajo nivel permitían esta prueba explícita sin modificar esa lista. Los arneses temporales, separados en `.codex/`, no crean un controlador de selección ni cargan el puente RPC. Usan los clientes actuales y el backend actualizado; ambos resultados recibieron `_proxy.timing.version = 1`.

Se mantuvieron el generador de imagen de referencia (520 × 180, placa ABC1234 y color AZUL), los campos esperados, el prompt, temperatura 0, máximo de 256 tokens, `application/json` y el mismo esquema de placa, color y `_reviewKeys`. El límite local siguió siendo 45 s. Sólo cambió el modelo solicitado.

La documentación oficial de [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) y [Gemini 3.6 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash) confirma entradas de imagen y salida estructurada. Se revisaron también los parámetros de [generateContent](https://ai.google.dev/api/generate-content) y los [esquemas JSON](https://ai.google.dev/gemini-api/docs/structured-output). No se añadió `thinkingConfig`: 3.8 no admite `minimal`, y la petición de referencia no lo envía. Se conservaron los valores predeterminados del servicio, que pueden diferir entre modelos.

Los 503 impidieron confirmar la compatibilidad mediante una **generación satisfactoria**, la exactitud de los campos y la suficiencia del presupuesto de salida para cada candidato. No se recibió un error `INVALID_ARGUMENT`, pero eso no prueba por sí solo que todos los parámetros se hayan validado antes del rechazo por demanda. No se cambiaron parámetros para repetir la prueba.

## Conclusión para decidir

Esta comparación **no acredita una alternativa disponible ni más rápida**: ambos candidatos fallaron temporalmente en su única muestra. Tampoco demuestra indisponibilidad permanente. No hay evidencia suficiente para incorporarlos por rapidez o calidad a partir de estos resultados.

Se verificaron los SHA-256 del backend local y los 27 archivos de frontend frente al paquete: sin cambios. No se tocó el modelo seleccionado en la página de trabajo, ni se modificó la interfaz de la aplicación, ni se publicó o desplegó código. La lista de producción conserva exclusivamente los dos Flash Lite.

Resultados originales: `candidato-gemini-38-http-20261029.json` y `candidato-gemini-36-http-20261029.json`. Comparación resumida: `comparacion-candidatos-http-20261029.json`. Evidencias visuales: los JPG con el mismo nombre de cada candidato.
