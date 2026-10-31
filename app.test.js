import test from 'node:test';
import assert from 'node:assert/strict';
import {duration,payment} from './app.js';
test('simulation price boundaries match mobile policy',()=>{assert.equal(duration(0),3);assert.equal(duration(30000),3);assert.equal(duration(30001),7);assert.equal(duration(99999),7);assert.equal(duration(100000),14)});
test('discount compares final cost including shipping',()=>{assert.equal(payment(0,30000,10,3000,40000),0);assert.equal(payment(29000,30000,10,3000,40000),32000);assert.equal(payment(30000,30000,10,3000,40000),30000);assert.equal(payment(40000,30000,10,3000,40000),36000)});

test('calendar matches actual month boundaries and leap years',async()=>{const {calendarMonth}=await import('./app.js');assert.deepEqual(calendarMonth(new Date(2026,10,1)),{year:2026,month:11,today:1,offset:0,days:30});assert.equal(calendarMonth(new Date(2028,1,29)).days,29);assert.equal(calendarMonth(new Date(2026,11,31)).days,31);});

test('daily cells map answers and preserve missing dates across months',async()=>{const {simulationCells}=await import('./app.js');assert.deepEqual(simulationCells({start:'2026-10-30',days:4,answers:{'2026-10-30':'yes','2026-10-31':'no','2026-11-01':'unsure'}}),[{date:'2026-10-30',answer:'yes'},{date:'2026-10-31',answer:'no'},{date:'2026-11-01',answer:'unsure'},{date:'2026-11-02',answer:'empty'}]);});

test('goal images accept local raster data and reject executable or remote sources',async()=>{const {validGoalImage}=await import('./app.js');assert.equal(validGoalImage('data:image/png;base64,iVBORw0KGgo='),true);for(const value of [undefined,'javascript:alert(1)','https://example.com/picture.png','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,'+'A'.repeat(2800000)])assert.equal(validGoalImage(value),false);});

test('cabinet keeps nine goals per page in rows of three, with bounded navigation',async()=>{
 const {goalCabinetPage}=await import('./app.js');
 const goals=Array.from({length:19},(_,i)=>({id:`goal-${i+1}`,name:`목표 ${i+1}`,price:1000,active:i===18,achieved:true}));
 const first=goalCabinetPage(goals,0),second=goalCabinetPage(goals,1),last=goalCabinetPage(goals,99);
 for(const html of [first,second]){
  assert.equal((html.match(/class="cabinet-goal"/g)||[]).length,9);
  for(const shelf of html.split('<div class="cabinet-shelf">').slice(1))assert.equal((shelf.split('</div>')[0].match(/class="cabinet-goal"/g)||[]).length,3);
 }
 assert.match(first,/data-id="goal-1"/);assert.doesNotMatch(first,/data-id="goal-10"/);
 assert.match(second,/data-id="goal-10"/);assert.doesNotMatch(second,/data-id="goal-9"/);
 assert.equal((last.match(/class="cabinet-goal"/g)||[]).length,1);
 assert.match(last,/data-page="2"/);assert.match(last,/aria-label="다음 페이지" disabled/);
 assert.match(first,/aria-label="이전 페이지" disabled/);
 assert.doesNotMatch(goalCabinetPage(goals.slice(0,9)),/class="cabinet-pagination"/);
 assert.match(goalCabinetPage([],3),/달성한 목표가 이곳에/);
 assert.match(goalCabinetPage(goals,-1),/data-page="0"/);
});

test('only completed goals enter the cabinet',async()=>{
 const {goalCabinetPage}=await import('./app.js');
 const html=goalCabinetPage([{id:'pending',name:'진행 중',price:10000,active:true},{id:'done',name:'달성한 목표',price:10000,achieved:true}]);
 assert.doesNotMatch(html,/data-id="pending"/);assert.match(html,/data-id="done"/);
 assert.doesNotMatch(html,/activate-goal/);
});
test('goal forecast uses free budget, actual month length and expense impact',async()=>{
 const {goalForecast}=await import('./app.js');const {newFunding}=await import('./domain.js');
 const data={budgets:{'2026-11':{income:300000,food:0,living:0,transport:0,saving:0}},expenses:[]};
 const goal={price:100000,funding:newFunding(data,'2026-11-01')};
 const f=goalForecast(goal,data,23000,'2026-11-01');
 assert.equal(f.eta,'2026-11-10');assert.equal(f.delay,1);assert.equal(f.etaIfBuy,'2026-11-11');
 assert.equal(goalForecast(goal,{...data,budgets:{}},0,'2026-11-01').eta,null);
});
test('resisting increases the behavioral report, while spending creates a linked wallet expense',async()=>{
 const {recordGoalDecision,savedTotal}=await import('./app.js');
 const data={goals:[{id:'g',active:true}],items:[],impulses:[{amount:1000}],expenses:[]};
 recordGoalDecision(data,'g','치킨',23000,'resisted','2026-11-01');
 assert.equal(savedTotal(data),24000);assert.equal(data.expenses.length,0);
 recordGoalDecision(data,'g','커피',4800,'spent','2026-11-01');
 assert.equal(savedTotal(data),24000);assert.equal(data.expenses.length,1);
 assert.equal(data.expenses[0].amount,4800);assert.equal(data.expenses[0].impulseId,data.impulses[2].id);
 assert.throws(()=>recordGoalDecision(data,'g','',10,'resisted'));
 assert.throws(()=>recordGoalDecision(data,'g','치킨',-1,'resisted'));
 data.goals[0].achieved=true;assert.throws(()=>recordGoalDecision(data,'g','치킨',23000,'resisted'));
});

test('today completion list shows at most five and excludes other days',async()=>{
 const {answeredTodayPage}=await import('./app.js');
 const items=Array.from({length:11},(_,i)=>({id:`item-${i+1}`,name:`물건 ${i+1}`,price:1000,category:'기타',start:'2026-11-01',days:7,answers:{'2026-11-01':['yes','no','unsure'][i%3]}}));
 items.push({id:'yesterday',name:'어제 물건',answers:{'2026-10-31':'yes'}},{id:'pending',name:'미응답',answers:{}});
 const first=answeredTodayPage(items,0,'2026-11-01'),second=answeredTodayPage(items,1,'2026-11-01'),last=answeredTodayPage(items,99,'2026-11-01');
 assert.equal((first.match(/<li>/g)||[]).length,5);assert.equal((second.match(/<li>/g)||[]).length,5);assert.equal((last.match(/<li>/g)||[]).length,1);
 assert.match(first,/#\/WebItem\/item-1"/);assert.doesNotMatch(first,/#\/WebItem\/item-6"/);assert.match(second,/#\/WebItem\/item-6"/);assert.match(last,/#\/WebItem\/item-11"/);
 assert.doesNotMatch(first,/어제 물건|미응답/);assert.match(first,/필요했어요/);assert.match(first,/필요 없었어요/);assert.match(first,/잘 모르겠어요/);
 assert.match(first,/aria-label="오늘 답변 목록 이전 페이지" disabled/);assert.match(last,/aria-label="오늘 답변 목록 다음 페이지" disabled/);
 assert.doesNotMatch(answeredTodayPage(items.slice(0,5),0,'2026-11-01'),/class="answered-arrow"/);
 assert.match(answeredTodayPage([],0,'2026-11-01'),/아직 없어요/);
});

test('swipe direction follows mobile thresholds and cancels short or downward drags',async()=>{
 const {swipeAnswer}=await import('./app.js');
 assert.equal(swipeAnswer(91,0),'yes');assert.equal(swipeAnswer(-91,0),'no');assert.equal(swipeAnswer(0,-91),'unsure');
 assert.equal(swipeAnswer(100,-150),'unsure');assert.equal(swipeAnswer(150,-100),'yes');
 for(const [x,y] of [[0,0],[90,0],[-90,0],[0,-90],[20,20],[0,200]])assert.equal(swipeAnswer(x,y),null);
});

test('final-day answer is highlighted but results unlock the following day',async()=>{
 const {simulationProgress,ready}=await import('./app.js');
 const item={status:'active',start:'2026-10-26',days:7,answers:{}};
 assert.deepEqual(simulationProgress(item,'2026-11-01'),{current:7,finishedToday:false});
 assert.equal(ready(item,'2026-11-01'),false);
 for(const answer of ['yes','no','unsure']){
  item.answers['2026-11-01']=answer;
  assert.deepEqual(simulationProgress(item,'2026-11-01'),{current:7,finishedToday:true});
  assert.equal(ready(item,'2026-11-01'),false);
 }
 assert.deepEqual(simulationProgress(item,'2026-11-02'),{current:7,finishedToday:false});
 assert.equal(ready(item,'2026-11-02'),true);
 assert.equal(ready({...item,status:'buy'},'2026-11-01'),false);
 assert.equal(ready({...item,start:'2026-11-01'},'2026-11-01'),false);
});

test('today finishers move ahead of pagination and alone receive the highlight',async()=>{
 const {answeredTodayPage}=await import('./app.js');
 const items=Array.from({length:7},(_,i)=>({id:`item-${i}`,name:`물건 ${i}`,price:1000,category:'기타',start:i>=5?'2026-10-26':'2026-11-01',days:7,answers:{'2026-11-01':'yes'}}));
 const first=answeredTodayPage(items,0,'2026-11-01'),second=answeredTodayPage(items,1,'2026-11-01');
 assert.deepEqual([...first.matchAll(/href="#\/WebItem\/([^"]+)"/g)].map(m=>m[1]),['item-5','item-6','item-0','item-1','item-2']);
 assert.equal((first.match(/class="is-complete"/g)||[]).length,2);
 assert.match(first,/완료 · 7 \/ 7일/);assert.match(first,/value="1" max="7"/);
 assert.doesNotMatch(second,/is-complete|완료 ·/);
 assert.equal(items[0].id,'item-0');
});

test('wallet adds only current-month extra income and discretionary expenses to inherited budget',async()=>{
 const {walletTotals,savedTotal}=await import('./app.js');
 const data={items:[],impulses:[],budgets:{'2026-10':{income:1000000,food:200000,living:100000,transport:50000,saving:300000}},incomes:[{amount:50000,date:'2026-11-01'},{amount:99000,date:'2026-10-31'}],expenses:[{amount:20000,date:'2026-11-01',bucket:'자유 소비'},{amount:15000,date:'2026-11-01',bucket:'식비'},{amount:99999,date:'2026-10-31',bucket:'자유 소비'}]};
 assert.deepEqual(walletTotals(data,'2026-11'),{planned:350000,extraIncome:50000,spent:20000,balance:380000});
 assert.equal(savedTotal(data),0);
 const restored=JSON.parse(JSON.stringify(data));assert.equal(walletTotals(restored,'2026-11').balance,380000);
 restored.incomes=[];assert.equal(walletTotals(restored,'2026-11').balance,330000);
 assert.equal(walletTotals({budgets:{},expenses:[],incomes:[{amount:10000,date:'2026-11-01'}]},'2026-11').balance,10000);
});

test('old backups gain an empty income list and invalid income backups are rejected',async()=>{
 const {validate}=await import('./app.js');
 const old={version:1,items:[],goals:[],impulses:[],expenses:[],budgets:{}};
 assert.deepEqual(validate(structuredClone(old)).incomes,[]);
 const income={id:'i',name:'추가 수입',amount:10000,date:'2026-11-01'};
 assert.deepEqual(validate({...old,incomes:[income]}).incomes,[income]);
 for(const entry of [{...income,amount:-1},{...income,amount:0},{...income,amount:1.5},{...income,date:'2026-02-30'},{...income,name:''}])assert.throws(()=>validate({...old,incomes:[entry]}));
 assert.throws(()=>validate({...old,incomes:{}}));
});

test('report ratio includes active and buy items and handles empty/all-bye data',async()=>{
 const {reportSummary}=await import('./app.js');
 assert.deepEqual(reportSummary({items:[],impulses:[]}),{total:0,bye:0,percent:0,saved:0,reviewed:0});
 const items=[{status:'bye',price:9000},{status:'buy',price:15000,review:0},{status:'active',price:10000}];
 const summary=reportSummary({items,impulses:[{amount:1000},{amount:3000,decision:'spent'}]});
 assert.equal(summary.total,3);assert.equal(summary.bye,1);assert.ok(Math.abs(summary.percent-100/3)<1e-10);assert.equal(summary.saved,10000);assert.equal(summary.reviewed,1);
 assert.equal(reportSummary({items:[items[0]],impulses:[]}).percent,100);
});

test('report comparisons preserve zero reviews and distinguish pending and due reviews',async()=>{
 const {usageComparison,usageReport,purchaseReasons}=await import('./app.js');
 const item={id:'a',name:'<headphones>',category:'디지털기기',price:100,status:'buy',start:'2026-10-17',days:7,answers:{a:'yes',b:'no',c:'yes'},decided:'2026-10-25',reasons:['실제로 필요해서']};
 assert.deepEqual(usageComparison(item,'2026-11-01'),{expected:null,actual:null,remaining:7});
 assert.deepEqual(usageComparison({...item,review:0},'2026-11-08'),{expected:null,actual:0,remaining:0});
 assert.equal(usageComparison({...item,decided:undefined},'2026-11-01').remaining,null);
 const pending=usageReport([item],0,'2026-11-01');assert.match(pending,/사용 점검까지 7일/);assert.doesNotMatch(pending,/class="actual"/);assert.match(pending,/&lt;headphones&gt;/);
 assert.match(usageReport([item],0,'2026-11-08'),/실제 사용 기록하기/);
 const many=Array.from({length:4},(_,n)=>({...item,id:String(n),name:`물건${n}`}));
 assert.doesNotMatch(usageReport(many,0),/>물건3</);assert.match(usageReport(many,99),/>물건3</);assert.doesNotMatch(usageReport(many,99),/>물건2</);
 const groups=purchaseReasons([item,{...item,status:'bye',reasons:['실제로 필요해서','SNS·광고를 보고']}]);
 assert.equal(groups[0].reason,'SNS·광고를 보고');assert.equal(groups[0].rate,1);assert.equal(groups[1].items.length,2);assert.equal(groups[1].rate,.5);
 assert.deepEqual(purchaseReasons([]),[]);assert.match(usageReport([]),/구매한 물건이 생기면/);
});

test('reason charts render one equally sized block per item and retain Bye status',async()=>{
 const {reasonsReport}=await import('./app.js');
 const items=[{id:'one',name:'<one>',price:100,status:'bye',reasons:['실제로 필요해서','SNS·광고를 보고']},{id:'two',name:'two',price:200,status:'active',reasons:['실제로 필요해서']}];
 const html=reasonsReport(items);
 assert.equal((html.match(/class="reason-block/g)||[]).length,3);
 assert.equal((html.match(/class="reason-block is-bye"/g)||[]).length,2);
 assert.equal((html.match(/--reason-columns:2/g)||[]).length,2);
 assert.match(html,/title="&lt;one&gt; · Bye/);
 assert.match(reasonsReport(Array.from({length:21},(_,n)=>({...items[1],id:String(n)}))),/--reason-columns:20/);
});
