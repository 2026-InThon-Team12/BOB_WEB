import test from 'node:test';
import assert from 'node:assert/strict';
import {createServices} from './sync.js';
import {createApiClient,productUrl,remoteItem} from './api.js';
const item=()=>({id:'i',name:'컵',price:20000,category:'생활용품',reasons:['실제로 필요해서'],start:'2026-11-02',days:3,status:'active',answers:{},reflections:{}});
const row=(decision=null)=>({id:'remote',decision,simulation:{id:'sim',start_date:'2026-11-02',end_date_exclusive:'2026-11-05',duration_days:3},purchase:decision==='BUY'?{id:'purchase',purchased_on:'2026-11-05'}:null});
function setup(request,date='2026-11-05') {let s={apiBase:'https://bob-be.vercel.app',items:[],expenses:[]};return {get:()=>s,service:createServices(()=>s,fn=>{const next=structuredClone(s);fn(next);s=next;},()=>date,request)};}
test('registration retry keeps the same idempotency key and duplicate clicks share a request',async()=>{
 let count=0;const keys=[];const h=setup(async(path,body,base,opts)=>{keys.push(opts.idempotencyKey);count++;if(count===1)throw Error('offline');await new Promise(r=>setTimeout(r,5));return {items:[row()]};});
 await assert.rejects(h.service.register([item()],null));assert.equal(h.get().items.length,0);assert.ok(h.get().pendingRegistration);
 const [a,b]=await Promise.all([h.service.register([],null),h.service.register([],null)]);assert.deepEqual(a,b);assert.equal(count,2);assert.equal(new Set(keys).size,1);assert.equal(h.get().items.length,1);assert.equal(h.get().pendingRegistration,undefined);
});
test('definitive invalid input can be edited, but ambiguous server failure stays pending',async()=>{
 const h=setup(async()=>{throw Object.assign(Error('bad'),{status:422});});await assert.rejects(h.service.register([item()],null));assert.equal(h.get().pendingRegistration,undefined);
 const bad=setup(async()=>({items:[]}));await assert.rejects(bad.service.register([item()],null));assert.ok(bad.get().pendingRegistration);
});
test('decision failure preserves local state and successful Buy adds exactly one expense',async()=>{
 let fail=true;const h=setup(async(path)=>{if(path.endsWith('result-summary'))throw Error('AI offline');if(fail)throw Error('offline');return row('BUY');});h.get().items.push(remoteItem(item(),row()));
 await assert.rejects(h.service.decide('i','buy'));assert.equal(h.get().items[0].status,'active');assert.equal(h.get().expenses.length,0);
 fail=false;await Promise.all([h.service.decide('i','buy'),h.service.decide('i','buy')]);assert.equal(h.get().items[0].status,'buy');assert.equal(h.get().items[0].purchaseId,'purchase');assert.equal(h.get().expenses.length,1);
 await assert.rejects(h.service.decide('i','buy'));assert.equal(h.get().expenses.length,1);
});
test('HOLD response preserves local observation gaps even when server omits dates',async()=>{
 const h=setup(async(path)=>{if(path.endsWith('result-summary'))throw Error('no AI');return {...row('HOLD'),simulation:{...row().simulation,duration_days:10,end_date_exclusive:'2026-11-18'}};},'2026-11-10');h.get().items.push(remoteItem(item(),row()));
 await h.service.decide('i','hold');const i=h.get().items[0];assert.equal(i.status,'active');assert.equal(i.summary,undefined);assert.equal(i.observationDates.length,10);assert.equal(i.observationDates[3],'2026-11-11');assert.equal(i.endDate,'2026-11-18');
});

test('early remote Bye saves only after success, preserves answers, and creates no expense',async()=>{
 let fail=true;const calls=[];
 const h=setup(async(path,body,base,opts)=>{calls.push({path,body,opts});if(fail)throw Error('offline');return row('GIVE_UP');},'2026-11-03');
 h.get().items.push(remoteItem({...item(),answers:{'2026-11-02':'yes'}},row()));
 const before=structuredClone(h.get());
 await assert.rejects(h.service.decide('i','bye'),/offline/);assert.deepEqual(h.get(),before);
 fail=false;await h.service.decide('i','bye');
 assert.equal(calls.length,2);assert.ok(calls.every(c=>c.path==='/items/remote/decision'&&c.body.decision==='GIVE_UP'&&c.opts.method==='PUT'));
 assert.equal(calls[0].opts.idempotencyKey,calls[1].opts.idempotencyKey);
 assert.equal(h.get().items[0].status,'bye');assert.deepEqual(h.get().items[0].answers,before.items[0].answers);assert.equal(h.get().expenses.length,0);
 await assert.rejects(h.service.decide('i','bye'));assert.equal(calls.length,2);
});

test('early HOLD remains unavailable',async()=>{
 let calls=0;const h=setup(async()=>{calls++;return row('HOLD');},'2026-11-03');h.get().items.push(remoteItem(item(),row()));
 const before=structuredClone(h.get());await assert.rejects(h.service.decide('i','hold'));assert.equal(calls,0);assert.deepEqual(h.get(),before);
});
test('daily remote failure freezes one fallback per day; post questions use purchase endpoint',async()=>{
 const calls=[];const h=setup(async(path)=>{calls.push(path);throw Error('offline');},'2026-11-03');h.get().items.push(remoteItem(item(),row()));
 await Promise.all([h.service.question('i'),h.service.question('i')]);await h.service.question('i');assert.equal(calls.length,1);assert.ok(h.get().items[0].reflections['pre:2026-11-03'].fallback);
 h.get().items[0].status='buy';h.get().items[0].purchaseId='p';h.get().items[0].decided='2026-11-03';await h.service.question('i');assert.equal(calls[1],'/purchases/p/local-question');assert.ok(h.get().items[0].reflections['post:2026-11-03']);
});
test('delayed hold replay uses server extension dates and delayed Buy uses actual purchase date',async()=>{
 const h=setup(async(path)=>{if(path.endsWith('result-summary'))throw Error('no AI');return {...row('HOLD'),simulation:{...row().simulation,duration_days:10,end_date_exclusive:'2026-11-13'}};},'2026-11-08');h.get().items.push(remoteItem(item(),row()));
 await h.service.decide('i','hold');assert.equal(h.get().items[0].observationDates[3],'2026-11-06');assert.equal(h.get().items[0].observationDates.at(-1),'2026-11-12');
 const b=setup(async(path)=>{if(path.endsWith('result-summary'))throw Error('no AI');return row('BUY');},'2026-11-08');b.get().items.push(remoteItem(item(),row()));await b.service.decide('i','buy');assert.equal(b.get().expenses[0].date,'2026-11-05');
});
test('review waits 14 days and server failure does not save a fictitious review',async()=>{
 const h=setup(async()=>{throw Error('offline');},'2026-11-19');h.get().items.push(remoteItem(item(),row('BUY')));await assert.rejects(h.service.review('i',7));assert.equal(h.get().items[0].review,undefined);
});
test('persistent sessions survive reload and concurrent first requests share one guest',async()=>{
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};let guests=0;
 const fetcher=async(url,options)=>{if(url.endsWith('guest-sessions')){guests++;return Response.json({access_token:'token'});}assert.equal(options.headers.Authorization,'Bearer token');return Response.json({ok:true});};
 const c=createApiClient(fetcher,storage);await Promise.all([c('/one',{}),c('/two',{})]);await createApiClient(fetcher,storage)('/three',{});assert.equal(guests,1);
 const denied=createApiClient(async()=>new Response('',{status:401}),storage);await assert.rejects(denied('/items/id/decision',{},undefined,{existingResource:true}),e=>e.status===401);assert.equal(map.size,1);
});
test('product links require HTTPS and exclude credentials and excessive length',()=>{
 assert.equal(productUrl(' https://example.com/item '),'https://example.com/item');for(const url of ['http://example.com','javascript:alert(1)','https://user:pass@example.com','https://example.com/'+ 'x'.repeat(2048)])assert.throws(()=>productUrl(url));
});
