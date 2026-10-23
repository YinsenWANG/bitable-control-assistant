const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../extension'),manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
const files=fs.readdirSync(root,{recursive:true}).filter(n=>fs.statSync(path.join(root,n)).isFile());
assert.equal(manifest.manifest_version,3);assert.ok(manifest.description.length<=132);assert.deepEqual(manifest.permissions,['storage']);
assert.ok(Object.values(manifest.commands).filter(c=>c.suggested_key).length<=4,'Chrome permits at most four suggested commands');
const refs=[manifest.background.service_worker,manifest.options_page,manifest.action.default_popup,...Object.values(manifest.icons),...Object.values(manifest.action.default_icon),...manifest.content_scripts.flatMap(c=>[...c.js,...(c.css||[])])];
for(const name of refs)assert.ok(files.includes(name),`Missing asset: ${name}`);
for(const file of files){
  const data=fs.readFileSync(path.join(root,file));
  if(file.endsWith('.js'))assert.equal(spawnSync(process.execPath,['--check',path.join(root,file)]).status,0,file);
  if(file.endsWith('.html'))for(const match of data.toString().matchAll(/(?:src|href)="([^"]+)"/g))if(!/^(https?:|#)/.test(match[1]))assert.ok(files.includes(match[1]),match[1]);
  if(file.endsWith('.png')){const size=Number(path.basename(file,'.png'));assert.equal(data.readUInt32BE(16),size);assert.equal(data.readUInt32BE(20),size);}
  if(/\.(js|html|css|json)$/.test(file)){
    assert.ok(!/\beval\s*\(|new\s+Function\s*\(|\bfetch\s*\(|XMLHttpRequest|https?:\/\/127\.0\.0\.1|\/Users\//.test(data.toString()),`Unexpected runtime resource: ${file}`);
  }
}
console.log(`Manifest, ${files.length} runtime files, syntax, icons and local references verified.`);
