# Coherencia de pendientes y generación de contratos

Versión para revisión: **20261026T164408801051Z**. Sin publicar ni desplegar. No requiere cambios en Apps Script.

## Causas comprobadas

- Se reprodujo una marca antigua de `_processingIncomplete` que seguía bloqueando después de que las coincidencias resolvieran la última revisión. Ahora se elimina en ese caso únicamente si no quedan campos obligatorios pendientes y el documento no está procesándose. Una lectura realmente interrumpida sin esa confirmación conserva su bloqueo y se identifica por documento.
- Las filas cruzadas sólo comparaban parte de los campos obligatorios. Por eso podían coincidir todas mientras, por ejemplo, faltaba el código dactilar de la cédula. El aviso genérico no mostraba ese campo. La reproducción utilizó un dato extraído ausente, sin atribuir la causa a una edición manual.
- Las revisiones internas podían conservar un valor de formato válido y presentar su fuente en verde. Además, el aviso sólo se preparaba al terminar el lote y permanecía desactualizado después de corregir los campos.

## Corrección

La lista vigente de pendientes se usa para las marcas de los campos, las fuentes de la validación cruzada, las cabeceras de documentos, el aviso existente y la habilitación de acciones. El aviso identifica campo, documento y motivo e incluye el acceso al mismo cuadro de respaldo. Permanece consultable hasta resolver los pendientes o cerrarlo.

La edición recalcula inmediatamente sin debounce, recarga ni consultas a IA. Al resolver un campo se retiran sus marcas anteriores; al resolver el último bloqueo desaparece el aviso y aparecen las acciones. Se conservan los valores manuales, incluidos los vacíos obligatorios, que se explican como pendientes. Los campos condicionales de Notaría y los documentos que no corresponden al flujo no bloquean.

Se conserva el orden «Generar Contratos» → «Validación terminada», junto con sus funciones y la transferencia a Liquidación. El cambio funcional se limita a `contratos.html`; los demás HTML sólo actualizan la versión de recursos.

## Comprobaciones locales

`tests/validation-pending.cjs` reproduce y verifica:

1. Datos completos, con marcas antiguas de `_missing` y campos condicionales vacíos: validación completa.
2. Campo obligatorio ausente fuera de las filas comparadas: identificado con nombre, documento, motivo y acceso al respaldo.
3. Corrección válida: habilitación inmediata y limpieza del aviso, conservando las demás ediciones.
4. Revisión interna con valores iguales: fuente pendiente, sin falsa diferencia; confirmar elimina la revisión sin alterar el identificador.
5. Vacío obligatorio manual y formato inválido: pendientes visibles hasta corregirlos.
6. Última revisión resuelta por coincidencia: se limpia el estado incompleto anterior. Una lectura realmente incompleta y un documento obligatorio ausente siguen bloqueados e identificados.
7. Diferencia real: bloqueo hasta igualar los valores. Orden de bloques, puntos del modelo y datos manuales conservados.

También fueron satisfactorias `validation-actions.cjs`, `validation-focused.cjs`, `validation-recovery-503.cjs`, `contract-pipeline.cjs` y `cross-chassis.cjs`. Se conservaron cancelación, protección frente a respuestas tardías, recuperación limitada ante 503, distinción entre documento fallido y aún no intentado y flujo sin Tesseract.

Todas las pruebas utilizaron documentos ficticios y red interceptada. La prueba específica de pendientes hizo cero extracciones y reutilizó una única comprobación inicial simulada. No se enviaron documentos ni consultas reales a Gemini; no son mediciones del backend real. La captura `pendiente-identificado-20261026.png` contiene únicamente datos ficticios.

Resultado: preparada para revisión manual. ZIP verificado con versión uniforme, integridad, ausencia de entradas duplicadas y coincidencia de sus archivos con el proyecto local.
