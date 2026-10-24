# Corrección puntual de la comparación de CHASIS

Versión para revisión: **20261023T231244435655Z**. Sin publicar ni desplegar. Sin consultas reales a Gemini.

## Qué se pudo confirmar

No se recibió la captura ni los valores originales y la sesión ya estaba cerrada. Por tanto, no se atribuye el caso concreto a caracteres invisibles ni se afirma haber reproducido esa sesión. Antes del cambio, tres cadenas idénticas de prueba ya coincidían; espacios y los caracteres invisibles ensayados tampoco provocaban una discrepancia.

Sí se reprodujeron dos defectos:

1. **Marcado global aplicado a cada documento.** Con dos chasis iguales y uno distinto, `computarValidaciones` incluía a los tres entre los sospechosos y la vista mostraba «Valor diferente» en todos. Ahora los dos coincidentes se identifican como tales y se señala el distinto. El aviso global se mantiene mientras exista esa diferencia real; no se elige ni se impone el valor mayoritario.
2. **Confirmación que podía conservar un valor anterior.** El botón «Confirmar el campo revisado» consultaba el formulario principal, confiando en que el editor del cuadro hubiese disparado `input`. Una prueba con el valor visible corregido y sin ese evento confirmó que se guardaba el valor anterior. Ahora confirmar o aplicar sincroniza los valores visibles con los campos canónicos mediante la edición existente y recalcula la comparación. Las demás correcciones permanecen.

La edición de `chasis` y `serialChasis` recalcula inmediatamente la validación, sin esperar los 350 ms del resto de campos. Se limpian las marcas de discrepancia resuelta.

Se separó la clave de comparación de chasis de la normalización general de nombres y textos: sólo se ignoran diferencias de caja ASCII, espacios y marcas de formato invisibles; se conserva la identidad de letras, cifras y signos. La clave nunca se escribe sobre el dato original. No se convierten O/0, I/1 ni otros caracteres parecidos. Los datos ausentes y las contradicciones internas pendientes conservan su tratamiento existente.

## Comprobaciones locales

- `tests/cross-chassis.cjs`: tres iguales sin discrepancia; un chasis con una cifra diferente identificado; corrección manual que iguala y elimina la discrepancia anterior. También comprueba originales intactos, formato invisible y diferencias reales sin sustitución de caracteres.
- `tests/validation-focused.cjs`: los tres casos en el DOM real de Contratos, acceso al respaldo correcto, confirmación de una edición visible sin `input`, recálculo inmediato, marcas antiguas eliminadas y conservación de otras ediciones. El contador total de consultas simuladas de IA no aumentó por abrir, editar o confirmar respaldos. Conserva las regresiones existentes de puntos del modelo, cancelación y reintentos; la pausa del selector se avanza con un reloj ficticio.
- `tests/contract-normalization.cjs`: normalizaciones y comparaciones existentes, incluidos puntos del modelo, Ñ, ausencias y diferencias reales.

Todas finalizaron satisfactoriamente. Los documentos y servicios empleados fueron ficticios/interceptados. No se cambiaron los archivos de selección de IA, cliente Gemini, transporte, extracción, CUV ni Apps Script. La interfaz y los controles existentes se conservan. Los HTML y referencias JS llevan la nueva versión para evitar cachés mezcladas.
