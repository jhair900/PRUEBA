#!/usr/bin/env python3
"""Replace template values with docxtemplater placeholders for encargo-casado."""

XML_PATH = "C:/Users/USUARIO/Desktop/PRUEBAS AUTOCOR/tmp_casado/word/document.xml"

with open(XML_PATH, "r", encoding="utf-8") as f:
    content = f.read()

# Simple text replacements - ALL occurrences
replacements = [
    ("TRUJILLO PURUNCAJAS VICTOR FABRIZIO", "{NOMBRE_PROP}"),
    ("GALLARDO CANGO CRISTINA NATALIA", "{NOMBRE_CONY}"),
    ("1725458507", "{CI_PROP}"),
    ("1721757209", "{CI_CONY}"),
    ("janetacosta_17@hotmail.com", "{EMAIL_CONY}"),
    ("bulltrujillo@gmail.com", "{EMAIL_PROP}"),
    ("PFM9668", "{PLACA}"),
    ("RENAULT", "{MARCA}"),
    ("SANDERO ZEN FASE II AC 1.6 5P 4X2 TM", "{MODELO}"),
    ("9FB5SR1E5RM868637", "{CHASIS}"),
    ("H4MJ759Q258483", "{MOTOR}"),
]

for old, new in replacements:
    count = content.count(old)
    content = content.replace(old, new)
    print(f"  Replaced '{old}' -> '{new}': {count} occurrences")

# CASADO - in SEGUNDO SEGMENTO
count = content.count(">CASADO<")
content = content.replace(">CASADO<", ">{ESTADO_CIVIL_PROP}<")
print(f"  Replaced 'CASADO' -> '{{ESTADO_CIVIL_PROP}}': {count} occurrences")

# ECUATORIANA - first occurrence is CONSTITUYENTE (PROP), second is CONYUGE
# In casado: "ECUATORIANA /ECUATORIANA" both in same merged run
# After merging: <w:t>ECUATORIANA</w:t><w:t xml:space="preserve"> /</w:t><...><w:t>ECUATORIANA</w:t>
# Simple: replace first occurrence with PROP, second with CONY
first_idx = content.find(">ECUATORIANA<")
if first_idx >= 0:
    # Replace first
    content = content[:first_idx] + ">{NACIONALIDAD_PROP}<" + content[first_idx+len(">ECUATORIANA<"):]
    print("  Replaced first 'ECUATORIANA' -> '{NACIONALIDAD_PROP}'")

    # Replace second
    second_idx = content.find(">ECUATORIANA<")
    if second_idx >= 0:
        content = content[:second_idx] + ">{NACIONALIDAD_CONY}<" + content[second_idx+len(">ECUATORIANA<"):]
        print("  Replaced second 'ECUATORIANA' -> '{NACIONALIDAD_CONY}'")

# QUITO - in DOMICILIO field (two occurrences in casado)
count = content.count(">QUITO<")
content = content.replace(">QUITO<", ">{DOMICILIO_PROP}<")
print(f"  Replaced 'QUITO' -> '{{DOMICILIO_PROP}}': {count} occurrences")

# Phone numbers - in casado: "982523088 / 982523088" - first is PROP, second is CONY
# They appear in same merged run: <w:t>982523088</w:t><w:t xml:space="preserve"> / </w:t><...><w:t>982523088</w:t>
# After previous replacements they're already "{TELEFONO_PROP}" if we did that...
# Wait - we didn't add TELEFONO_PROP yet. Let's handle phone specially

# The phone in casado:
# Main block: 982523088 / 982523088 (first is PROP, second is CONY)
# Clause 26.1: 982523088 (only PROP's phone)
# All three 982523088 occurrences need distinction

# Count occurrences
phone_count = content.count("982523088")
print(f"  Found {phone_count} occurrences of 982523088")

# In the PRIMER/SEGUNDO SEGMENTO merged run (line 1467):
# <w:t>982523088</w:t><w:fldChar.../><w:t xml:space="preserve"> / </w:t><w:fldChar.../>...<w:t>982523088</w:t>
# Replace first occurrence with PROP, second with CONY, third with PROP again

idx = 0
occurrence = 0
result = content
while True:
    idx = result.find("982523088", idx)
    if idx < 0:
        break
    occurrence += 1
    if occurrence == 1:
        # First in SEGUNDO SEGMENTO - PROP
        result = result[:idx] + "{TELEFONO_PROP}" + result[idx+9:]
        idx += len("{TELEFONO_PROP}")
    elif occurrence == 2:
        # Second in SEGUNDO SEGMENTO - CONY
        result = result[:idx] + "{TELEFONO_CONY}" + result[idx+9:]
        idx += len("{TELEFONO_CONY}")
    elif occurrence == 3:
        # Third in clause 26.1 - PROP
        result = result[:idx] + "{TELEFONO_PROP}" + result[idx+9:]
        idx += len("{TELEFONO_PROP}")
    else:
        idx += 1
content = result
print(f"  Replaced 982523088 phones with PROP/CONY/PROP pattern")

# Replace 2024 (vehicle year)
count = content.count(">2024<")
content = content.replace(">2024<", ">{ANIO}<")
print(f"  Replaced '2024' -> '{{ANIO}}': {count} occurrences")

# Closing date: "19" + " días del mes de " + "FEBRERO" + " de " + "2026"
# Replace each with placeholders
content = content.replace(
    "<w:t xml:space=\"preserve\">En Quito, a los </w:t>",
    "<w:t xml:space=\"preserve\">En Quito, a los {FECHA_DIA}</w:t>"
)
# The "19" is in a separate run - remove it by making the previous run include it
# Actually we replaced "En Quito, a los " to include FECHA_DIA, now "19" is standalone
content = content.replace(
    "<w:t>19</w:t>",
    "<w:t></w:t>"
)
print("  Replaced '19' with empty (DIA placeholder already in previous run)")

content = content.replace(
    "<w:t xml:space=\"preserve\"> días del mes de </w:t>",
    "<w:t xml:space=\"preserve\"> días del mes de {FECHA_MES}</w:t>"
)
content = content.replace("<w:t>FEBRERO</w:t>", "<w:t></w:t>")
print("  Replaced 'FEBRERO' with empty (MES placeholder already in previous run)")

# " de " between month and year - keep but make year placeholder
content = content.replace("<w:t>2026</w:t>", "<w:t>{FECHA_ANIO}</w:t>")
print("  Replaced '2026' -> '{FECHA_ANIO}'")

# Clause 2.2: "suscrito el " + MERGEFIELD DIA_ (empty) + " de " + MERGEFIELD MES_ (empty) + " del " + MERGEFIELD AÑO (empty)
content = content.replace(
    "<w:t xml:space=\"preserve\">documento privado suscrito el </w:t>",
    "<w:t xml:space=\"preserve\">documento privado suscrito el {FECHA_CONTRATO_DIA} de {FECHA_CONTRATO_MES} del {FECHA_CONTRATO_ANIO}</w:t>"
)
print("  Replaced 'suscrito el' with date placeholders")

with open(XML_PATH, "w", encoding="utf-8") as f:
    f.write(content)

print("Done writing casado document.xml")
