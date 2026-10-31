import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiClient,mapDrafts} from './api.js';
test('backend categories and absent price',()=>assert.deepEqual(mapDrafts({items:[{name:' 헤드폰 ',category:'DIGITAL',price:null}]}),[{name:'헤드폰',category:'디지털기기',price:'',source_url:''}]));
test('invalid backend price rejected',()=>assert.throws(()=>mapDrafts({items:[{name:'x',price:'100'}]})));
test('expired token renewed once',async()=>{let sessions=0,calls=0;const client=createAiClient(async(url,options)=>{if(url.endsWith('guest-sessions')){sessions++;return Response.json({access_token:'test'+sessions});}calls++;if(calls===1)return new Response('',{status:401});assert.equal(options.headers.Authorization,'Bearer test2');return Response.json({items:[{name:'test',price:100,category:'OTHER'}]});});assert.equal((await client('/item-drafts',{name:'test'})).length,1);assert.equal(sessions,2);assert.equal(calls,2);});
