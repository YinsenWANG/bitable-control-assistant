const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../extension'),manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
const files=fs.readdirSync(root,{recursive:true}).filter(n=>fs.statSync(path.join(root,n)).isFile());
assert.equal(manifest.manifest_version,3);assert.ok(manifest.description.length<=132);assert.deepEqual(manifest.permissions,['storage']);
assert.equal(manifest.version,JSON.parse(fs.readFileSync(path.join(root,'../package.json'))).version);
assert.ok(Number(manifest.minimum_chrome_version)>=111);
assert.deepEqual(manifest.host_permissions,['https://*.feishu.cn/*']);
assert.ok(!manifest.externally_connectable&&!manifest.web_accessible_resources&&!manifest.sandbox);
const csp=manifest.content_security_policy.extension_pages;
for(const directive of ["default-src 'self'","script-src 'self'","object-src 'none'","connect-src 'none'"])assert.ok(csp.includes(directive),directive);
assert.ok(Object.values(manifest.commands).filter(c=>c.suggested_key).length<=4,'Chrome permits at most four suggested commands');
const refs=[manifest.background.service_worker,manifest.options_page,manifest.action.default_popup,...Object.values(manifest.icons),...Object.values(manifest.action.default_icon),...manifest.content_scripts.flatMap(c=>[...c.js,...(c.css||[])])];
for(const name of refs)assert.ok(files.includes(name),`Missing asset: ${name}`);
for(const file of files){
  const data=fs.readFileSync(path.join(root,file));
  if(file.endsWith('.js'))assert.equal(spawnSync(process.execPath,['--check',path.join(root,file)]).status,0,file);
  if(file.endsWith('.html')){
    const html=data.toString();
    for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g))if(!/^(https?:|#)/.test(match[1]))assert.ok(files.includes(match[1]),match[1]);
    for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){assert.ok(/src="[^":]+\.js"/.test(match[1]),`Packaged script required: ${file}`);assert.equal(match[2].trim(),'');}
    assert.ok(!/\son[a-z]+\s*=/i.test(html),`Inline event handler: ${file}`);
  }
  if(file.endsWith('.png')){assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a');const size=Number(path.basename(file,'.png'));assert.equal(data.readUInt32BE(16),size);assert.equal(data.readUInt32BE(20),size);}
  if(/\.(js|html|css|json)$/.test(file)){
    assert.ok(!/\beval\s*\(|new\s+Function\s*\(|\bfetch\s*\(|XMLHttpRequest|https?:\/\/127\.0\.0\.1|\/Users\//.test(data.toString()),`Unexpected runtime resource: ${file}`);
  }
}
console.log(`Manifest, ${files.length} runtime files, syntax, icons and local references verified.`);
