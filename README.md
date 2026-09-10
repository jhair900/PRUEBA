# AUTOCOR — Sistema de Gestión Documental

Aplicación web (HTML/JS estática) + backend Google Apps Script para gestionar
liquidaciones, pagos, ventas y contratos de vehículos.

---

## 📁 Estructura del proyecto

```
PRUEBAS AUTOCOR/
│
├── index.html                  ← Login / portal principal
├── liquidacion.html            ← Módulo de liquidaciones
├── pagos.html                  ← Módulo de pagos
├── ventas.html                 ← Módulo de ventas
├── contratos.html              ← Módulo de contratos (validación + generación Word)
│
├── assets/                     ← Imágenes estáticas
│   ├── logo.png
│   └── fondo.png
│
├── js/                         ← JavaScript usado por contratos.html
│   ├── cuv-parser.js           ← Parser del PDF CUV
│   ├── generador-contratos.js  ← Genera los .docx con docxtemplater + PizZip
│   └── contrato-templates.js   ← Plantillas Word embebidas en base64
│
├── gas/                        ← Backend Google Apps Script
│   └── script.gs               ← Pegar en el editor de Apps Script y publicar
│
├── templates/                  ← Plantillas Word fuente (.docx)
│   ├── encargo-soltero.docx
│   ├── encargo-casado.docx
│   ├── prestacion-soltero.docx
│   └── prestacion-casado.docx
│
└── tools/                      ← Scripts auxiliares (uso ocasional)
    ├── prepare_dilileg_templates.py ← Prepara los cuatro formatos Dilileg
    ├── use_qa_samples_as_templates.py ← Usa las muestras aprobadas como base visual
    └── encode_templates.py     ← Regenera js/contrato-templates.js desde templates/*.docx
```

---

## 🧩 Módulos

| HTML | Función |
|------|---------|
| `index.html` | Login. Guarda sesión en `localStorage.autocor_auth` |
| `liquidacion.html` | Procesa imágenes y datos de liquidaciones, genera PDF |
| `pagos.html` | Registro y seguimiento de pagos |
| `ventas.html` | Gestión de ventas |
| `contratos.html` | Extrae datos de cédula, matrícula, CUV y notaría; valida cruzadamente y genera contratos Word + guarda en hoja |

---

## 🔌 Backend (Google Apps Script)

Todo el backend está en `gas/script.gs`. Despliegue:

1. Abrir Google Apps Script vinculado a la hoja de cálculo
2. Pegar el contenido completo de `gas/script.gs`
3. Desplegar como **Web App** (ejecutar como tú, acceso para cualquiera)
4. Copiar el URL `https://script.google.com/macros/s/.../exec`
5. Configurar ese URL una sola vez en `js/api-config.js` (`apiUrl`).

### Hojas que se crean automáticamente
- `Liquidaciones` · `Pagos` · `Ventas` · `Contratos` · `Usuarios` · `Glosario`

### Acciones disponibles
- **Auth**: `login`, `changePassword`, `adminResetPassword`, `listUsers` (administración autenticada; inicialización solo desde el editor)
- **Liquidaciones**: `save`, `getByPlaca`, `list`, `delete`
- **Pagos**: `savePago`, `getPagoByPlaca`, `listPagos`, `deletePago`
- **Ventas**: `saveVenta`, `getVentaByPlaca`, `listVentas`, `deleteVenta`
- **Contratos**: `saveContrato`, `getContratoByPlaca`, `listContratos`, `deleteContrato`
- **Glosario**: `listGlossary`, `saveGlossaryTerm`, `deleteGlossaryTerm`, `resetGlossary`

---

## 🛠️ Mantenimiento de plantillas Word

Si necesitas actualizar los formatos visuales aprobados:

1. Reemplazar los cuatro archivos `MUESTRA_*.docx` dentro de `.qa-contracts/`, conservando sus nombres.
2. Ejecutar desde la raíz del proyecto:
   ```
   python tools/use_qa_samples_as_templates.py
   python tools/encode_templates.py
   ```
3. Eso conserva el formato de las muestras, prepara los campos automáticos y regenera `js/contrato-templates.js`.

---

## ▶️ Ejecución local

No requiere servidor — abre `index.html` con doble clic.
(Los archivos JS y assets se cargan por rutas relativas.)


## Correcciones de seguridad y concurrencia — 10 de septiembre de 2026

### Aplicar esta versión

1. Copiar **todo** `gas/script.gs` al proyecto de Apps Script existente.
2. En Gestionar implementaciones, editar el despliegue existente y elegir **Nueva versión**. Mantener la misma URL `/exec`.
3. Publicar juntos los HTML y la carpeta `js/` actualizados, incluidos `js/gemini-client.js` y `js/record-conflict.js`. Cerrar las pestañas antiguas y volver a abrir la aplicación.
4. Comprobar con una cuenta normal y una administradora: login, búsqueda y actualización en los cuatro módulos, administración de usuarios, extracción con IA y expediente Drive.

El backend nuevo rechaza actualizaciones de registros existentes que no incluyan la revisión obtenida al buscarlos. Los clientes antiguos deben actualizarse. Un registro nuevo puede guardarse directamente; para editar uno existente conviene buscar primero su placa. Si el registro existe o cambió, aparece una comparación de la versión guardada y el formulario. Cancelar conserva el formulario sin guardar; Reemplazar requiere una decisión explícita y vuelve a comprobar que la versión comparada no haya cambiado. La aplicación no fusiona automáticamente formularios de dos usuarios.

### Cambios incluidos

- `listUsers` y `adminResetPassword` validan la sesión y el rol del servidor; no confían en `adminUsername`.
- `setupUsers` no se puede ejecutar por web. `crearUsuariosAhora()` es una operación manual del editor que solo agrega usuarios faltantes y nunca restablece los existentes.
- En una instalación nueva, el propietario configura `INITIAL_ADMIN_PASSWORD` (mínimo 12 caracteres) en Script Properties antes de ejecutar `crearUsuariosAhora()`. Esa clave permite entrar como el administrador inicial JSANCHEZ; la propiedad se elimina al terminar. Los demás usuarios reciben claves aleatorias y el administrador debe asignarles claves temporales desde la aplicación. En una instalación existente no es necesario ejecutar esta inicialización.
- El proxy de Gemini exige sesión y recibe `{sessionToken, request}` por POST. Solo `request` se reenvía a Gemini. Su cliente está separado en `js/gemini-client.js`.
- Las escrituras pasan por un bloqueo de Apps Script. Los guardados de los cuatro módulos comparan la revisión leída y utilizan un identificador para reconocer reintentos de la misma operación.
- Los cambios de estado y los archivos de Drive se preservan al guardar contratos y no generan conflictos falsos con el formulario.
- Las operaciones que no tienen protección contra repetición ya no se reintentan automáticamente. Los errores HTTP y de API se propagan al llamador.
- Se unifica el mínimo de contraseña en seis caracteres y se rechazan fechas de expiración inválidas. Al cambiar la contraseña se cierra la sesión local, porque el servidor invalida el token.
- Se retira de `auth-ui.js` la limpieza heurística que podía eliminar nombres legítimos del formulario.

### Verificación local

Ejecutar `node tests/regression.cjs`. No requiere instalar dependencias. Comprueba sintaxis y regresiones con simulaciones de Apps Script/Sheets y de red; no reemplaza una prueba con el despliegue real, documentos y Drive.

Antes de editar se guardó una copia de los archivos afectados en `.backups/20260910-154821/`. Esa carpeta contiene versiones anteriores inseguras: mantenerla fuera de cualquier publicación web.
