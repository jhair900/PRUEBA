#!/usr/bin/env python3
"""Promote the approved QA samples to automatic DOCX templates."""

from __future__ import annotations

import argparse
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from lxml import etree


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
XML_NS = "http://www.w3.org/XML/1998/namespace"
NS = {"w": W_NS}


COMMON = [
    ("VILLACIS MONTENEGRO MARIA FERNANDA", ["{NOMBRE_PROP}"]),
    ("AV. AMAZONAS N34-451 Y REPUBLICA, QUITO", ["{DOMICILIO_PROP}"]),
    ("CHEVROLET", ["{MARCA}"]),
    ("GRAND VITARA SZ NEXT", ["{MODELO}"]),
    ("2022", ["{ANIO}"]),
    ("8LDCB5DG5N0123456", ["{CHASIS}"]),
    ("M16A987654", ["{MOTOR}"]),
    ("septiembre", ["{FECHA_MES}"]),
    ("2026", ["{FECHA_ANIO}"]),
]

SPECS = {
    "encargo-casado": COMMON + [
        ("1712345678", ["{CI_PROP}"]),
        ("maria.villacis@example.com", ["{EMAIL_PROP}"]),
        ("RODRIGUEZ BENITEZ JUAN CARLOS", ["{NOMBRE_CONY}"]),
        ("1798765432", ["{CI_CONY}"]),
        ("CASADO", ["{ESTADO_CIVIL_PROP}"]),
        ("ECUATORIANA", ["{NACIONALIDAD_PROP}", "{NACIONALIDAD_CONY}"]),
        ("0991234567", ["{TELEFONO_PROP}"]),
        ("0987654321", ["{TELEFONO_CONY}"]),
        ("juan.rodriguez@example.com", ["{EMAIL_CONY}"]),
        ("PBA1234", ["{PLACA_SIN_GUION}"]),
        ("AV. 6 DE DICIEMBRE Y SANTA LUCIA, QUITO", ["{DOMICILIO_GENERADOR}"]),
        ("vllugcha@autocor.com.ec", ["{EMAIL_GENERADOR}"]),
        ("infouio@anefi.com.ec", ["{EMAIL_FIDUCIARIA}"]),
    ],
    "encargo-soltero": COMMON + [
        ("1712345678", ["{CI_PROP}"]),
        ("maria.villacis@example.com", ["{EMAIL_PROP}"]),
        ("CASADO", ["{ESTADO_CIVIL_PROP}"]),
        ("ECUATORIANA", ["{NACIONALIDAD_PROP}"]),
        ("0991234567", ["{TELEFONO_PROP}"]),
        ("PBA1234", ["{PLACA_SIN_GUION}"]),
        ("AV. 6 DE DICIEMBRE Y SANTA LUCIA, QUITO", ["{DOMICILIO_GENERADOR}"]),
        ("vllugcha@autocor.com.ec", ["{EMAIL_GENERADOR}"]),
        ("infouio@anefi.com.ec", ["{EMAIL_FIDUCIARIA}"]),
    ],
    "prestacion-casado": COMMON + [
        ("mmaria.villacis@example.com", ["{EMAIL_PROP}"]),
        ("RODRIGUEZ BENITEZ JUAN CARLOS", ["{NOMBRE_CONY}"]),
        ("CASADO", ["{ESTADO_CIVIL_PROP}"]),
        ("ECUATORIANA", ["{NACIONALIDAD_PROP}"]),
        ("PBA-1234", ["{PLACA}"]),
        ("GRIS PLATA", ["{COLOR}"]),
        ("128450", ["{KM}"]),
        ("DIECIOCHO MIL QUINIENTOS", ["{VALOR_TEXT}"]),
        ("18500,00", ["{VALOR_NUM}"]),
        ("vllugcha@autocor.com.ec", ["{EMAIL_GENERADOR}"]),
    ],
    "prestacion-soltero": COMMON + [
        ("mmaria.villacis@example.com", ["{EMAIL_PROP}"]),
        ("soltero", ["{ESTADO_CIVIL_PROP_MINUSCULA}"]),
        ("ECUATORIANA", ["{NACIONALIDAD_PROP}"]),
        ("PBA-1234", ["{PLACA}"]),
        ("GRIS PLATA", ["{COLOR}"]),
        ("128450", ["{KM}"]),
        ("DIECIOCHO MIL QUINIENTOS", ["{VALOR_TEXT}"]),
        ("18500,00", ["{VALOR_NUM}"]),
        ("vllugcha@autocor.com.ec", ["{EMAIL_GENERADOR}"]),
    ],
}


def text_nodes(root: etree._Element) -> list[etree._Element]:
    return root.xpath("//w:t", namespaces=NS)


def set_text(node: etree._Element, value: str) -> None:
    node.text = value
    preserve = value.startswith(" ") or value.endswith(" ")
    key = f"{{{XML_NS}}}space"
    if preserve:
        node.set(key, "preserve")
    else:
        node.attrib.pop(key, None)


def replace_all(root: etree._Element, literal: str, markers: list[str]) -> int:
    initial_text = "".join(node.text or "" for node in text_nodes(root))
    count = initial_text.count(literal)
    if len(markers) not in (1, count):
        raise ValueError(f"Expected one marker or {count} markers for {literal!r}")
    replacements = list(reversed(markers if len(markers) > 1 else markers * count))

    for marker in replacements:
        nodes = text_nodes(root)
        starts = []
        total = 0
        for node in nodes:
            starts.append(total)
            total += len(node.text or "")
        full_text = "".join(node.text or "" for node in nodes)
        start = full_text.rfind(literal)
        if start < 0:
            raise ValueError(f"Could not find {literal!r} while replacing it")
        end = start + len(literal)
        first = max(i for i, value in enumerate(starts) if value <= start)
        last = max(i for i, value in enumerate(starts) if value < end)
        first_offset = start - starts[first]
        last_offset = end - starts[last]
        before = nodes[first].text[:first_offset]
        after = nodes[last].text[last_offset:]
        set_text(nodes[first], before + marker + after)
        for index in range(first + 1, last + 1):
            set_text(nodes[index], "")
    return count


def replace_exact_nodes(root: etree._Element, literal: str, marker: str) -> int:
    matches = [node for node in text_nodes(root) if (node.text or "") == literal]
    for node in matches:
        set_text(node, marker)
    return len(matches)


def copy_with_document(source: Path, target: Path, document_xml: bytes) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(source, "r") as src, ZipFile(target, "w") as dst:
        for info in src.infolist():
            data = document_xml if info.filename == "word/document.xml" else src.read(info.filename)
            clone = ZipInfo(info.filename, info.date_time)
            clone.compress_type = info.compress_type if info.compress_type is not None else ZIP_DEFLATED
            clone.comment = info.comment
            clone.extra = info.extra
            clone.internal_attr = info.internal_attr
            clone.external_attr = info.external_attr
            clone.create_system = info.create_system
            dst.writestr(clone, data)


def promote(sample: Path, target: Path, key: str) -> None:
    with ZipFile(sample, "r") as archive:
        root = etree.fromstring(archive.read("word/document.xml"))

    for literal, markers in sorted(SPECS[key], key=lambda item: len(item[0]), reverse=True):
        count = replace_all(root, literal, markers)
        expected = {
            "encargo-casado": {
                "VILLACIS MONTENEGRO MARIA FERNANDA": 6,
                "RODRIGUEZ BENITEZ JUAN CARLOS": 6,
                "1712345678": 3,
                "1798765432": 3,
                "ECUATORIANA": 2,
                "PBA1234": 4,
                "AV. AMAZONAS N34-451 Y REPUBLICA, QUITO": 2,
                "maria.villacis@example.com": 2,
                "juan.rodriguez@example.com": 2,
                "0991234567": 2,
                "0987654321": 2,
                "CHEVROLET": 2,
                "GRAND VITARA SZ NEXT": 2,
                "2022": 2,
                "8LDCB5DG5N0123456": 2,
                "M16A987654": 2,
                "septiembre": 2,
                "2026": 2,
                "infouio@anefi.com.ec": 2,
            },
            "encargo-soltero": {
                "VILLACIS MONTENEGRO MARIA FERNANDA": 6,
                "1712345678": 3,
                "PBA1234": 4,
                "AV. AMAZONAS N34-451 Y REPUBLICA, QUITO": 2,
                "maria.villacis@example.com": 2,
                "0991234567": 2,
                "CHEVROLET": 2,
                "GRAND VITARA SZ NEXT": 2,
                "2022": 2,
                "8LDCB5DG5N0123456": 2,
                "M16A987654": 2,
                "septiembre": 2,
                "2026": 2,
                "infouio@anefi.com.ec": 2,
            },
        }.get(key, {}).get(literal, 1)
        if count != expected:
            raise ValueError(f"{sample.name}: expected {expected} occurrences of {literal!r}, found {count}")

    expected_days = 2 if key.startswith("encargo-") else 1
    day_count = replace_exact_nodes(root, "02", "{FECHA_DIA}")
    if day_count != expected_days:
        raise ValueError(f"{sample.name}: expected {expected_days} date-day fields, found {day_count}")

    xml = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
    copy_with_document(sample, target, xml)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample-dir", type=Path, default=Path(".qa-contracts"))
    parser.add_argument("--output-dir", type=Path, default=Path("templates"))
    args = parser.parse_args()

    for key in SPECS:
        sample = args.sample_dir / f"MUESTRA_{key}.docx"
        target = args.output_dir / f"{key}.docx"
        promote(sample, target, key)
        print(f"Prepared {target} from {sample}")


if __name__ == "__main__":
    main()
