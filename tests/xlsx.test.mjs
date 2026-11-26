import test from 'node:test';import assert from 'node:assert/strict';import {xlsxBytes} from '../v4/portal-ui.mjs';
test('native XLSX zip contains valid local entries and inert strings',async()=>{
 const bytes=Buffer.from(xlsxBytes([['=1+1','<test>&',123],['Nama',0]]));
 const files={};let p=0;
 while(bytes.readUInt32LE(p)===0x04034b50){const size=bytes.readUInt32LE(p+18),n=bytes.readUInt16LE(p+26),extra=bytes.readUInt16LE(p+28),name=bytes.subarray(p+30,p+30+n).toString(),start=p+30+n+extra,data=bytes.subarray(start,start+size);let crc=0xffffffff;for(const x of data){crc^=x;for(let j=0;j<8;j++)crc=(crc>>>1)^(0xedb88320&-(crc&1));}assert.equal((crc^0xffffffff)>>>0,bytes.readUInt32LE(p+14));files[name]=data.toString();p=start+size;}
 assert.equal(Object.keys(files).length,5);const sheet=files['xl/worksheets/sheet1.xml'];assert.match(sheet,/t="inlineStr"/);assert.match(sheet,/=1\+1/);assert.match(sheet,/&lt;test&gt;&amp;/);assert.match(sheet,/<c r="C1"><v>123<\/v><\/c>/);assert.doesNotMatch(sheet,/<f[ >]/);assert.equal(bytes.readUInt32LE(p),0x02014b50);assert.equal(bytes.readUInt32LE(bytes.length-22),0x06054b50);
});
