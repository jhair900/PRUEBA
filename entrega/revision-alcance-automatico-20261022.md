# Corrección de alcance: Gemini automático

Versión local: `20261022T220355280100Z`. Preparada para revisión; sin publicar ni desplegar.

Se retiraron el selector manual de Gemini, el botón de comprobación manual, la modalidad añadida de edición manual, el control PDF/imagen de Matrícula, los textos técnicos visibles y el visor adicional de páginas PDF. Los apartados, controles de carga originales, frontal/reverso de Matrícula y edición de campos existente se conservan. El procesador CUV es idéntico al anterior y sigue siendo local.

La comprobación de IA es automática antes de incorporar documentos y al vencer su vigencia. Comprueba una generación sintética con imagen y esquema, por la sesión y proxy habituales. Si una alternativa agota cuota, sigue con las restantes; por defecto considera los seis modelos configurados, sin detenerse después de los primeros tres. La extracción usa el modelo que ha respondido satisfactoriamente. Si no puede procesar, avisa en la barra existente y vuelve a comprobar automáticamente, respetando la espera del servicio. No se añaden decisiones para los usuarios ni se reserva cuota.

Tesseract no se descarga ni se ejecuta. Permanecen las protecciones de cancelación, respuestas tardías, contradicciones y campos manuales, incluidos vacíos. Se conservan archivos y datos si una cuota se agota después de la comprobación.

Verificación local: sintaxis JavaScript, seis suites afectadas con respuestas y documentos ficticios, comparación de controles con la interfaz anterior y coincidencia de versiones HTML/JS. Resultado: satisfactorio. Se comprobó bloqueo de archivo, pegado y arrastre sin IA, recuperación y renovación automáticas, selección efectiva de la alternativa aprobada, cancelación/reintento y ausencia de Tesseract. Estos resultados no son mediciones del backend real.

No se reanudaron las pruebas reales ni se enviaron documentos a Gemini en esta corrección. Su validación continúa pendiente por indicación del usuario. Tampoco se afirma una reducción concreta de segundos a partir de simulaciones.

Esta corrección no vuelve a modificar Apps Script. El paquete completo conserva la actualización pendiente de la entrega anterior en `gas/script.gs` (listado completo y metadatos del proxy). Antes de publicar el paquete completo se debe actualizar el script íntegro y crear una nueva versión de la implementación existente. No se ha hecho ningún despliegue.

Archivos de revisión: `revision/comprobaciones.json`, `revision/integridad.json`, `revision/interfaz.png` (imagen de una simulación, sin documentos reales) y las pruebas afectadas en `tests/`.
