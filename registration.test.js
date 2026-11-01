import test from 'node:test';
import assert from 'node:assert/strict';
import {registrationInput,registrationDiscountInput,registrationDiscountComparison} from './app.js';
import {itemInput} from './api.js';
import {createServices} from './sync.js';

function draftForm() {
 const fd=new FormData();
 for(let n=0;n<3;n++){
  fd.append('included',String(n));fd.set('name-'+n,'상품 '+n);fd.set('price-'+n,String((n+1)*10000));fd.set('category-'+n,'생활용품');
 }
 fd.set('reason-0','실제로 필요해서');fd.set('reason-1','추가 할인을 받으려고');fd.set('reason-2','기타');fd.set('other-2','선물용');
 return fd;
}
function discountForm(){return new Map([
 ['discountMin','30000'],['discountUnit','PCT'],['discountValue','10'],['discountShipping','3000'],['discountFree','40000'],['discountFreeOn','on']
 ]);}
function reviewForm(){const fd=new FormData();for(const [k,v] of discountForm())fd.set(k,v);return fd;}
const drafts=[{source:'SCREENSHOT'},{source:'SCREENSHOT'},{source:'URL'}];

test('selected items keep their own reasons and only included bundle items trigger review',()=>{
 const fd=draftForm(),parsed=registrationInput(fd,drafts,'2026-11-01');
 assert.equal(parsed.needsDiscount,true);
 assert.deepEqual(parsed.items.map(i=>i.reasons),[['실제로 필요해서'],['추가 할인을 받으려고'],['기타']]);
 assert.equal(parsed.items[0].reasonOtherText,undefined);assert.equal(parsed.items[2].reasonOtherText,'선물용');
 assert.notDeepEqual(itemInput(parsed.items[0]).purchase_reasons,itemInput(parsed.items[1]).purchase_reasons);
 fd.delete('included');fd.append('included','0');fd.append('included','2');fd.delete('reason-1');
 assert.equal(registrationInput(fd,drafts,'2026-11-01').needsDiscount,false);
 fd.delete('reason-2');assert.throws(()=>registrationInput(fd,drafts,'2026-11-01'),/상품 2: 구매 이유/);
});

test('manual entry uses the same discount trigger and per-item deadline validation',()=>{
 const fd=new FormData();for(const [k,v] of Object.entries({name:'컵',price:'20000',category:'생활용품',reason:'추가 할인을 받으려고'}))fd.set(k,v);
 assert.equal(registrationInput(fd,[],'2026-11-01').needsDiscount,true);
 fd.set('reason','할인·한정 판매 때문에');fd.set('deadline','2026-11-31');
 assert.throws(()=>registrationInput(fd,[],'2026-11-01'),/판매 마감일/);
 fd.set('deadline','2026-11-03');assert.equal(registrationInput(fd,[],'2026-11-01').items[0].saleEndsAt,'2026-11-03');
});

test('needed switches map original draft positions to selected batch indexes',()=>{
 const fd=reviewForm();fd.append('needed','2');
 assert.deepEqual(registrationDiscountInput(fd,[0,2],'NEEDED').needed_item_indexes,[1]);
 fd.delete('needed');fd.append('needed','-1');assert.deepEqual(registrationDiscountInput(fd,[-1],'NEEDED').needed_item_indexes,[0]);
 fd.delete('needed');assert.deepEqual(registrationDiscountInput(fd,[0,2],'NEEDED').needed_item_indexes,[]);
 fd.set('discountValue','101');assert.throws(()=>registrationDiscountInput(fd,[0]),/100%/);
 fd.set('discountValue','10');fd.set('discountFree','0');assert.throws(()=>registrationDiscountInput(fd,[0]));
 fd.delete('discountFreeOn');assert.equal(registrationDiscountInput(fd,[0]).rule.free_shipping_minimum,null);
});

test('discount comparison matches the app for trap, smart bundle, fixed caps and empty selection',()=>{
 const fd=reviewForm();fd.set('needed','0');const items=[{price:198000},{price:170050}];
 let review=registrationDiscountInput(fd,[0,1],'NEEDED'),c=registrationDiscountComparison(items,review);
 assert.equal(c.trap,true);assert.equal(c.needed.pay,178200);assert.equal(c.all.pay,331245);assert.equal(c.extra,153045);
 fd.append('needed','1');review=registrationDiscountInput(fd,[0,1]);c=registrationDiscountComparison(items,review);
 assert.equal(c.trap,false);assert.equal(c.saved,36805);
 fd.set('discountUnit','WON');fd.set('discountValue','999999');fd.delete('discountFreeOn');
 c=registrationDiscountComparison(items,registrationDiscountInput(fd,[0,1]));assert.equal(c.all.pay,3000);assert.equal(c.all.discount,368050);
 fd.delete('needed');c=registrationDiscountComparison(items,registrationDiscountInput(fd,[0,1]));assert.equal(c.needed.pay,0);assert.equal(c.needed.shipping,0);
});

test('small basket retains shipping and percentage rounds half up',()=>{
 const fd=reviewForm();fd.set('discountMin','0');fd.set('needed','0');
 const c=registrationDiscountComparison([{price:10005}],registrationDiscountInput(fd,[0]));
 assert.equal(c.all.discount,1001);assert.equal(c.all.shipping,3000);assert.equal(c.all.pay,12004);assert.equal(c.remaining,29995);
});

test('registration sends per-item reasons and review together, retaining only needed items',async()=>{
 const {items}=registrationInput(draftForm(),drafts,'2026-11-01'),fd=reviewForm();fd.set('needed','2');
 const review=registrationDiscountInput(fd,[0,1,2],'NEEDED');
 let state={items:[],expenses:[]};let payload;
 const service=createServices(()=>state,fn=>{const next=structuredClone(state);fn(next);state=next;},()=> '2026-11-01',async(path,body)=>{
  assert.equal(path,'/items/batch');payload=body;
  return {items:[{id:'remote',decision:null,simulation:{id:'sim',start_date:'2026-11-02',end_date_exclusive:'2026-11-05',duration_days:3}}]};
 });
 const saved=await service.register(items,review);
 assert.deepEqual(payload.items,items.map(itemInput));assert.deepEqual(payload.discount_review,review);
 assert.equal(saved.length,1);assert.equal(saved[0].id,items[2].id);assert.deepEqual(saved[0].reasons,['기타']);assert.equal(saved[0].reasonOtherText,'선물용');assert.equal(state.expenses.length,0);
});

test('excluding every reviewed item completes without creating a simulation or expense',async()=>{
 const {items}=registrationInput(draftForm(),drafts,'2026-11-01'),review=registrationDiscountInput(reviewForm(),[0,1,2],'NEEDED');
 let state={items:[],expenses:[]};
 const service=createServices(()=>state,fn=>{const next=structuredClone(state);fn(next);state=next;},()=> '2026-11-01',async()=>({items:[]}));
 assert.deepEqual(await service.register(items,review),[]);assert.deepEqual(state,{items:[],expenses:[]});
});
