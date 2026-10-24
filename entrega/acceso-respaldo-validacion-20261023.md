# Acceso al respaldo desde la validación cruzada

Versión para revisión: **20261023T155603656354Z**. Sin publicar ni desplegar.

Se añadió «Ver documento de respaldo» junto a cada valor discrepante y cada «Pendiente: no detectado» de los documentos cargados. Abre el mismo cuadro existente con el respaldo de ese documento y el campo correspondiente enfocado. Los campos compuestos enfocan el componente ausente.

Se reutilizan `verRespaldoContrato`, la edición y el recálculo existentes. Aplicar la corrección actualiza la validación cruzada y conserva las demás ediciones, incluidos los vacíos manuales. No se cambió la extracción, el procesamiento documental ni Apps Script. No requiere modificar el backend.

Comprobación local satisfactoria con `tests/validation-focused.cjs`, en Edge sin interfaz y con documentos ficticios y servicios interceptados:

- Discrepancias: cada botón de Motor abre su propio respaldo de Matrícula o CUV; se verificaron las imágenes y el campo enfocado.
- Ausencias: Modelo vacío abre el respaldo CUV; se conserva el vacío manual al cerrar y la corrección anterior de Motor al editar otro campo.
- Correspondencia de campos: Motor, Chasis e identificación de Notaría abren sus campos internos correctos; un nombre incompleto en Cédula enfoca Nombres.
- Al coincidir los datos desaparecen los accesos de discrepancia; al corregir todos los pendientes se completa la validación.
- Las aperturas y correcciones no aumentaron las consultas simuladas de extracción. Se conservaron las comprobaciones existentes de puntos del modelo, guardado, cancelación, respuestas tardías y campos manuales. Sin ejecución de Tesseract ni errores de JavaScript.

No se hicieron consultas reales a Gemini ni se utilizaron documentos personales en estas comprobaciones. Queda la revisión manual de este acceso en el entorno del usuario. Los HTML y las referencias JS llevan la nueva versión para evitar caché antigua.
