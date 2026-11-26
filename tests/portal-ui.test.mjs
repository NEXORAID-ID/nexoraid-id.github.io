import test from 'node:test';
import assert from 'node:assert/strict';
import {searchKey,searchCatalog,deadlineLabel,xlsxBytes} from '../v4/portal-ui.mjs';
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
