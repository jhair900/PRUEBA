#!/usr/bin/env python3
"""Base64-encode all 3 template files and write js/contrato-templates.js

Uso (desde la raíz del proyecto):
    python tools/encode_templates.py
"""
import base64
import os

# Rutas relativas a la raíz del proyecto (carpeta padre de tools/)
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
templates_dir = os.path.join(ROOT, "templates")
output_path   = os.path.join(ROOT, "js", "contrato-templates.js")

template_files = {
    "encargo-soltero":  os.path.join(templates_dir, "encargo-soltero.docx"),
    "encargo-casado":   os.path.join(templates_dir, "encargo-casado.docx"),
    "prestacion-quito": os.path.join(templates_dir, "prestacion-quito.docx"),
}

encoded = {}
for key, path in template_files.items():
    with open(path, "rb") as f:
        data = f.read()
    b64 = base64.b64encode(data).decode("ascii")
    encoded[key] = b64
    print(f"  Encoded {key}: {len(data):,} bytes -> {len(b64):,} chars base64")

js_lines = ["/* Auto-generated — do not edit manually */",
            "window.CONTRATO_TEMPLATES = {"]
items = list(encoded.items())
for i, (key, b64) in enumerate(items):
    comma = "," if i < len(items) - 1 else ""
    js_lines.append(f"  '{key}': '{b64}'{comma}")
js_lines.append("};")
js_content = "\n".join(js_lines) + "\n"

with open(output_path, "w", encoding="utf-8") as f:
    f.write(js_content)

print(f"\nWrote {output_path}")
print(f"Total JS file size: {len(js_content):,} chars")
