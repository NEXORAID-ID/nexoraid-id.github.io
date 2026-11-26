import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import worker from '../v4/worker.mjs';
test('ticket outbox queues new orders only and rolls back with order',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 db.exec(await readFile(new URL('../v4/migrations/0001_initial.sql',import.meta.url),'utf8'));
 db.exec("INSERT INTO users(id,display_name,created_at) VALUES('c','Customer',1); INSERT INTO orders(id,customer_id,service_id,quantity,catalog_price,created_at,updated_at) VALUES('old','c','test',1,'Rp',1,1)");
 db.exec(await readFile(new URL('../v4/migrations/0007_web_ticket_outbox.sql',import.meta.url),'utf8'));
 assert.equal(db.prepare('SELECT COUNT(*) n FROM web_ticket_outbox').get().n,0);
 const add=db.prepare("INSERT INTO orders(id,customer_id,service_id,quantity,catalog_price,created_at,updated_at) VALUES(?,'c','test',1,'Rp',1,1)");
 db.exec('BEGIN');add.run('rolled-back');db.exec('ROLLBACK');
 add.run('new');assert.equal(db.prepare('SELECT order_id FROM web_ticket_outbox').get().order_id,'new');
 assert.throws(()=>add.run('new'));assert.equal(db.prepare('SELECT COUNT(*) n FROM web_ticket_outbox').get().n,1);
 db.close();
});
test('machine ticket endpoint requires key and exact guild',async()=>{
 const env={DB:{},PUBLIC_ORIGIN:'https://nexoraid.example',NEXORAID_BOT_API_KEY:'a'.repeat(64)};
 const req=headers=>new Request(env.PUBLIC_ORIGIN+'/api/bot/ticket-sync',{headers});
 assert.equal((await worker.fetch(req({}),env)).status,401);
 assert.equal((await worker.fetch(req({authorization:'Bearer '+env.NEXORAID_BOT_API_KEY,'x-discord-guild-id':'1'}),env)).status,403);
});
