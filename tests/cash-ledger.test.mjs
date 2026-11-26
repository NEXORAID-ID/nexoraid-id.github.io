import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFile,readdir} from 'node:fs/promises';import {cashLedger} from '../v4/cash-ledger.mjs';
test('cash ledger excludes noncash supplier usage and protects opening balance',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');const dir=new URL('../v4/migrations/',import.meta.url);for(const n of (await readdir(dir)).filter(x=>x.endsWith('.sql')).sort())sql.exec(await readFile(new URL(n,dir),'utf8'));
 const actor='111111111111111111';sql.prepare('INSERT INTO users(id,display_name,created_at) VALUES(?,?,?)').run(actor,'Owner',1);
 const db={prepare(q){return{args:[],bind(...a){this.args=a;return this;},async first(){return sql.prepare(q).get(...this.args)||null;},async all(){return{results:sql.prepare(q).all(...this.args)}},async run(){return{meta:{changes:Number(sql.prepare(q).run(...this.args).changes)}}}}},async batch(ss){sql.exec('BEGIN');try{const result=[];for(const s of ss)result.push(await s.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const call=(role,m,b)=>cashLedger({p:'/api/workspace/cash-ledger',m,user:{id:actor,role},env:{DB:db},readBody:async()=>b});
 assert.equal((await call('management','GET')).status,403);
 assert.equal((await(await call('owner','GET')).json()).estimated_balance,null);
 assert.equal((await call('owner','POST',{amount:100000,effective_at:10,reference:'opening-001',confirmed:true})).status,201);
 assert.equal((await call('owner','POST',{amount:200000,effective_at:10,reference:'opening-002',confirmed:true})).status,409);
 assert.throws(()=>sql.exec('UPDATE cash_opening SET amount=0'),/opening_immutable/);
 sql.exec("INSERT INTO suppliers VALUES('s','Supplier',11)");
 const move=sql.prepare('INSERT INTO supplier_movements VALUES(?,?,?,?,?,?,?,?)');move.run('m1','s','deposit',30000,'deposit-001','deposit',actor,12);move.run('m2','s','usage',10000,'usage-001','usage',actor,13);move.run('m3','s','withdrawal',5000,'withdraw-001','withdraw',actor,14);
 const l=await(await call('owner','GET')).json();assert.equal(l.incoming,5000);assert.equal(l.outgoing,30000);assert.equal(l.estimated_balance,75000);assert.equal(l.items.length,2);sql.close();
});
