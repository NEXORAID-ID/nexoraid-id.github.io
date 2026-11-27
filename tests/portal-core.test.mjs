import test from 'node:test';import assert from 'node:assert/strict';
import {createNavigator,createPortalApi,VIEW_IDS} from '../v4/portal-core.mjs';
test('navigation only opens visible authorized views',async()=>{
 const elements=Object.fromEntries(Object.values(VIEW_IDS).map(id=>[id,{hidden:true}]));const buttons=[{dataset:{view:'orders'},hidden:false,setAttribute(){}},{dataset:{view:'business'},hidden:true,setAttribute(){}}];let called=0;
 const view=createNavigator({get:id=>elements[id],buttons:()=>buttons,allowed:()=>true,loaders:{business:()=>called++}});
 assert.equal(await view('business'),false);assert.equal(called,0);assert.equal(await view('orders'),true);assert.equal(elements.orderLayout.hidden,false);assert.equal(elements.businessView.hidden,true);
});
test('API expires active session on 401 and never replays offline writes',async()=>{
 let expired=false,online=true,calls=0;const api=createPortalApi({isExpired:()=>expired,expiredError:()=>Error('expired'),hasUser:()=>true,expireSession:()=>{expired=true},isOnline:()=>online,fetcher:async()=>{calls++;return new Response('{}',{status:401})}});
 online=false;await assert.rejects(api('orders',{}),/koneksi/);assert.equal(calls,0);online=true;await assert.rejects(api('me'),/expired/);assert.equal(expired,true);await assert.rejects(api('orders',{}),/expired/);assert.equal(calls,1);
});

import {latestRequest} from '../v4/portal-core.mjs';
test('latest request rejects both prior responses in an A-B-A sequence',()=>{const begin=latestRequest(),first=begin(),second=begin(),third=begin();assert.equal(first(),false);assert.equal(second(),false);assert.equal(third(),true);});
