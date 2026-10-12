const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const filename = path.resolve(__dirname, '../src/lib/organization.ts');
const loaded = new Module(filename, module);
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,filename);
const {folderPath,folderDescendants}=loaded.exports;
test('Nested paths and move exclusions preserve sibling folders',()=>{
 const rows=[{id:'a',parent_id:null,name:'2026'},{id:'b',parent_id:'a',name:'Final'},{id:'c',parent_id:'b',name:'Reviewed'},{id:'d',parent_id:null,name:'Other'}];
 assert.deepEqual(folderPath(rows,'c').map(f=>f.name),['2026','Final','Reviewed']);
 assert.deepEqual([...folderDescendants(rows,'a')],['a','b','c']);
 assert.deepEqual(folderPath(rows,'missing'),[]);
});
test('Stale cyclic responses do not freeze navigation',()=>{
 const rows=[{id:'a',parent_id:'b',name:'A'},{id:'b',parent_id:'a',name:'B'}];
 assert.equal(folderPath(rows,'a').length,2);
 assert.equal(folderDescendants(rows,'a').size,2);
});
