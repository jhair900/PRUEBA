#!/usr/bin/env python3
"""Replace template values with docxtemplater placeholders for encargo-soltero."""
import re

XML_PATH = "C:/Users/USUARIO/Desktop/PRUEBAS AUTOCOR/tmp_soltero/word/document.xml"

with open(XML_PATH, "r", encoding="utf-8") as f:
    content = f.read()

original = content

# Simple text replacements - these appear as <w:t> content in the XML
replacements = [
    ("TRUJILLO PURUNCAJAS VICTOR FABRIZIO", "{NOMBRE_PROP}"),
    ("1725458507", "{CI_PROP}"),
    ("982523088", "{TELEFONO_PROP}"),
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

# Replace CASADO only in SEGUNDO SEGMENTO context
# After merge, this should be a single <w:t>CASADO</w:t>
count = content.count(">CASADO<")
content = content.replace(">CASADO<", ">{ESTADO_CIVIL_PROP}<")
print(f"  Replaced 'CASADO' -> '{{ESTADO_CIVIL_PROP}}': {count} occurrences")

# Replace ECUATORIANA (only one - the constituyente's)
count = content.count(">ECUATORIANA<")
content = content.replace(">ECUATORIANA<", ">{NACIONALIDAD_PROP}<", 1)
print(f"  Replaced first 'ECUATORIANA' -> '{{NACIONALIDAD_PROP}}': 1 of {count} occurrences")

# Replace QUITO in Domicilio line - it's one of two QUITO occurrences
# The first one is in 'DIRECCIÓN_DE_DOMICILIO' mergefield area (line ~1371)
# The second is in clause 26.1 area (line ~7093)
# We replace ALL <w:t>QUITO</w:t> with {DOMICILIO_PROP}
count = content.count(">QUITO<")
content = content.replace(">QUITO<", ">{DOMICILIO_PROP}<")
print(f"  Replaced 'QUITO' -> '{{DOMICILIO_PROP}}': {count} occurrences")

# Replace 2024 (vehicle year only) - appears in <w:t>2024</w:t>
count = content.count(">2024<")
content = content.replace(">2024<", ">{ANIO}<")
print(f"  Replaced '2024' -> '{{ANIO}}': {count} occurrences")

# For the closing date - the MERGEFIELD constructs DIA_, MES_, AÑO already have no display text
# The instruction says to handle: "a los  días del mes de del " -> "a los {FECHA_DIA} días..."
# Looking at the XML: the MERGEFIELDs are empty (no separate/display text),
# so we need to insert placeholder text into those fields

# For clause 2.2 - MERGEFIELD DIA_/MES_/AÑO constructs have no display text
# We'll replace those MERGEFIELD instrText with docxtemplater syntax by adding display text

# Handle MERGEFIELD DIA_ in clause 2.2 context - add display text {FECHA_CONTRATO_DIA}
# These appear as: <w:fldChar w:fldCharType="begin"/>\n      <w:instrText...> MERGEFIELD DIA_ </w:instrText><w:fldChar w:fldCharType="end"/>
# We need to add a display run after each

# Strategy: replace the instrText content so the field name changes (not ideal)
# OR simply add a text run after the closing fldChar

# Actually the cleanest approach: remove the MERGEFIELD wrappers entirely and
# replace with plain text placeholders.

# For clause 2.2 (suscrito el...): there's a MERGEFIELD DIA_ then MES_ then AÑO with fldCharType="end" only
# The fldCharType="separate" is missing so there's no display value
# We'll replace the entire field construct with a simple text run

# Pattern for clause 2.2 MERGEFIELDs (they use begin/end without separate):
# We'll find the specific "suscrito el" paragraph and handle it

# Better approach: search for the specific text patterns and replace segments

# For closing date area - already has "En Quito, a los" + MERGEFIELD DIA_ (with separate/display)
# Display text is empty (no text between separate and end)
# Let's insert placeholder text there

# Replace empty MERGEFIELD display fields with placeholders
# Pattern: fldCharType="separate"/></w:r>...(empty or whitespace)...<w:r>...fldCharType="end"
# After merging runs, the display run should be one run

# Let's look for fields that have "separate" and add placeholder text
# For DIA_ field (appears in 2 places - closing date and clause 2.2):
# closing date has: ...separate"/>...<w:t>  </w:t>  (empty)...end
# Actually from examining - in clause 2.2 there's begin/end without separate
# In closing date there's begin/end without separate too

# Let me take a different simpler approach:
# Find all the MERGEFIELD field instructions and the runs that follow them,
# and for those with no display text, add the placeholder as a simple text insertion

# Actually the cleanest approach for docxtemplater:
# Just add the placeholder text after the merge field end markers where needed

# For the "suscrito el" part in clause 2.2, the fields are empty (begin/end only)
# Replace the static text to include placeholders

content = content.replace(
    "<w:t xml:space=\"preserve\">documento privado suscrito el </w:t>",
    "<w:t xml:space=\"preserve\">documento privado suscrito el {FECHA_CONTRATO_DIA} de {FECHA_CONTRATO_MES} del {FECHA_CONTRATO_ANIO}</w:t>"
)
print("  Replaced 'suscrito el' text with date placeholders")

# For the closing date "En Quito, a los" + MERGEFIELD DIA_ etc.
# Change "En Quito, a los " to include the DIA placeholder
content = content.replace(
    "<w:t xml:space=\"preserve\">En Quito, a los </w:t>",
    "<w:t xml:space=\"preserve\">En Quito, a los {FECHA_DIA}</w:t>"
)
print("  Replaced closing date 'En Quito, a los' with DIA placeholder")

# Replace " días del mes de " to include MES placeholder
content = content.replace(
    "<w:t xml:space=\"preserve\"> días del mes de </w:t>",
    "<w:t xml:space=\"preserve\"> días del mes de {FECHA_MES}</w:t>"
)
print("  Replaced 'días del mes de' with MES placeholder")

# Replace "del " (the year part) - but this is tricky as "del" appears many times
# We need the specific one in the closing date. Let's use the context.
# After "días del mes de {FECHA_MES}" there's a run with "del "
# The specific XML: <w:t xml:space="preserve">del </w:t> followed by MERGEFIELD AÑO
# Let's replace the "del " that's specifically after a MERGEFIELD MES_ end
# By looking at context: after </w:instrText><w:fldChar w:fldCharType="end"/></w:r>
# there's a run with <w:t xml:space="preserve">del </w:t> then MERGEFIELD AÑO

# Since we already set FECHA_MES in the previous run, the "del " before AÑO
# should become "del {FECHA_ANIO}"
# There's also " del " in clause 2.2 - we already handled that one above

# In closing paragraph the pattern is:
# <w:t xml:space="preserve">del </w:t>  (before MERGEFIELD AÑO)
# There's also potentially other "del " runs - let's be specific

# After examining, in closing date the text is: "del " then MERGEFIELD AÑO
# In clause 2.2 we replaced the whole phrase already
# Let's replace "del " in the specific closing date context
# The closing date runs: "En Quito, a los {FECHA_DIA}" + [MERGEFIELD DIA_] +
#   " días del mes de {FECHA_MES}" + [MERGEFIELD MES_] + "del " + [MERGEFIELD AÑO] + " "
# Replace the simple "del " run that precedes MERGEFIELD AÑO in closing date
# We'll do this by adding {FECHA_ANIO} after "del "
content = content.replace(
    "<w:t xml:space=\"preserve\">del </w:t>\n      </w:r>",
    "<w:t xml:space=\"preserve\">del {FECHA_ANIO}</w:t>\n      </w:r>",
    1  # only first occurrence (closing date area)
)
print("  Replaced closing 'del ' with ANIO placeholder")

# Now verify counts
changed = sum(1 for a, b in zip(original, content) if a != b)
print(f"\nTotal characters changed: roughly {len(content) - len(original)} net chars")

with open(XML_PATH, "w", encoding="utf-8") as f:
    f.write(content)

print("Done writing soltero document.xml")
