import {createApiClient,itemInput,remoteItem} from './api.js';
import {fallbackQuestion,remoteQuestion} from './questions.js';
import {reflectionKey,reflectionAnswered,reflectionDue,reflectionMetrics,localSummary,addDays,observationDates,simulationEnd,simulationReady,holdItem} from './domain.js';

export function createServices(getState,write,today,request=createApiClient()) {
  const flights=new Map();
  const single=(key,run)=>{if(flights.has(key))return flights.get(key);const p=run().finally(()=>flights.delete(key));flights.set(key,p);return p;};
  const call=(path,body,options={})=>request(path,body,getState().apiBase,options);
  const services={
    register: (items,discountReview) => single('register',async()=>{
      let pending=getState().pendingRegistration;
      if(!pending){pending={id:crypto.randomUUID(),items,payload:{items:items.map(itemInput),...(discountReview?{discount_review:discountReview}:{})}};write(s=>{s.pendingRegistration=pending;});}
      let response;
      try {response=await call('/items/batch',pending.payload,{idempotencyKey:pending.id,existingResource:true});}
      catch(e){if([400,422].includes(e.status))write(s=>{delete s.pendingRegistration;});throw e;}
      const selected=pending.payload.discount_review?.decision==='NEEDED'?pending.items.filter((_,n)=>pending.payload.discount_review.needed_item_indexes.includes(n)):pending.items;
      if(!Array.isArray(response?.items)||response.items.length!==selected.length)throw Error('등록 결과를 확인하지 못했어요. 다시 시도해 주세요.');
      const saved=selected.map((item,n)=>remoteItem(item,response.items[n]));
      write(s=>{for(const item of saved)if(!s.items.some(i=>i.id===item.id))s.items.unshift(item);delete s.pendingRegistration;});
      return saved;
    }),
    question: id=>single('question:'+id,async()=>{
      const item=getState().items.find(i=>i.id===id),date=today();
      if(!item||!reflectionDue(item,date))return;
      const key=reflectionKey(item,date);if(item.reflections?.[key]||reflectionAnswered(item,date))return;
      let question=fallbackQuestion(item,date);
      const post=item.status==='buy',remoteId=post?item.purchaseId:item.simulationId;
      if(remoteId){
        const recent_templates=Object.entries(item.reflections||{}).filter(([k,q])=>k.startsWith(post?'post:':'pre:')&&k.slice(k.indexOf(':')+1)<date&&q.templateCode).map(([k,q])=>({date:k.slice(k.indexOf(':')+1),template_code:q.templateCode})).sort((a,b)=>a.date.localeCompare(b.date)).slice(-365);
        try {question=remoteQuestion(await call(`/${post?'purchases':'simulations'}/${encodeURIComponent(remoteId)}/local-question`,{recent_templates},{existingResource:true}),date);}catch{question.fallback=true;}
      }
      if(today()!==date)return;
      write(s=>{const current=s.items.find(i=>i.id===id);if(current&&current.status===item.status){current.reflections ||= {};current.reflections[key] ||= question;}});
    }),
    summarize:id=>single('summary:'+id,async()=>{
      const item=getState().items.find(i=>i.id===id),date=today();if(!item||!simulationReady(item,date))return;
      const summary=localSummary(item,date);if(item.summary?.fingerprint===summary.fingerprint&&item.summary?.method!=='ERROR')return;
      if(item.simulationId){try{
        const row=await call(`/simulations/${encodeURIComponent(item.simulationId)}/result-summary`,{responses:reflectionMetrics(item,date).responses},{existingResource:true});
        if(typeof row?.ai_summary?.summary!=='string'||typeof row.result?.comparison_eligible!=='boolean'||!(row.result.expected_used_days===null||Number.isFinite(row.result.expected_used_days)&&row.result.expected_used_days>=0&&row.result.expected_used_days<=30))throw Error('결과 응답을 확인하지 못했어요.');
        Object.assign(summary,{text:row.ai_summary.summary,expectedDays:row.result.expected_used_days,coverage:row.result.answer_coverage,eligible:row.result.comparison_eligible,method:row.ai_summary.method});
      }catch(e){Object.assign(summary,{method:'ERROR',error:e.message});}}
      write(s=>{const current=s.items.find(i=>i.id===id);if(current)current.summary=summary;});
    }),
    decide:(id,action)=>single('decision:'+id,async()=>{
      let item=getState().items.find(i=>i.id===id);if(!item||item.status!=='active')throw Error('이미 결정한 물건이에요.');
      const date=today();if(!['buy','bye','hold'].includes(action))throw Error('결정을 확인해 주세요.');if(action==='bye'&&item.remoteId&&!simulationReady(item,date))throw Error('서버에 연결된 물건은 시뮬레이션 종료 후 Bye를 선택할 수 있어요.');if(action==='hold'){const preview=structuredClone(item);holdItem(preview,date);}
      if(simulationReady(item,date))await services.summarize(id);
      item=getState().items.find(i=>i.id===id);
      const proposed=structuredClone(item);if(action==='hold')holdItem(proposed,date);
      let remote;
      if(item.remoteId)remote=remoteItem(proposed,await call(`/items/${encodeURIComponent(item.remoteId)}/decision`,{decision:{buy:'BUY',bye:'GIVE_UP',hold:'HOLD'}[action]},{method:'PUT',existingResource:true,idempotencyKey:`decision-${item.remoteId}-${action}-${simulationEnd(item)}`}));
      if(remote&&action==='hold'){const extra=remote.days-item.days;if(extra<=0||extra>7)throw Error('연장 결과를 확인하지 못했어요. 다시 시도해 주세요.');remote.observationDates=[...observationDates(item),...Array.from({length:extra},(_,n)=>addDays(remote.endDate,n-extra))];}
      write(s=>{
        const i=s.items.find(i=>i.id===id);if(action==='hold')holdItem(i,date);else{i.status=action;i.decided=date;if(action==='buy'&&!s.expenses.some(e=>e.itemId===id))s.expenses.push({id:crypto.randomUUID(),itemId:id,name:i.name,amount:i.price,date:remote?.decided||date,bucket:'자유 소비',source:'item'});}
        if(remote)Object.assign(i,remote);if(action==='hold')delete i.summary;
      });
    }),
    review:(id,value)=>single('review:'+id,async()=>{
      const i=getState().items.find(i=>i.id===id),frequency={12:'ALMOST_DAILY',7:'OFTEN',2.5:'SOMETIMES',0:'NEVER'}[value];
      if(!i||i.status!=='buy'||!frequency||today()<new Date(Date.parse(i.decided)+14*86400000).toISOString().slice(0,10))throw Error('사용 점검 기간과 답변을 확인해 주세요.');
      if(i.purchaseId)await call(`/purchases/${encodeURIComponent(i.purchaseId)}/review`,{frequency},{method:'PUT',existingResource:true});
      write(s=>{const item=s.items.find(i=>i.id===id);item.review=value;item.reviewedAt=today();});
    })
  };
  return services;
}
