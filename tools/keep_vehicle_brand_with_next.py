#!/usr/bin/env python3
"""Keep each vehicle brand paragraph with the following vehicle detail."""

from __future__ import annotations

import argparse
from pathlib import Path
from tempfile import NamedTemporaryFile
from zipfile import ZipFile, ZipInfo

from lxml import etree


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W_NS}


def clone_info(info: ZipInfo) -> ZipInfo:
    clone = ZipInfo(info.filename, info.date_time)
    clone.compress_type = info.compress_type
    clone.comment = info.comment
    clone.extra = info.extra
    clone.internal_attr = info.internal_attr
    clone.external_attr = info.external_attr
    clone.create_system = info.create_system
    return clone


def update_document(path: Path) -> int:
    with ZipFile(path, "r") as archive:
        entries = [(info, archive.read(info.filename)) for info in archive.infolist()]

    document_index = next(
        index for index, (info, _) in enumerate(entries)
        if info.filename == "word/document.xml"
    )
    info, document_xml = entries[document_index]
    root = etree.fromstring(document_xml)
    changed = 0

    for paragraph in root.xpath("//w:p", namespaces=NS):
        text = "".join(paragraph.xpath(".//w:t/text()", namespaces=NS)).strip()
        if not text.startswith("Marca:"):
            continue

        paragraph_properties = paragraph.find(f"{{{W_NS}}}pPr")
        if paragraph_properties is None:
            paragraph_properties = etree.Element(f"{{{W_NS}}}pPr")
            paragraph.insert(0, paragraph_properties)
        if paragraph_properties.find(f"{{{W_NS}}}keepNext") is None:
            paragraph_properties.append(etree.Element(f"{{{W_NS}}}keepNext"))
            changed += 1

    if changed != 2:
        raise ValueError(f"{path.name}: se esperaban 2 líneas Marca; se modificaron {changed}")

    entries[document_index] = (
        info,
        etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True),
    )

    with NamedTemporaryFile(dir=path.parent, suffix=".docx", delete=False) as handle:
        temp_path = Path(handle.name)
    try:
        with ZipFile(temp_path, "w") as output:
            for entry_info, data in entries:
                output.writestr(clone_info(entry_info), data)
        temp_path.replace(path)
    finally:
        temp_path.unlink(missing_ok=True)

    return changed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="+", type=Path)
    args = parser.parse_args()
    for path in args.paths:
        count = update_document(path)
        print(f"{path}: {count} líneas Marca unidas al dato siguiente")


if __name__ == "__main__":
    main()
