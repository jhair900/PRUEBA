"""Añadir los campos existentes a las dos firmas de la prestación para casados.

Preserva cada parte del DOCX y el XML original salvo los cuatro cuadros de
cliente (dos firmas, cada una con representación moderna y VML compatible).
"""
from pathlib import Path
from zipfile import ZipFile
import re
from lxml import etree

root=Path(__file__).resolve().parents[1]
template=root/'templates/prestacion-casado.docx'
with ZipFile(template) as archive:
    entries=[(info,archive.read(info.filename)) for info in archive.infolist()]
original=dict((info.filename,data) for info,data in entries)
xml=original['word/document.xml'].decode('utf-8')
namespace={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
count=0

def patch_box(match):
    global count
    box=match.group(0)
    # Sólo los cuadros cuya etiqueta es exactamente EL CLIENTE.
    text=''.join(re.findall(r'<w:t(?:\s[^>]*)?>([^<]*)</w:t>',box))
    if not text.startswith('EL CLIENTE'):return box
    marker='{NOMBRE_PROP}' if count<2 else '{NOMBRE_CONY}'
    count+=1
    if marker in text:return box
    if text!='EL CLIENTE':raise ValueError('Contenido inesperado en el cuadro de firma')
    added=('<w:r><w:br/></w:r><w:r><w:rPr>'
           '<w:rFonts w:ascii="Roboto Condensed" w:hAnsi="Roboto Condensed"/>'
           '<w:b/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/>'
           '<w:lang w:val="es-EC"/></w:rPr><w:t>'+marker+'</w:t></w:r>')
    position=box.rfind('</w:p>')
    return box[:position]+added+box[position:]

patched=re.sub(r'<w:txbxContent\b[^>]*>[\s\S]*?</w:txbxContent>',patch_box,xml)
assert count==4,count
parsed=etree.fromstring(patched.encode('utf-8'))
client_boxes=[box for box in parsed.findall('.//w:txbxContent',namespace) if ''.join(box.itertext('{'+namespace['w']+'}t')).startswith('EL CLIENTE')]
assert len(client_boxes)==4
for i,box in enumerate(client_boxes):
    text=''.join(box.itertext('{'+namespace['w']+'}t'))
    assert ('{NOMBRE_PROP}' if i<2 else '{NOMBRE_CONY}') in text

if patched!=xml:
    temporary=template.with_suffix('.firmas.tmp')
    with ZipFile(temporary,'w') as archive:
        for info,data in entries:
            archive.writestr(info,patched.encode('utf-8') if info.filename=='word/document.xml' else data)
    with ZipFile(temporary) as archive:
        assert archive.testzip() is None
        for name,data in original.items():
            if name!='word/document.xml':assert archive.read(name)==data,name
    temporary.replace(template)
print('Prestación casados: campos NOMBRE_PROP y NOMBRE_CONY en ambas representaciones de sus firmas; demás partes intactas.')
