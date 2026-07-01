#!/usr/bin/env python3
"""Replace template values with docxtemplater placeholders for prestacion-quito."""

XML_PATH = "C:/Users/USUARIO/Desktop/PRUEBAS AUTOCOR/tmp_quito/word/document.xml"

with open(XML_PATH, "r", encoding="utf-8") as f:
    content = f.read()

# Simple text replacements
replacements = [
    ("INSUASTI ABARCA ANGEL DAVID", "{NOMBRE_PROP}"),
    ("SOLTERO", "{ESTADO_CIVIL_PROP}"),
    ("PFI6746", "{PLACA}"),
    ("KIA", "{MARCA}"),
    ("SONET LX AC 1.5 5P 4X2 TA", "{MODELO}"),
    ("PLATEADO", "{COLOR}"),
    ("8LGFB8144RE003353", "{CHASIS}"),
    ("G4FLPV513525", "{MOTOR}"),
    ("25800", "{KM}"),
]

for old, new in replacements:
    count = content.count(old)
    content = content.replace(old, new)
    print(f"  Replaced '{old}' -> '{new}': {count} occurrences")

# 2024 - vehicle year only (NOT 2026 legal year)
count = content.count(">2024<")
content = content.replace(">2024<", ">{ANIO}<")
print(f"  Replaced '2024' -> '{{ANIO}}': {count} occurrences")

# ECUATORIANA - only the first (client's - in MERGEFIELD display)
# Two occur: first is MERGEFIELD display for client, second is AUTOCOR's standalone
first_idx = content.find(">ECUATORIANA<")
if first_idx >= 0:
    content = content[:first_idx] + ">{NACIONALIDAD_PROP}<" + content[first_idx+len(">ECUATORIANA<"):]
    print("  Replaced first 'ECUATORIANA' -> '{NACIONALIDAD_PROP}'")
else:
    print("  WARNING: ECUATORIANA not found!")

# 19040 - the vehicle estimated value (after "$" in the mergefield)
count = content.count(">19040<")
content = content.replace(">19040<", ">{VALOR_NUM}<")
print(f"  Replaced '19040' -> '{{VALOR_NUM}}': {count} occurrences")

# Opening date: "En el Distrito Metropolitano de Quito, a los " + "04" + " días del mes de " + "marzo" + " del " + "2026"
# Replace "a los " -> "a los {FECHA_DIA}"
content = content.replace(
    "<w:t xml:space=\"preserve\">En el Distrito Metropolitano de Quito, a los </w:t>",
    "<w:t xml:space=\"preserve\">En el Distrito Metropolitano de Quito, a los {FECHA_DIA}</w:t>"
)
print("  Replaced opening 'a los' with DIA placeholder")

# Remove the "04" standalone run (since FECHA_DIA is now in the previous run)
content = content.replace("<w:t>04</w:t>", "<w:t></w:t>")
print("  Emptied '04' run (DIA placeholder in previous run)")

# " días del mes de " -> " días del mes de {FECHA_MES}"
content = content.replace(
    "<w:t xml:space=\"preserve\"> días del mes de </w:t>",
    "<w:t xml:space=\"preserve\"> días del mes de {FECHA_MES}</w:t>"
)
print("  Replaced 'días del mes de' with MES placeholder")

# Remove "marzo" (standalone) since MES is now in previous run
content = content.replace("<w:t>marzo</w:t>", "<w:t></w:t>")
print("  Emptied 'marzo' run")

# " del " -> " del {FECHA_ANIO}" and replace "2026" with empty
content = content.replace(
    "<w:t xml:space=\"preserve\"> del </w:t>",
    "<w:t xml:space=\"preserve\"> del {FECHA_ANIO}</w:t>",
    1  # only the first occurrence (in opening date)
)
content = content.replace("<w:t>2026</w:t>", "<w:t></w:t>", 1)
print("  Replaced ' del ' with ANIO placeholder, emptied '2026'")

# DIECINUEVE MIL CUARENTA - check if it exists
if "DIECINUEVE" in content:
    content = content.replace("DIECINUEVE MIL CUARENTA", "{VALOR_TEXT}")
    print("  Replaced 'DIECINUEVE MIL CUARENTA' -> '{VALOR_TEXT}'")
else:
    print("  NOTE: 'DIECINUEVE MIL CUARENTA' not found in document XML (may not be present)")

with open(XML_PATH, "w", encoding="utf-8") as f:
    f.write(content)

print("Done writing quito document.xml")
