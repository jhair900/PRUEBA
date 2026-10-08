"""Preparar una versión web: ejecutar python tools/prepare-release.py antes de publicar."""
from pathlib import Path
from datetime import datetime, timezone
import re,json
from zipfile import ZipFile, ZIP_DEFLATED
root=Path(__file__).resolve().parent.parent
version=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
for page in root.glob('*.html'):
    text=page.read_text(encoding='utf-8-sig')
    text=re.sub(r'(<meta name="autocor-version" content=")[^"]+',lambda m:m[1]+version,text)
    text=re.sub(r'((?:src|href)="js/[^"?]+)(?:\?[^" ]*)?"',lambda m:m[1]+'?v='+version+'"',text)
    page.write_text(text,encoding='utf-8')
(root/'version.json').write_text(json.dumps({'version':version})+'\n',encoding='utf-8')
files=[p for p in root.glob('*.html')]+[p for p in (root/'js').iterdir() if p.is_file()]+[root/'version.json']
archive=root/'entrega'/('AUTOCOR-actualizacion-automatica-'+version+'.zip')
with ZipFile(archive,'w',ZIP_DEFLATED) as z:
    for p in files:z.write(p,p.relative_to(root).as_posix())
with ZipFile(archive) as z:
    assert z.testzip() is None
print(archive)
