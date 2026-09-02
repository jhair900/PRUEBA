#!/usr/bin/env python3
"""Prepare the four Dilileg DOCX files as browser-fillable templates.

Only text intended as a data blank and empty vehicle-value cells are changed.
All remaining OOXML parts are copied unchanged from the supplied documents.
"""

from __future__ import annotations

import argparse
import shutil
import tempfile
import zipfile
from pathlib import Path

from lxml import etree


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W_NS}
XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"


def paragraph_text(paragraph):
    return "".join(node.text or "" for node in paragraph.xpath(".//w:t", namespaces=NS))


def replace_across_nodes(element, old, new):
    nodes = element.xpath(".//w:t", namespaces=NS)
    full_text = "".join(node.text or "" for node in nodes)
    start = full_text.find(old)
    if start < 0:
        return False

    end = start + len(old)
    offset = 0
    first_index = None
    last_index = None
    first_local = 0
    last_local = 0

    for index, node in enumerate(nodes):
        node_end = offset + len(node.text or "")
        if first_index is None and start < node_end:
            first_index = index
            first_local = start - offset
        if end <= node_end:
            last_index = index
            last_local = end - offset
            break
        offset = node_end

    if first_index is None or last_index is None:
        return False

    first = nodes[first_index]
    last = nodes[last_index]
    prefix = (first.text or "")[:first_local]
    suffix = (last.text or "")[last_local:]
    first.text = prefix + new + (suffix if first_index == last_index else "")
    first.set(XML_SPACE, "preserve")

    for index in range(first_index + 1, last_index):
        nodes[index].text = ""
    if last_index != first_index:
        last.text = suffix

    return True


def replace_in_paragraphs(root, match, old, new, expected=1):
    changed = 0
    for paragraph in root.xpath(".//w:body//w:p", namespaces=NS):
        if match in paragraph_text(paragraph) and replace_across_nodes(paragraph, old, new):
            changed += 1
    if changed != expected:
        raise RuntimeError(
            f"Expected {expected} replacement(s) for {old!r} in {match!r}, found {changed}"
        )


def set_vehicle_cell(root, label, placeholder):
    for row in root.xpath(".//w:tbl//w:tr", namespaces=NS):
        cells = row.xpath("./w:tc", namespaces=NS)
        for index, cell in enumerate(cells[:-1]):
            if paragraph_text(cell).strip().upper() != label.upper():
                continue
            target = cells[index + 1]
            if paragraph_text(target).strip():
                raise RuntimeError(f"Vehicle cell for {label!r} is not empty")
            paragraph = target.find(".//w:p", namespaces=NS)
            if paragraph is None:
                paragraph = etree.SubElement(target, f"{{{W_NS}}}p")
            run = paragraph.find("./w:r", namespaces=NS)
            if run is None:
                run = etree.SubElement(paragraph, f"{{{W_NS}}}r")
            text = run.find("./w:t", namespaces=NS)
            if text is None:
                text = etree.SubElement(run, f"{{{W_NS}}}t")
            text.text = placeholder
            return
    raise RuntimeError(f"Vehicle label {label!r} not found")


def replace_exact_paragraphs(root, old, replacements):
    paragraphs = [
        paragraph
        for paragraph in root.xpath(".//w:p", namespaces=NS)
        if paragraph_text(paragraph).strip() == old
    ]
    if len(paragraphs) != len(replacements):
        raise RuntimeError(
            f"Expected {len(replacements)} exact paragraph(s) {old!r}, found {len(paragraphs)}"
        )
    for paragraph, new in zip(paragraphs, replacements):
        if not replace_across_nodes(paragraph, old, new):
            raise RuntimeError(f"Could not replace signature field {old!r}")


def patch_encargo(root, married):
    if married:
        replace_in_paragraphs(root, "Nombres Completos:", "___________y ____", "{NOMBRE_PROP} y {NOMBRE_CONY}")
        replace_in_paragraphs(root, "Número de Identificación:", "__________ y _____", "{CI_PROP} y {CI_CONY}")
        replace_in_paragraphs(root, "Nacionalidad:", "_______________", "{NACIONALIDAD_PROP} / {NACIONALIDAD_CONY}")
        replace_in_paragraphs(root, "Teléfono:", "_______________", "{TELEFONO_PROP} / {TELEFONO_CONY}")
        replace_in_paragraphs(root, "Correo electrónico:", "_______________", "{EMAIL_PROP} / {EMAIL_CONY}")
        names = "{NOMBRE_PROP} y {NOMBRE_CONY}"
    else:
        replace_in_paragraphs(root, "Nombres Completos:", "_______________", "{NOMBRE_PROP}")
        replace_in_paragraphs(root, "Número de Identificación:", "_______________", "{CI_PROP}")
        replace_in_paragraphs(root, "Nacionalidad:", "_______________", "{NACIONALIDAD_PROP}")
        replace_in_paragraphs(root, "Teléfono:", "_______________", "{TELEFONO_PROP}")
        replace_in_paragraphs(root, "Correo electrónico:", "_______________", "{EMAIL_PROP}")
        names = "{NOMBRE_PROP}"

    replace_in_paragraphs(root, "Estado civil:", "_______________", "{ESTADO_CIVIL_PROP}")
    replace_in_paragraphs(root, "Domicilio:", "_______________", "{DOMICILIO_PROP}")
    constituent_label = "CONSTITUYENTES:" if married else "CONSTITUYENTE:"
    replace_in_paragraphs(root, constituent_label, "_______________________", names)
    replace_in_paragraphs(root, "BENEFICIARIO", "_______________________", names)
    replace_in_paragraphs(root, "ENCARGO FIDUCIARIO:", "_______", "{PLACA}")
    replace_in_paragraphs(root, "documento privado suscrito el", "__________", "{FECHA_CONTRATO_DIA} de {FECHA_CONTRATO_MES} del {FECHA_CONTRATO_ANIO}")
    replace_in_paragraphs(root, "CLÁUSULA TERCERA", "_______", "{PLACA}")
    replace_in_paragraphs(root, "CLÁUSULA CUARTA", "___________________", names)

    for label, placeholder in (
        ("Marca:", "{MARCA}"),
        ("Modelo:", "{MODELO}"),
        ("Año:", "{ANIO}"),
        ("Chasis:", "{CHASIS}"),
        ("Motor:", "{MOTOR}"),
        ("Placa:", "{PLACA}"),
    ):
        replace_in_paragraphs(root, label, "________________", placeholder, expected=2)

    phone_value = "{TELEFONO_PROP} / {TELEFONO_CONY}" if married else "{TELEFONO_PROP}"
    email_value = "{EMAIL_PROP} / {EMAIL_CONY}" if married else "{EMAIL_PROP}"
    replace_in_paragraphs(root, "26.1", "_______________", "{DOMICILIO_PROP}")
    replace_in_paragraphs(root, "26.1", "___________", phone_value)
    replace_in_paragraphs(root, "26.1", "_______________", email_value)
    replace_in_paragraphs(root, "26.2", "________________", "{DOMICILIO_GENERADOR}")
    replace_in_paragraphs(root, "26.2", "_______________", "{EMAIL_GENERADOR}")
    replace_in_paragraphs(root, "26.3", "_________________", "{EMAIL_FIDUCIARIA}")

    final_text = "{FECHA_DIA} días del mes de {FECHA_MES} del {FECHA_ANIO}"
    final_old = "__ días del mes de _______________ del _______" if married else "__ días del mes de _______________ del ___________"
    replace_in_paragraphs(root, "En Quito, a los", final_old, final_text)

    if married:
        replace_exact_paragraphs(
            root,
            "(NOMBRE)",
            ("{NOMBRE_CONY}", "{NOMBRE_CONY}", "{NOMBRE_PROP}", "{NOMBRE_PROP}"),
        )
        replace_exact_paragraphs(
            root,
            "C.C.",
            ("C.C. {CI_CONY}", "C.C. {CI_CONY}", "C.C. {CI_PROP}", "C.C. {CI_PROP}"),
        )
    else:
        replace_exact_paragraphs(root, "(NOMBRE)", ("{NOMBRE_PROP}", "{NOMBRE_PROP}"))
        replace_exact_paragraphs(root, "C.C.", ("C.C. {CI_PROP}", "C.C. {CI_PROP}"))


def patch_prestacion(root, married):
    intro_old = "___ días del mes de a_____ del 202_"
    intro_new = "{FECHA_DIA} días del mes de {FECHA_MES} del {FECHA_ANIO}"
    replace_in_paragraphs(root, "En el Distrito Metropolitano de Quito", intro_old, intro_new)

    if married:
        replace_in_paragraphs(root, "comparecen a la celebración", "______________________", "{NOMBRE_PROP}")
        replace_in_paragraphs(root, "comparecen a la celebración", "______________________", "{NOMBRE_CONY}")
    else:
        replace_in_paragraphs(root, "comparecen a la celebración", "______________________", "{NOMBRE_PROP}")

    replace_in_paragraphs(root, "TERCERA: PRECIO", "__________________", "{VALOR_TEXT} ")
    replace_in_paragraphs(root, "TERCERA: PRECIO", "______", "{VALOR_NUM}")
    replace_in_paragraphs(root, "DÉCIMA PRIMERA: NOTIFICACIONES", "xxxxxxxx", "{DOMICILIO_PROP}")
    replace_in_paragraphs(root, "DÉCIMA PRIMERA: NOTIFICACIONES", "xxxx", "{EMAIL_PROP}")

    for label, placeholder in (
        ("PLACA", "{PLACA}"),
        ("COLOR", "{COLOR}"),
        ("MARCA", "{MARCA}"),
        ("AÑO", "{ANIO}"),
        ("MODELO", "{MODELO}"),
        ("CHASIS", "{CHASIS}"),
        ("MOTOR", "{MOTOR}"),
        ("KM", "{KM}"),
    ):
        set_vehicle_cell(root, label, placeholder)


def patch_docx(source, destination, patcher):
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_docx = Path(temp_dir) / destination.name
        with zipfile.ZipFile(source, "r") as zin, zipfile.ZipFile(temp_docx, "w") as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)
                if item.filename == "word/document.xml":
                    root = etree.fromstring(data)
                    patcher(root)
                    data = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
                zout.writestr(item, data)
        shutil.copyfile(temp_docx, destination)


def find_one(source_dir, includes, excludes=()):
    matches = []
    for path in source_dir.glob("*.docx"):
        name = path.name.casefold()
        if all(value.casefold() in name for value in includes) and not any(
            value.casefold() in name for value in excludes
        ):
            matches.append(path)
    if len(matches) != 1:
        raise RuntimeError(f"Expected one DOCX matching {includes}, found: {matches}")
    return matches[0]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    jobs = (
        (find_one(args.source_dir, ("encargo", "dilileg", "solteros")), "encargo-soltero.docx", lambda root: patch_encargo(root, False)),
        (find_one(args.source_dir, ("encargo", "dilileg", "casados")), "encargo-casado.docx", lambda root: patch_encargo(root, True)),
        (find_one(args.source_dir, ("prestación", "soltero"), ("consignación",)), "prestacion-soltero.docx", lambda root: patch_prestacion(root, False)),
        (find_one(args.source_dir, ("prestación", "casado"), ("consignación",)), "prestacion-casado.docx", lambda root: patch_prestacion(root, True)),
    )

    for source, output_name, patcher in jobs:
        destination = args.output_dir / output_name
        patch_docx(source, destination, patcher)
        print(f"Prepared {destination.name} from {source.name}")


if __name__ == "__main__":
    main()
