# Acciones al completar la validación cruzada

Versión para revisión: **20261026T145527836395Z**. Preparada localmente, sin publicar ni desplegar. No se consultó Gemini ni se usaron documentos reales.

## Causas y corrección

1. La lectura de un archivo dentro de «Procesar y validar» invalidaba también el estado que identifica una validación solicitada. El lote podía terminar correctamente, pero la siguiente edición manual ocultaba los bloques y ya no recalculaba su habilitación. Ahora la lectura dentro del lote conserva ese estado; cargar o reemplazar un documento nuevo sigue invalidando la validación anterior.
2. Al corregir Notaría, la marca de procesamiento incompleto sólo se eliminaba si estaban completos todos sus campos, incluidos los condicionales. Ahora se usan los mismos campos obligatorios que exige la validación. Los campos condicionales ausentes permanecen vacíos y registrados en el diagnóstico, sin convertirse en un bloqueo obligatorio.
3. Ambos bloques consultan el resultado vigente y se actualizan también al finalizar el lote. Se mantienen ocultos mientras se procesa, cuando falta un documento obligatorio o cuando existen diferencias o campos obligatorios pendientes.
4. Se movieron los bloques completos: primero «Generar Contratos» y después «Validación terminada». Se comprobó que su HTML, textos, estilos y manejadores permanecen idénticos, salvo la posición. No se cambiaron las funciones de generación, guardado o transferencia a Liquidación.

## Comprobaciones locales puntuales

- `tests/validation-actions.cjs`: el caso con archivo de Notaría reprodujo el fallo antes de la corrección. Tras corregirlo, ambos bloques aparecen al terminar la validación y vuelven a aparecer al resolver una diferencia desde el cuadro de respaldo.
- Se comprobó el bloqueo por una diferencia real, por un campo obligatorio vaciado manualmente y por un documento obligatorio ausente. Los campos condicionales vacíos de Notaría y los documentos de cónyuge/RUC que no corresponden al flujo de persona natural soltera no bloquean.
- Las correcciones manuales se conservaron y ninguna edición o actualización de visibilidad inició comprobaciones ni extracciones de IA.
- Se verificaron el orden visual y en el DOM, la apertura del generador y el contenido de la transferencia a Liquidación, incluido el modelo con puntos. La página de destino y las respuestas de IA fueron interceptadas; no hubo guardados externos.
- `tests/validation-focused.cjs` y `tests/cross-chassis.cjs`: satisfactorias. Se conservaron las comparaciones, los puntos del modelo, la revisión con imagen, los valores manuales vacíos, la cancelación y la protección contra respuestas tardías. Sin Tesseract ni errores de JavaScript.
- Paquete verificado: versión uniforme en HTML y recursos JS, integridad del ZIP y coincidencia de los archivos incluidos con el proyecto local.

Estas comprobaciones utilizan documentos ficticios y servicios simulados; no constituyen mediciones ni una nueva validación del backend real. Queda pendiente únicamente la revisión manual de esta entrega. No se modificó Apps Script y no hace falta desplegarlo para este cambio.
