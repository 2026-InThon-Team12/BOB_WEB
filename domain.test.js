import test from 'node:test';
import assert from 'node:assert/strict';
import {addDays,dateKey,daysInMonth,newFunding,fundingPlan,replaceGoal,refreshGoals,migrateWeb,holdItem,simulationReady,reflectionMetrics,reflectionDue} from './domain.js';
import {fallbackQuestion,validAnswer,validSpec,answerLabel} from './questions.js';
import {importBackup,portableBackup} from './backup.js';
import {walletTotals,validate,reportSummary,usageComparison,recordGoalDecision} from './app.js';
const state=()=>({version:2,items:[],goals:[],impulses:[],expenses:[],incomes:[],budgets:{}});
const budget=income=>({income,food:0,living:0,transport:0,saving:0});
const item=()=>({id:'i',name:'컵',category:'생활용품',price:20000,reasons:['실제로 필요해서'],status:'active',start:'2026-11-02',days:3,answers:{},reflections:{}});
const goal=(data,on='2026-11-01',price=1000000)=>({id:'g',name:'여행',price,active:true,funding:newFunding(data,on)});
for(const month of ['2027-02','2028-02','2026-11','2026-12'])test('calendar accrual conserves all money: '+month,()=>{
 const d=state(),days=daysInMonth(month),start=month+'-01';d.budgets[month]=budget(days*1000);const g=goal(d,start);
 assert.equal(fundingPlan(g,d,start).saved,0);
 assert.equal(fundingPlan(g,d,addDays(start,days-1)).saved,(days-1)*1000);
 assert.equal(fundingPlan(g,d,addDays(start,days)).saved,days*1000);
});
test('spending first reduces unallocated budget, then accrued savings, independent of category',()=>{
 const d=state();d.budgets['2026-11']=budget(300000);const g=goal(d);
 assert.equal(fundingPlan(g,d,'2026-11-16').saved,150000);
 d.expenses.push({id:'e',name:'구매',date:'2026-11-16',amount:200000,source:'item',bucket:'식비'});
 const p=fundingPlan(g,d,'2026-11-16');assert.equal(p.saved,100000);assert.equal(p.dailySaving,null);
 assert.deepEqual(fundingPlan(g,d,'2026-11-16'),p);assert.equal(walletTotals(d,'2026-11').balance,100000);
});
test('starting midmonth uses remaining funds and resisting is not a second savings credit',()=>{
 const d=state();d.budgets['2026-11']=budget(300000);d.expenses.push({id:'e',date:'2026-11-01',amount:210000,bucket:'자유 소비'});
 const g=goal(d,'2026-11-16',200000);d.goals.push(g);
 assert.equal(fundingPlan(g,d,'2026-11-16').dailySaving,6000);
 recordGoalDecision(d,'g','치킨',23000,'resisted','2026-11-16');
 assert.equal(fundingPlan(g,d,'2026-11-17').saved,6000);assert.match(fundingPlan(g,d,'2026-11-16').eta,/2026-12/);
});
test('goal replacement carries only available money and does not allocate the month twice',()=>{
 const d=state();d.budgets['2026-11']=budget(300000);d.goals.push(goal(d));
 replaceGoal(d,{id:'next',name:'다음',price:900000},'2026-11-16',900000);
 assert.equal(d.goals[1].funding.openingBalance,150000);assert.equal(d.goals[1].funding.reservedThisMonth,150000);
 assert.equal(fundingPlan(d.goals[0],d,'2026-11-16').saved,0);
 assert.equal(fundingPlan(d.goals[1],d,'2026-11-17').saved,160000);
});
test('completed goals freeze; legacy migration preserves records but never invents historical savings',()=>{
 const d=state();d.budgets['2026-11']=budget(300000);d.goals.push(goal(d,'2026-11-01',10000));refreshGoals(d,'2026-11-02');
 assert.equal(d.goals[0].achieved,true);d.expenses.push({date:'2026-11-03',amount:300000,bucket:'자유 소비'});
 assert.equal(fundingPlan(d.goals[0],d,'2026-11-03').saved,10000);
 const old={...d,version:1,goals:[{id:'old',active:true,price:30000},d.goals[0]],impulses:[{id:'x',amount:20000}]};
 const migrated=migrateWeb(old,'2026-11-05');assert.equal(migrated.goals[0].funding.openingBalance,0);assert.deepEqual(migrated.goals[1],old.goals[1]);assert.deepEqual(migrated.impulses,old.impulses);assert.equal(old.version,1);
});
test('late holds preserve gaps and stop at the sale deadline',()=>{
 const i=item();i.saleEndsAt='2026-11-12';i.summary={text:'old'};
 holdItem(i,'2026-11-10');assert.deepEqual(i.observationDates,['2026-11-02','2026-11-03','2026-11-04','2026-11-11','2026-11-12']);
 assert.equal(i.endDate,'2026-11-13');assert.equal(i.summary,undefined);assert.equal(reflectionDue(i,'2026-11-10'),false);
 assert.equal(simulationReady(i,'2026-11-12'),false);assert.equal(simulationReady(i,'2026-11-13'),true);assert.throws(()=>holdItem(i,'2026-11-13'));
});
test('final prediction, response coverage, early purchase and unknown answers govern comparisons',()=>{
 const i=item();
 for(let n=0;n<3;n++){const date=addDays(i.start,n),q=fallbackQuestion(i,date);assert.ok(validSpec(q.spec));q.answer=n===2?{number_value:15}:{choice_code:q.spec.options.find(o=>o.code!=='UNSURE').code};assert.ok(validAnswer(q.spec,q.answer));i.reflections['pre:'+date]=q;}
 assert.equal(i.reflections['pre:2026-11-04'].templateCode,'EXPECTED_USE_DAYS');assert.equal(reflectionMetrics(i,'2026-11-04').eligible,false);assert.equal(reflectionMetrics(i,'2026-11-05').eligible,true);
 i.status='buy';i.decided='2026-11-05';i.review=0;assert.equal(usageComparison(i,'2026-11-19').expected,7);assert.equal(usageComparison(i,'2026-11-19').actual,0);
 i.decided='2026-11-04';assert.equal(reflectionMetrics(i,'2026-11-20').eligible,false);
 i.decided='2026-11-05';i.reflections['pre:2026-11-02'].answer={choice_code:'UNSURE'};assert.equal(reflectionMetrics(i,'2026-11-20').eligible,false);
});
test('all fallback stages produce usable specs; invalid answers are rejected',()=>{
 const i=item();i.status='buy';i.decided='2026-11-01';
 for(const age of [0,3,4,29,30,90,365])assert.ok(validSpec(fallbackQuestion(i,addDays(i.decided,age)).spec));
 const spec={type:'INTEGER',minimum:0,maximum:30,unit:'DAYS',options:[{code:'UNSURE',label:'모름'}]};
 for(const value of [{number_value:-1},{number_value:31},{number_value:1.2},{number_value:1,choice_code:'UNSURE'},{choice_code:'OTHER'}])assert.equal(validAnswer(spec,value),false);
 assert.ok(validAnswer(spec,{number_value:0}));assert.equal(answerLabel(spec,{number_value:0}),'0일');
});
test('KST dates remain consistent across device timezones and app backup timestamps',()=>{
 assert.equal(dateKey(new Date('2026-10-31T16:00:00Z')),'2026-11-01');
 const raw={app:'bob',version:4,data:{items:{i:{id:'i',name:'컵',price:20000,category:'daily',reasons:['need'],source:'manual',status:'simulating',createdAt:'2026-10-31T16:00:00Z',simulation:{startAt:'2026-11-01T15:00:00Z',durationDays:3},remoteId:'secret'}},questions:{},answers:{},goals:{},expenses:{},impulses:{},budgets:{}}};
 const out=validate(importBackup(raw,'2026-11-01'));assert.equal(out.items[0].createdAt,'2026-11-01');assert.equal(out.items[0].start,'2026-11-02');assert.equal(out.items[0].remoteId,undefined);
 out.items[0].remoteId='server';out.pendingRegistration={id:'request'};const exported=portableBackup(out);assert.equal(exported.items[0].remoteId,undefined);assert.equal(exported.pendingRegistration,undefined);assert.equal(out.items[0].remoteId,'server');
});
test('monthly report separates registration cohort from decisions and cancelled resisted entries',()=>{
 const d=state();d.items=[{...item(),status:'bye',createdAt:'2026-10-01',decided:'2026-11-01'},{...item(),id:'new',createdAt:'2026-11-01'}];d.impulses=[{amount:5000,date:'2026-11-01',cancelledAt:'2026-11-02'},{amount:1000,date:'2026-11-01'}];
 assert.deepEqual(reportSummary(d,'2026-11'),{total:1,bye:1,percent:0,saved:21000,reviewed:0});
});
