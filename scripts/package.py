"""Build a deterministic Chrome Web Store ZIP; manifest.json is at archive root."""
from pathlib import Path
import hashlib, json, zipfile
root=Path(__file__).resolve().parent.parent
ext=root/'extension'
manifest=json.loads((ext/'manifest.json').read_text())
files={p.relative_to(ext).as_posix():p for p in ext.rglob('*') if p.is_file() and p.suffix in {'.js','.css','.html','.png','.json'}}
files.update({name:root/name for name in ('LICENSE','NOTICE.md','PRIVACY.md')})
out=root/'dist';out.mkdir(exist_ok=True)
archive=out/f"feishu-meeting-remote-{manifest['version']}-chrome.zip"
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for name,p in sorted(files.items()):
        info=zipfile.ZipInfo(name,date_time=(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
        z.writestr(info,p.read_bytes())
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None and 'manifest.json' in z.namelist()
checksum=hashlib.sha256(archive.read_bytes()).hexdigest()
(out/'SHA256SUMS.txt').write_text(f'{checksum}  {archive.name}\n')
print(f'{archive.name}: {len(files)} files; SHA256 {checksum}')
