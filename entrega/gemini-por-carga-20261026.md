# Gemini: una selección por carga de página

Versión para revisión: **20261026T170606545650Z**. Preparada localmente, sin publicar ni desplegar. No se hicieron consultas reales a Gemini.

## Cambio limitado a la selección y comprobación

- Únicos candidatos: **Gemini 3.5 Flash Lite** (`gemini-3.5-flash-lite`) y **Gemini 3.1 Flash Lite** (`gemini-3.1-flash-lite`), en ese orden. La ronda inicial conserva la prueba de imagen y respuesta estructurada existentes; no declara disponible un modelo sin una respuesta válida.
- Una sola ronda inicial por carga de página, con solicitudes concurrentes agrupadas. Si un candidato falla y el error permite continuar, se prueba el otro. Si ninguno puede procesar, la barra existente avisa y la carga que requiere IA permanece bloqueada. CUV sigue disponible localmente.
- La selección elegida no caduca ni cambia durante esa carga. Se retiraron el temporizador de renovación y las comprobaciones de disponibilidad previas a cada documento. Iniciar validaciones, editar campos, consultar respaldos o volver a la pestaña sólo reutiliza el estado local.
- Durante la lectura no hay selección de alternativas. Los reintentos usan el mismo modelo y el mismo cuerpo preparado; se conservan las esperas progresivas, `Retry-After`, la cancelación, el presupuesto de solicitudes y el plazo acumulado. Por defecto son como máximo tres envíos documentales dentro de los 45 segundos del tramo IA; una espera indicada que no cabe en ese plazo detiene la recuperación.
- Un error posterior no borra la selección. Al agotarse la recuperación o ante un error no recuperable se detiene el lote, conservando los documentos, resultados y correcciones y distinguiendo lo fallido de lo aún no intentado. No se comprueba ni se utiliza un tercer modelo, tampoco durante la recuperación.
- Se sustituyó la vigilancia periódica de la sesión por eventos internos de autenticación y almacenamiento. Cambiar de sesión sigue invalidando las respuestas antiguas sin reiniciar la selección. Si al abrir la página todavía no había sesión, se espera a ella para realizar únicamente la primera comprobación autorizada.

Se conserva la interfaz existente, sin controles nuevos. Los cambios funcionales están en `contratos.html`, `js/gemini-availability.js` y un evento interno de `js/auth-ui.js`. README y pruebas se actualizaron a esta política. **Apps Script no cambia ni requiere un nuevo despliegue para esta corrección**: el proxy recibe el mismo modelo explícito, y el controlador restringe y fija ese modelo antes de cualquier envío HTTP o RPC.

## Comprobaciones locales satisfactorias

- Primera elección de A; primera elección de B si A no puede procesar. Todos los documentos posteriores utilizan el elegido.
- Paso del tiempo, llamadas repetidas y cambios de visibilidad: ninguna comprobación adicional. Ambos candidatos agotados: como máximo sus dos pruebas iniciales, sin nuevas rondas.
- Una nueva carga puede seleccionar A aunque la anterior utilizara B.
- HTTP 503 → reintentos con el mismo modelo → continuación con Notaría. Fallo persistente: límite respetado, sin alternativa ni comprobación nueva.
- Cuota posterior, modelo no disponible, respuesta inválida, tiempo agotado y cancelación: selección conservada y errores diferenciados. Una autorización de otro modelo, incluido el otro candidato no seleccionado, no puede sustituir la elección fijada.
- Se conservaron frontal/reverso de Matrícula, CUV local, ausencia de Tesseract, archivos retenidos, valores manuales vacíos, respuesta tardía descartada, puntos del modelo, revisión con imagen, pendientes identificados y orden de los bloques.

Pruebas ejecutadas: `gemini-availability.cjs`, `ai-selection-regression.cjs`, `ai-recovery-503.cjs`, `ai-latency.cjs`, `processing-browser.cjs`, `validation-recovery-503.cjs`, `validation-focused.cjs` y `validation-pending.cjs`.

Son pruebas con documentos ficticios y servicios interceptados; no son mediciones ni comprobaciones de la cuota actual de la cuenta real. Queda pendiente la revisión manual de esta entrega. El ZIP incluye versión uniforme, informe y pruebas; se comprobó su integridad y coincidencia con los archivos locales.
