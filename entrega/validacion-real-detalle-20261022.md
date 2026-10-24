# Validación real — 22 de octubre de 2026

**Conclusión: NECESITA UNA CORRECCIÓN CONCRETA. No publicar todavía.**

Versión probada: `20261022T201444372389Z`. Copia local, sesión existente, Apps Script y Gemini reales; modelo `gemini-3.5-flash-lite`. Los seis HTML y los 16 JS tienen la versión correcta. Los 25 archivos HTML/JS/CSS/backend/versionado comparados siguen idénticos al ZIP candidato. No se modificó código, no se generó otra versión y no se publicó.

## Mediciones reales

Tiempos desde Procesar/Reintentar hasta cerrar la operación. Gemini incluye espera, transporte y respuesta; no separa el cómputo interno del proveedor. Las cifras proceden de Tiempos: total con un decimal, etapas con dos.

| Caso | Total | Gemini | Inicialización OCR | OCR completo¹ | Pasadas OCR OK / fallidas registradas | Pendientes finales |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Primera matrícula, frontal + reverso | 75,6 s | 15,60 s | 2,89 s | 60,0 s | 23 / 1 | 4 |
| Segunda ejecución, mismos archivos | 65,5 s | 5,47 s | 0,17 s | 60,0 s | 8 / 1 | 4 |
| Cancelación durante IA | 5,0 s | 5,00 s hasta cancelar | No ejecutado | No ejecutado | 0 / 0 | 8 |
| Reintento y cancelación durante OCR | 26,1 s | 7,48 s | 0,17 s | 18,6 s | 7 / no registrada² | 3 |
| Reintento completo con manuales | 6,4 s | 6,44 s | No ejecutado | No ejecutado | 0 / 0 | 1 |
| Imagen difícil, primera en otra pestaña | 68,0 s | 7,94 s | 0,17 s | 60,0 s | 14 / 1 | 3 |

¹ Incluye inicialización, preparación interna y pasadas; no sumarlo otra vez al total. La suma de duración de pasadas fue 55,78 s, 59,33 s y 58,46 s en los tres casos sin cancelar; 16,66 s en la cancelación OCR.

² La operación se cierra al cancelar; una pasada en curso puede no llegar a registrarse en ese detalle. Se observaron siete completadas. Los pendientes finales se contaron en el formulario, separados de los objetivos internos del OCR.

La preparación de imagen registrada mostró `0,00 s`, con precisión de centésimas. La ruta de pegado no ofrece una medición separada de toda la preparación IA; no equivale a preparación total nula. La preparación del archivo derivado del PDF ocurrió antes de pulsar Procesar y queda fuera de su tiempo de aplicación.

Las cinco primeras operaciones usaron `google.script.run`; la imagen difícil usó `fetch` de respaldo, HTTP 200. Tras los timeouts se retiró el worker: la segunda ejecución no demuestra reutilización de un worker caliente. El reintento de 6,4 s tenía los códigos críticos confirmados manualmente y el año vaciado; por eso omitió OCR y **no es una mejora comparable de rendimiento**.

## Exactitud y protección

Se contrastaron visualmente las dos caras, especialmente placa, identificación, chasis y motor.

| Caso de extracción | Correctos cotejados | Discrepantes | No concluyentes | Pendientes de la aplicación |
| --- | ---: | ---: | ---: | ---: |
| Primera matrícula | 7 | 1: motor | 1: año | 4 |
| Segunda matrícula | 8 | 0 | 1: año | 4 |
| Imagen difícil | 7 | 1: modelo | 1: año | 3 |

Los pendientes pueden contener valores visualmente correctos: estas columnas se solapan. El año no se puntuó como correcto porque el documento distingue «Año» y «Año modelo», y las ejecuciones alternaron entre ambos para «Año de fabricación». Son resultados por caso, no una tasa general de exactitud.

En la primera ejecución, una lectura correcta de IA del motor terminó sustituida por el encabezado de una columna vecina, «RAMV / CPN». El campo siguió en revisión, pero la sugerencia mostrada fue incorrecta. En el caso difícil, los cuatro códigos críticos coincidieron con el original revisado y tres conservaron revisión; el modelo discrepó de la lectura cotejada en el original.

Las diferencias entre el CUV y la matrícula cargados permanecieron resaltadas. Correspondían a vehículos distintos: no se contabilizaron como errores de extracción. No se aportó un caso real con dos identificaciones distintas del mismo rol dentro del documento; esa comprobación continúa respaldada por las regresiones sintéticas previas.

La cancelación IA conservó las dos imágenes y los campos manuales, incluido uno vaciado, sin cambios durante 72 s de observación. Tras cancelar OCR se conservaron igualmente y no cambiaron durante 52 s. El reintento posterior completó IA, conservó tres valores manuales y el vacío, y dejó ese vacío pendiente. Esto comprueba la protección del cliente; no certifica que Google detuviera una ejecución ya enviada.

## Corrección necesaria y límites

1. **Parser/fusión del motor:** respetar límites de columnas y excluir encabezados como valores. Una contradicción detectada debe conservar su motivo de revisión entre fusiones, sin reemplazar la lectura correcta ni convertirla después en confirmación OCR. El contraejemplo sintético con parser y fusión reales reprodujo el defecto sin datos personales; está separado de las mediciones anteriores.
2. **Ambigüedades:** definir el criterio de año de fabricación frente a año/modelo y conservar revisión cuando una lectura del modelo no sea fiable.
3. **Demora localizada:** las tres extracciones sin cancelación agotaron los 60 s de OCR. Se observaron canvases de aproximadamente 5,27 y 8,00 millones de píxeles y muchas variantes. Antes de ajustar escala, orientación o criterios de salida hace falta comparar acierto con estas muestras; no se aumentaron timeouts ni se recortaron pasadas por una demora aislada.

El PDF autorizado tiene una página escaneada y cero caracteres de texto digital: **no es mixto**. Para el caso difícil se extrajo su imagen embebida y se mantuvo la orientación de 90 grados de la página mediante una rotación exacta, sin reescalado ni pérdida de píxeles; se omitió sólo el margen blanco del papel. La interfaz de matrícula admite pegado de imágenes: esta ejecución no prueba la ruta PDF nativa. Sigue pendiente un PDF mixto autorizado y su prueba en el tipo documental apropiado.

Los diagnósticos guardan tiempos, metadatos, cantidades y comprobaciones booleanas; no incluyen imágenes documentales, valores de campos, texto de documentos ni credenciales. La captura de evidencia se limita al panel de Tiempos. No se exportaron los borradores del usuario.

Evidencias de esta entrega:

- `validacion-real-mediciones-20261022.json`: detalles leídos de la interfaz, sin contenido documental.
- `validacion-real-resumen-20261022.json`: cifras por caso y comprobaciones.
- `validacion-real-contraejemplo-sintetico-20261022.json`: reproducción sintética del defecto; no es una medición real.
- `validacion-real-estructura-pdf-20261022.json` y `validacion-real-integridad-20261022.json`: estructura del PDF e integridad de la versión.
- `validacion-real-tiempos-20261022.jpg`: captura del panel de mediciones.