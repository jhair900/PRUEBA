# Validación con backend real — 22/10/2026

**Conclusión: NECESITA UNA CORRECCIÓN CONCRETA antes de publicar.**

Versión `20261022T201444372389Z`, sin cambios de código ni publicación. Se verificaron los seis HTML y los 16 JS y su coincidencia con el ZIP candidato. Se usó la sesión existente y Gemini 3.5 Flash Lite real; canal directo en las cinco primeras operaciones y HTTP de respaldo en el caso difícil.

| Caso | Total | Espera/respuesta IA | Inicio OCR | Pasadas OK / fallidas | Duración de pasadas | Pendientes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Primera matrícula, ambas caras | 75,6 s | 15,60 s | 2,89 s | 23 / 1 | 55,78 s | 4 |
| Repetición, mismos archivos | 65,5 s | 5,47 s | 0,17 s | 8 / 1 | 59,33 s | 4 |
| Imagen difícil, nueva pestaña | 68,0 s | 7,94 s | 0,17 s | 14 / 1 | 58,46 s | 3 |

El OCR completo consumió **60 s en los tres casos**, incluyendo inicialización y preparación interna. La preparación de imagen visible marcó 0,00 s; toda la preparación IA no está instrumentada por separado en la ruta de pegado. Los tiempos de IA incluyen transporte y respuesta, no distinguen cómputo interno de Gemini. Tras un timeout se recrea el worker: no se trata de una comparación con worker caliente.

Contraste visual de los nueve campos con el original:

- Primera matrícula: 7 correctos, 1 discrepante (motor), 1 no concluyente (año).
- Repetición: 8 correctos, 0 discrepantes, 1 no concluyente (año).
- Imagen difícil: 7 correctos, 1 discrepante (modelo), 1 no concluyente (año). Los cuatro códigos críticos coincidieron con el original y tres conservaron revisión.

Los pendientes pueden contener valores correctos: esas cantidades se solapan. Las diferencias con el CUV de otro vehículo se mantuvieron señaladas y no se contaron como errores de extracción.

**Defecto que impide publicar:** el parser tomó un encabezado de columna como motor y una fusión posterior sustituyó la lectura correcta de IA. El motor siguió en revisión. Un contraejemplo con datos ficticios y parser/fusión reales confirmó que la contradicción también puede perder su estado entre fusiones. Corregir asociación de columnas y persistencia de la contradicción. También precisar año de fabricación frente a año/modelo y revisar lecturas ambiguas del modelo.

**Cancelación y manuales:** se canceló durante IA a los 5,0 s y durante OCR a los 26,1 s. Las imágenes y los manuales llenos/vacíos se conservaron, sin cambios tardíos durante 72 s y 52 s de observación. El reintento completo conservó tres valores manuales y un vacío; terminó en 6,4 s sin OCR. Ese último tiempo no es comparable con las ejecuciones sin editar.

**Límites:** el PDF autorizado es una página escaneada, no un PDF mixto. Se probó su imagen embebida con la orientación original de 90 grados, sin pérdida de píxeles, mediante el pegado de matrícula. La conversión quedó fuera del tiempo de aplicación; no se validó la ruta PDF nativa. Sigue pendiente un PDF mixto autorizado. La doble identificación contradictoria del mismo rol continúa cubierta por regresiones sintéticas, no por un caso real aportado.

Los diagnósticos contienen tiempos, cantidades y comprobaciones, sin datos documentales ni credenciales. La reproducción sintética está separada de las seis operaciones reales. No se alteraron timeouts ni pasadas por la demora.

[Detalle y metodología](validacion-real-detalle-20261022.md) · [Mediciones por caso](validacion-real-resumen-20261022.json) · [Detalle seguro de Tiempos](validacion-real-mediciones-20261022.json)
