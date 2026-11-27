import test from 'node:test';
import assert from 'node:assert/strict';
import {searchKey,searchCatalog,deadlineLabel,xlsxBytes,csvText,createViewData,createToast} from '../v4/portal-ui.mjs';
test('portal search normalizes accents and finds multiword catalog entries',()=>{
 const catalog=[{id:'gta-heist',name:'Joki Heist',category:'gaming'},{id:'other',name:'Akun Game'}];
 assert.equal(searchKey('  HéIST  '),'heist');
 assert.deepEqual(searchCatalog(catalog,'heist gaming').map(s=>s.id),['gta-heist']);
 assert.deepEqual(searchCatalog(catalog,' '),[]);
 assert.deepEqual(searchCatalog(catalog,'not found'),[]);
});
test('deadline shows WIB and does not mark completed orders late',()=>{
 const o={due_at:1,status:'processing',priority:'urgent'};
 assert.match(deadlineLabel(o,2000),/^Terlambat.*WIB.*Mendesak/);
 assert.doesNotMatch(deadlineLabel({...o,status:'completed'},2000),/Terlambat/);
 assert.equal(deadlineLabel({}), '');
});
test('xlsx encodes formula-like input as escaped inline strings',()=>{
 const buf=Buffer.from(xlsxBytes([['=1+1','<tag>&',42]]));
 assert.equal(buf.readUInt32LE(0),0x04034b50);
 assert.ok(buf.includes(Buffer.from('t="inlineStr"')));
 assert.ok(buf.includes(Buffer.from('&lt;tag&gt;&amp;')));
 assert.ok(!buf.includes(Buffer.from('<f>')));
 assert.ok(buf.includes(Buffer.from('<v>42</v>')));
});

test('CSV protects formula-like strings including whitespace and control prefixes, preserves numbers and quoting',()=>{
 const row=['=1+1',' +SUM(1)','\n@foo','\u200b-2','\ufeff=2','a,"b"','a\nb',-42,42,null];
 assert.equal(csvText([row]),'\ufeff"\'=1+1","\' +SUM(1)","\'\n@foo","\'\u200b-2","\'\ufeff=2","a,""b""","a\nb","-42","42",""');
});
test('view loader recovers after a synchronous failure and coalesces overlapping calls',async()=>{
 const host={},view=createViewData({isExpired:()=>false,onError:()=>{}});
 await assert.rejects(view(host,()=>{throw Error('network failure')},()=>{},true),/network failure/);
 let resolve;const first=view(host,()=>new Promise(r=>{resolve=r}),()=>{},true);
 await assert.rejects(view(host,()=>42,()=>{},true),e=>e.busy===true);
 resolve('recovered');assert.equal(await first,'recovered');
 assert.equal(await view(host,()=>42,()=>{},true),42);
});

test('toast deduplicates same severity, caps visible items, and expires without removing newer messages',()=>{
 const children=[],timers=[];
 const host={children,append(el){children.push(el)},get firstElementChild(){return children[0]}};
 const old=globalThis.document;
 globalThis.document={createElement(){return {dataset:{},remove(){const i=children.indexOf(this);if(i>=0)children.splice(i,1)}}}};
 try{
  const toast=createToast(host,{limit:2,duration:10,schedule:fn=>timers.push(fn)});
  toast('Simpan berhasil');toast('Simpan berhasil');assert.equal(children.length,1);
  toast('Simpan berhasil',true);assert.equal(children.length,2);assert.equal(children[1].dataset.kind,'error');
  toast('Koneksi terputus',true);assert.equal(children.length,2);assert.equal(children[1].textContent,'Koneksi terputus');
  timers[0]();assert.equal(children.length,2);
  timers[1]();assert.equal(children.length,1);
  timers[2]();assert.equal(children.length,0);
 }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});

test('catalog search stops once the requested result limit is reached',()=>{
 let reads=0;const catalog=Array.from({length:500},(_,i)=>({id:String(i),get name(){reads++;return 'Heist';}}));
 assert.deepEqual(searchCatalog(catalog,'heist',3).map(s=>s.id),['0','1','2']);
 assert.equal(reads,3);assert.deepEqual(searchCatalog(catalog,'heist',0),[]);assert.equal(reads,3);
});

import {supportKindLabel,expenseCategoryLabel} from '../v4/portal-ui.mjs';
test('Indonesian labels preserve unknown codes and never resolve prototype properties',()=>{
 assert.equal(supportKindLabel('refund'),'Pengembalian dana');assert.equal(expenseCategoryLabel('supplier'),'Pemasok');assert.equal(supportKindLabel('constructor'),'constructor');assert.equal(expenseCategoryLabel('future'),'future');
});
