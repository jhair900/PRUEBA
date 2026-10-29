# Actualización preparada y comprobación única por HTTP

Versión de aplicación: `20261028T161839136537Z`. No se ha publicado ni desplegado. Esta guía prepara una actualización posterior; no implica que ya se haya aplicado al servicio activo.

## Qué cambia en HTTP/fetch

| Cambio | HTTP/fetch | Canal directo/RPC |
| --- | --- | --- |
| Eliminar conversiones JSON del puente RPC | No se aplica. Una respuesta JSON válida conserva 2 serializaciones y 2 análisis explícitos en el backend. | Pasa de 4/4 a 1/1. Las mediciones de CPU anteriores pertenecían sólo a esta ruta. |
| Criterios de extracción repetidos | Se elimina su copia del prompt; quedan íntegros en el esquema. | Igual. |
| Petición sintética inicial | Sin cambios de imagen, texto, esquema ni límite de salida frente a la referencia de 22,37 s. | Igual. |
| Obtener el texto de respuesta dos veces | Se elimina sólo en la rama de respuesta no JSON. En una respuesta JSON normal ya se leía una vez. | Igual. |
| Desglose de tiempos y contadores | Sí: entrada JSON, sesión, preparación, llamada externa, interpretación, recepción completa y validación local. | Igual, salvo que no necesita analizar la entrada HTTP. |

La comprobación local específica de HTTP comparó el mismo cuerpo ficticio y la misma respuesta: una sola llamada al proveedor en ambas versiones, cuerpo Gemini idéntico, mismo resultado y conteos 2/2 antes y después. La imagen/cuerpo de comprobación inicial se conservaron. Es una simulación sin red, no una medición de ahorro en Apps Script. Resultado: `verificacion-http-20261028.json`.

No hay todavía una reducción de segundos demostrada en HTTP. La reducción del prompt documental tampoco se ejercita en la comprobación inicial, que utiliza su propio prompt breve. Se mantienen exclusivamente Gemini 3.5 Flash Lite y Gemini 3.1 Flash Lite, selección inicial única, modelo fijo e interfaz existente.

## Archivos que deben acompañarse

Para evitar suponer qué cambios anteriores tiene GitHub, el conjunto recomendado de frontend es:

- `contratos.html`, `firmas.html`, `index.html`, `liquidacion.html`, `pagos.html`, `ventas.html`.
- **La carpeta `js/` completa del paquete**, con sus 20 archivos. No mezclarla con archivos de otras entregas. Entre los cambios de esta optimización están `document-extraction.js`, `gemini-client.js`, `gemini-availability.js` y `workflow.js`.
- `version.json`, con `20261028T161839136537Z`.

Los seis HTML ya referencian los recursos locales JS/CSS con ese mismo identificador. `assets/` y `templates/` no cambiaron en esta optimización; el paquete también conserva sus archivos. La configuración `js/api-config.js` debe conservar la URL `/exec` de la implementación existente. No cambian la clave Gemini, las hojas ni los permisos.

El backend que corresponde a este conjunto es el **contenido completo** de `gas/script.gs` del mismo paquete. No copiar sólo `geminiProxyResult_`, ni añadir un segundo doPost/doGet o una copia duplicada del backend.

Se incluye `manifest-actualizacion-http-20261028.json` con los nombres, tamaños y SHA-256 del backend y los 27 archivos de frontend. Esto identifica el material local preparado; no certifica qué versión está activa en Google o GitHub.

## Pasos exactos para Apps Script cuando se aplique la actualización

1. En la hoja de cálculo que ya usa AUTOCOR, abre **Extensiones → Apps Script**. Usa el proyecto existente vinculado a esa hoja; no crees uno nuevo.
2. En **Implementar → Gestionar implementaciones**, identifica la aplicación web cuya URL termina en `/exec` y coincide con `js/api-config.js`. Anota la versión actual para poder volver a ella si hiciera falta. No cambies esa URL.
3. En el editor, reemplaza el archivo que contiene el backend actual por **todo** el contenido de `gas/script.gs` de esta entrega. Si el proyecto está dividido en archivos, evita dejar definiciones duplicadas de las funciones que reemplazas. Conserva el manifiesto y las propiedades del proyecto, incluida `GEMINI_API_KEY`; no las copies al frontend.
4. **Guarda** el proyecto. Guardar por sí solo no actualiza el código servido por la URL de una implementación con versión.
5. Ve a **Implementar → Gestionar implementaciones**, selecciona **esa misma implementación** y pulsa el lápiz **Editar**.
6. En **Versión**, elige **Nueva versión**. Como descripción puedes usar `AUTOCOR 20261028T161839136537Z — desglose HTTP y proxy`. Conserva la identidad de ejecución y el acceso que ya tiene esa implementación.
7. Pulsa **Implementar**. Si Google pide autorizar los permisos existentes, complétalo desde tu cuenta; no compartas contraseñas ni claves. Comprueba que la URL `/exec` siga siendo la misma. No crees una implementación nueva ni uses `/dev` como si fuera el backend público.

Estos pasos se basan en la [gestión oficial de implementaciones](https://developers.google.com/apps-script/concepts/deployments): editar una implementación para que use una versión nueva mantiene su URL. Aquí no se ejecutó ninguno de estos pasos remotos.

## Preparación del frontend y de la prueba sin publicar GitHub

1. Mantén la pestaña de trabajo original abierta, con sus documentos y correcciones. No la recargues para esta prueba.
2. Usa los archivos preparados de esta entrega en el servidor local. No hace falta publicarlos en GitHub para probarlos contra el backend real ya actualizado.
3. Para la única comprobación, se utilizará una pestaña/contexto de prueba aislado con el frontend actualizado. Si necesita autenticación, ingresarás mediante el formulario existente. La autenticación se comprobará antes de enviar la petición ficticia; no se registrarán sus credenciales.
4. Confirma que el backend ya se actualizó antes de abrir/iniciar esa nueva comprobación. Cada carga de Contratos puede iniciar su ronda automática; no abrir varias pestañas nuevas, recargar repetidamente ni pulsar validaciones adicionales para probar.
5. Al publicar posteriormente, acompaña el backend con el conjunto de frontend descrito arriba. No publicar ahora; primero queda pendiente la comprobación real autorizada.

## Única comprobación real pendiente

Estado actual: **pendiente de actualización del backend; cero solicitudes reales nuevas**.

- Modelo de referencia: **`gemini-3.5-flash-lite`**. No se cambiará a 3.1 para presentar otro modelo como una comparación equivalente.
- Imagen: el mismo generador de referencia, lienzo blanco **520 × 180**, texto negro `bold 36px sans-serif`, `PLACA ABC1234` en (24,65) y `COLOR AZUL` en (24,130). Mismo `buildProbe`, esquema, temperatura 0 y máximo de 256 tokens. No se cargarán documentos personales.
- Canal de la comprobación: **fetch HTTP**, sin envío paralelo por RPC ni selección/reintento añadido. Un solo envío al proveedor. Si falla o vence el plazo, se conservará ese resultado y no se repetirá para buscar un tiempo mejor.
- Se comprobará el canal realmente usado y la presencia de `_proxy.timing.version === 1` y sus etapas. Una respuesta sin ellas no acredita que el backend nuevo esté sirviendo la ruta ejercida. La ausencia del canal directo no será clasificada como un fallo de HTTP si fetch responde correctamente.
- Se verificará JSON válido, `placa === 'ABC1234'`, `color === 'AZUL'`, sin `_reviewKeys` pendientes, y se registrarán estados HTTP exterior/proveedor y el motivo si falla. No se declarará disponibilidad si no hay respuesta utilizable.

La referencia de **22,37 s / 20,59 s** utilizó RPC; se conservará como antecedente, **no como línea base equivalente de HTTP**. Una sola solicitud HTTP posterior permitirá medir y comprobar el desglose, no estimar una reducción causal total. Los registros HTTP anteriores sólo se compararán en los alcances que realmente compartan.

## Separación de resultados al cerrar la comprobación

1. **Trabajo eliminado:** criterios duplicados en documentos; segunda obtención de texto en la rama no JSON. La optimización de conversiones RPC se informará por separado.
2. **Etapas locales/backend medidas:** preparación, recepción completa, validación local y las etapas numéricas nuevas del proxy. Los números de un reloj simulado no se presentarán como tiempos de Google. Para afirmar una reducción se necesita una referencia comparable de esa misma etapa.
3. **Llamada externa:** `providerFetchMs` contiene red, cola y generación; puede variar. `providerDecodeMs` mide la obtención/interpretación posterior. `upstreamMs` contiene ambas y no se suma otra vez. Tampoco se suma `serverMs` a sus subetapas ni se trata el resto del trayecto como red pura.

No se ha añadido ni modificado código de la aplicación para preparar esta guía. El paquete contiene exactamente los mismos archivos de aplicación que la entrega anterior de esta versión, junto con instrucciones, manifiesto y verificación HTTP.
