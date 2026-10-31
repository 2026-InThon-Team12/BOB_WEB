import {API_BASE} from './api.js';
import {migrateWeb,dateKey} from './domain.js';
const categories={daily:'생활용품',clothing:'의류',furniture:'가구/인테리어',appliance:'가전',digital:'디지털기기',hobby:'취미',game:'게임',beauty:'뷰티',food:'식품',etc:'기타'};
const reasons={sns_ad:'SNS·광고를 보고',discount_limited:'할인·한정 판매 때문에',bundle_discount:'추가 할인을 받으려고',stress:'스트레스·기분 전환',peer:'주변 사람이 가지고 있어서',need:'실제로 필요해서',long_wanted:'오래전부터 원해서',other:'기타'};
const buckets={food:'식비',living:'생활비',transport:'교통비',discretionary:'자유 소비'};
const date=value=>typeof value==='string'?(value.length===10?value:dateKey(new Date(value))):undefined;
const safeImage=value=>typeof value==='string'&&/^data:image\/(png|jpeg|webp);base64,/.test(value)?value:undefined;
export function portableBackup(state) {
  const data=structuredClone(state);
  // A backup is data, never authorization for another device's guest session.
  delete data.pendingRegistration;
  for(const i of data.items){delete i.remoteId;delete i.simulationId;delete i.purchaseId;}
  return data;
}
export function importBackup(raw,today) {
  if(raw?.app!=='bob'){if(!raw||![1,2].includes(raw.version)||!['items','goals','expenses','impulses'].every(k=>Array.isArray(raw[k])))throw Error('BoB 백업 파일 형식을 확인해 주세요.');return migrateWeb(portableBackup(raw),today);}
  if(!Number.isInteger(raw.version)||raw.version<1||raw.version>4)throw Error('지원하지 않는 앱 백업 버전이에요.');
  const d=raw.data;
  if(!d||!['items','questions','answers','goals','expenses','impulses','budgets'].every(k=>d[k]&&typeof d[k]==='object'&&!Array.isArray(d[k])))throw Error('앱 백업 형식을 확인해 주세요.');
  if(Object.values(d.items).some(i=>i.registrationState==='pending'))throw Error('앱에서 등록 중인 물건의 처리를 마친 뒤 다시 백업해 주세요.');
  const items=Object.values(d.items).map(i=>({id:i.id,name:i.name,price:i.price,category:categories[i.category],reasons:i.reasons.map(r=>reasons[r]),reasonOtherText:i.reasonOtherText,saleEndsAt:i.saleEndsAt,source:{manual:'MANUAL',screenshot:'SCREENSHOT',link:'URL'}[i.source],url:i.sourceUrl||'',start:date(i.simulation.startAt),days:i.simulation.durationDays,endDate:i.simulation.endDate,observationDates:i.simulation.observationDates,status:{simulating:'active',bought:'buy',abandoned:'bye'}[i.status],createdAt:date(i.createdAt),decided:date(i.purchase?.boughtAt||i.decidedAt),review:i.review?.usedDays,reviewedAt:date(i.review?.at),summary:i.summary,answers:{},reflections:{}}));
  for(const a of Object.values(d.answers)){
    const i=items.find(i=>i.id===a.itemId),q=d.questions[a.questionId];if(!i||!q)continue;
    if(a.value&&q.answerSpec)i.reflections[`${q.phase||'pre'}:${a.date}`]={text:q.text,templateCode:q.templateCode,spec:q.answerSpec,method:q.generationMethod||'TEMPLATE',answer:a.value,label:a.label||'',reference:q.reference||''};
    else{const selected=q.options?.find(o=>o.id===a.optionId);if(selected)i.answers[a.date]=selected.countsAsUse?'yes':/unsure|unknown|모르/i.test(a.optionId+' '+selected.label)?'unsure':'no';}
  }
  const goals=Object.values(d.goals).map(g=>({id:g.id,name:g.name,price:g.price,base:0,active:g.isActive,createdAt:date(g.createdAt),achieved:!!g.achievedAt,achievedAt:date(g.achievedAt),closedAt:date(g.closedAt),image:safeImage(g.imageUri),url:g.productUrl||'',funding:g.funding}));
  const expenses=Object.values(d.expenses).map(e=>({id:e.id,name:e.label,amount:e.amount,date:date(e.at),bucket:buckets[e.bucket],source:e.source,...(e.source==='item'?{itemId:e.refId}:e.source==='impulse'?{impulseId:e.refId}:{})}));
  const impulses=Object.values(d.impulses).map(e=>({id:e.id,name:e.label,amount:e.amount,date:date(e.at),goalId:e.goalId,decision:e.decision,cancelledAt:date(e.cancelledAt)}));
  return migrateWeb({version:2,items,goals,expenses,impulses,incomes:[],budgets:d.budgets,apiBase:API_BASE},today);
}
