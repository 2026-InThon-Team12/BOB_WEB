// Business rules mirror BOB_FE/src/lib/calc; web-only extra income stays in the wallet.
export const dateKey = (date=new Date()) => new Date(date.getTime()+9*60*60*1000).toISOString().slice(0,10);
export const addDays = (date, count) => new Date(Date.parse(date+'T00:00:00Z') + count*86400000).toISOString().slice(0,10);
export const diffDays = (from,to) => Math.round((Date.parse(to)-Date.parse(from))/86400000);
export const daysInMonth = month => new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();
export const latestBudget = (data, month) => data.budgets[month] || Object.entries(data.budgets).filter(([m])=>m<month).sort(([a],[b])=>a.localeCompare(b)).at(-1)?.[1];
export const freeLimit = b => b ? b.income-b.food-b.living-b.transport-b.saving : 0;
export const isFreeExpense = e => e.bucket==='자유 소비'||!!e.itemId||!!e.impulseId||['item','impulse'].includes(e.source);
export const freeSpentThrough = (data,date) => data.expenses.filter(e=>isFreeExpense(e)&&e.date.slice(0,7)===date.slice(0,7)&&e.date<=date).reduce((n,e)=>n+e.amount,0);
export const newFunding = (data,date,openingBalance=0,reservedThisMonth=0) => ({startsOn:date,openingBalance,baselineSpent:freeSpentThrough(data,date),reservedThisMonth});

export function fundingPlan(goal,data,today,extraSpending=0) {
  const f=goal.funding;
  if(!f)return {saved:goal.achieved?goal.price:0,remaining:goal.achieved?0:goal.price,ratio:goal.achieved?1:0,achieved:!!goal.achieved,eta:goal.achievedAt||null,dailySaving:null,achievedOn:null,monthAllocated:0,allocationMonth:'',usesPreviousBudget:false};
  const end=f.frozenOn&&f.frozenOn<today?f.frozenOn:today;
  let saved=f.openingBalance,pool=0,allocated=f.reservedThisMonth,month='',achievedOn=null,usesPreviousBudget=false;
  const spending=new Map();
  for(const e of data.expenses)if(isFreeExpense(e))spending.set(e.date,(spending.get(e.date)||0)+e.amount);
  const firstMonth=f.startsOn.slice(0,7),beforeStart=freeSpentThrough(data,f.startsOn)-(spending.get(f.startsOn)||0);
  const spend=amount=>{pool-=amount;if(pool<0){const debit=Math.min(saved,-pool);saved-=debit;allocated=Math.max(0,allocated-debit);pool=0;}};
  for(let day=f.startsOn;day<=end;day=addDays(day,1)) {
    const m=day.slice(0,7);
    if(m!==month){month=m;const b=latestBudget(data,month);usesPreviousBudget ||= !!b&&!data.budgets[month];allocated=month===firstMonth?f.reservedThisMonth:0;pool=Math.max(0,freeLimit(b)-(month===firstMonth?f.baselineSpent+f.reservedThisMonth:0));}
    spend((spending.get(day)||0)+(day===f.startsOn?beforeStart-f.baselineSpent:0));
    if(day===today)spend(extraSpending);
    if(day<today&&!f.frozenOn){const credit=Math.floor(pool/(daysInMonth(month)-Number(day.slice(8))+1));pool-=credit;saved+=credit;allocated+=credit;if(saved>=goal.price){achievedOn=day;break;}}
  }
  if(f.frozenBalance!==undefined)saved=f.frozenBalance;
  if(f.frozenAllocated!==undefined)allocated=f.frozenAllocated;
  const remaining=Math.max(0,goal.price-saved);
  let eta=remaining===0?goal.achievedAt||achievedOn||today:null;
  const dailySaving=latestBudget(data,today.slice(0,7))&&pool>0&&!goal.achieved?pool/(daysInMonth(today.slice(0,7))-Number(today.slice(8))+1):null;
  let left=remaining,cursor=today,capacity=pool;
  for(let n=0;left>0&&n<1200;n++){
    const m=cursor.slice(0,7),days=daysInMonth(m)-Number(cursor.slice(8))+1;
    if(capacity>=left&&capacity>0){for(let d=0;d<days;d++){const credit=Math.floor(capacity/(days-d));capacity-=credit;left-=credit;if(left<=0){eta=addDays(cursor,d);break;}}break;}
    left-=capacity;cursor=addDays(cursor,days);const b=latestBudget(data,cursor.slice(0,7));if(!b||freeLimit(b)<=0)break;usesPreviousBudget ||= !data.budgets[cursor.slice(0,7)];capacity=Math.max(0,freeLimit(b));
  }
  return {saved,remaining,ratio:Math.min(1,saved/goal.price),achieved:remaining===0,eta,dailySaving,achievedOn,monthAllocated:allocated,allocationMonth:month,usesPreviousBudget};
}
export function refreshGoals(data,date) {
  for(const g of data.goals)if(g.active&&!g.achieved&&g.funding){const p=fundingPlan(g,data,date);if(p.achieved){g.achieved=true;g.achievedAt=p.achievedOn||date;Object.assign(g.funding,{frozenBalance:p.saved,frozenAllocated:p.monthAllocated,frozenOn:g.achievedAt});}}
}
export function replaceGoal(data,goal,date,carry=0) {
  refreshGoals(data,date);
  const old=data.goals.find(g=>g.active),p=old?fundingPlan(old,data,date):null;
  const carried=old&&!old.achieved?Math.min(goal.price,p.saved,Math.max(0,carry)):0;
  const reserved=p?.allocationMonth===date.slice(0,7)?p.monthAllocated:0;
  if(old){old.active=false;old.closedAt=date;if(old.funding&&!old.achieved)Object.assign(old.funding,{frozenBalance:p.saved-carried,frozenAllocated:reserved,frozenOn:date});}
  data.goals.push({...goal,active:true,createdAt:date,base:0,funding:newFunding(data,date,carried,reserved)});
}
export const observationDates = item => item.observationDates || Array.from({length:item.days},(_,n)=>addDays(item.start,n));
export const simulationEnd = item => item.endDate || addDays(item.start,item.days);
export const simulationReady = (item,date) => item.status==='active'&&date>=simulationEnd(item);
export const reflectionKey = (item,date) => `${item.status==='buy'?'post':'pre'}:${date}`;
export const reflectionDue = (item,date) => item.status==='active'?observationDates(item).includes(date):item.status==='buy'&&!!item.decided&&item.decided<=date;
export const reflectionAnswered = (item,date) => !!item.reflections?.[reflectionKey(item,date)]?.answer || (item.status!=='buy'&&!!item.answers?.[date]);
export function holdItem(item,date) {
  const extension=Math.min(7,item.saleEndsAt?diffDays(date,item.saleEndsAt):7);
  if(!simulationReady(item,date)||extension<=0)throw Error('판매 마감일이나 시뮬레이션 기간을 확인해 주세요.');
  item.observationDates=[...observationDates(item),...Array.from({length:extension},(_,n)=>addDays(date,n+1))];
  item.days=item.observationDates.length;item.endDate=addDays(date,extension+1);delete item.summary;
}
export function reflectionMetrics(item,date) {
  const dates=observationDates(item);
  const responses=Object.entries(item.reflections||{}).filter(([k,q])=>k.startsWith('pre:')&&dates.includes(k.slice(4))&&q.answer&&q.templateCode&&!q.legacy).map(([k,q])=>({date:k.slice(4),template_code:q.templateCode,question:q.text,answer:q.answer})).sort((a,b)=>a.date.localeCompare(b.date));
  const definite=responses.filter(r=>r.answer.choice_code!=='UNSURE'&&!Object.values(r.answer.object_value||{}).includes('UNSURE')).length;
  const expected=responses.filter(r=>r.template_code==='EXPECTED_USE_DAYS').at(-1)?.answer.number_value??null;
  const coverage=dates.length?definite/dates.length:0,early=item.status==='buy'&&item.decided<simulationEnd(item);
  return {responses,expected,coverage,eligible:dates.length>0&&date>=simulationEnd(item)&&!early&&coverage>=.7&&expected!==null};
}
export function localSummary(item,date) {
  const m=reflectionMetrics(item,date);
  return {text:`${item.days}일 중 ${m.responses.length}일 답했어요. ${m.expected===null?'예상 사용일수 기록이 없어 수치 비교는 하지 않아요.':`산 뒤 30일 중 ${m.expected}일 사용할 것으로 예상했어요.`}`,expectedDays:m.expected,coverage:m.coverage,eligible:m.eligible,method:'TEMPLATE',fingerprint:JSON.stringify(m.responses)};
}
export function migrateWeb(data,date) {
  const next=structuredClone(data);
  for(const e of next.expenses)e.source ||= e.itemId?'item':e.impulseId?'impulse':'manual';
  for(const i of next.items){i.reflections ||= {};i.createdAt ||= i.start;}
  // Like mobile v4, legacy active goals start the budget-based plan on migration day.
  // Old decisions and achieved goals stay intact; no estimated past savings are invented.
  for(const g of next.goals)if(g.active&&!g.achieved&&!g.funding)g.funding=newFunding(next,date);
  next.version=2;return next;
}
