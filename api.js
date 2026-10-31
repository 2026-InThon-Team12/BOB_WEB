export const API_BASE = 'https://bob-be.vercel.app';
const categoryLabels = {DAILY_LIVING:'생활용품',CLOTHING:'의류',FURNITURE:'가구/인테리어',APPLIANCES:'가전',DIGITAL:'디지털기기',HOBBY:'취미',GAME:'게임',BEAUTY:'뷰티',FOOD:'식품',OTHER:'기타'};
export function mapDrafts(data) {
  if(!Array.isArray(data?.items)||!data.items.length) throw Error('인식한 물건이 없어요. 직접 입력해 주세요.');
  return data.items.map(i=>{
    if(typeof i.name!=='string'||!i.name.trim()||(i.price!=null&&(typeof i.price!=='number'||!Number.isFinite(i.price)||i.price<=0||i.price>1000000000000))) throw Error('AI 응답 형식이 달라요. 직접 입력해 주세요.');
    return {name:i.name.trim(),price:i.price==null?'':Math.round(i.price),category:categoryLabels[i.category]||'기타',source_url:typeof i.source_url==='string'?i.source_url:''};
  });
}
export function productUrl(value) {
  const url=new URL(value.trim());
  if(url.protocol!=='https:'||url.username||url.password||url.href.length>2048)throw Error('2048자 이하의 https 상품 링크를 입력해 주세요.');
  return url.href;
}
export function createApiClient(fetcher = fetch, storage = typeof localStorage==='undefined'?null:localStorage) {
  const sessions=new Map(),flights=new Map();
  return async function request(path,body,server=API_BASE,options={}) {
    const base=new URL(server.trim().replace(/\/+$/,'').replace(/\/api\/v1$/,''));
    if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash) throw Error('올바른 AI 서버 주소를 입력해 주세요.');
    const configured=base.href.replace(/\/$/,'');
    const origin=configured===API_BASE && typeof location!=='undefined' ? location.origin : configured;
    const key='bob.web.session:'+configured;
    const session=async()=>{
      if(flights.has(key))return flights.get(key);
      const flight=(async()=>{
        const cached=sessions.get(key)||storage?.getItem(key);if(cached)return cached;
        const r=await fetcher(origin+'/api/v1/guest-sessions',{method:'POST',signal:AbortSignal.timeout(110000)});
        if(!r.ok)throw Error('서버 연결을 시작하지 못했어요. 다시 시도해 주세요.');
        const data=await r.json();if(typeof data.access_token!=='string'||!data.access_token)throw Error('인증 응답을 확인하지 못했어요.');
        storage?.setItem(key,data.access_token);sessions.set(key,data.access_token);return data.access_token;
      })().finally(()=>flights.delete(key));flights.set(key,flight);return flight;
    };
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),110000);
    try {
      for(let attempt=0;attempt<2;attempt++) {
        const token=await session();
        const multipart=body instanceof FormData;
        const headers={Authorization:'Bearer '+token,...(!multipart?{'Content-Type':'application/json'}:{}),...(options.idempotencyKey?{'Idempotency-Key':options.idempotencyKey}:{})};
        const r=await fetcher(origin+'/api/v1'+path,{method:options.method||'POST',headers,body:body===undefined?undefined:multipart?body:JSON.stringify(body),signal:controller.signal});
        if(r.status===401&&attempt===0&&!options.existingResource){sessions.delete(key);storage?.removeItem(key);continue;}
        if(!r.ok){const data=await r.json().catch(()=>null);throw Object.assign(Error(r.status===429?'요청이 많아요. 잠시 후 다시 시도해 주세요.':r.status===401||r.status===404?'이 브라우저의 서버 연결을 확인하지 못했어요. 로컬 기록은 보존됩니다.':data?.error?.message||`요청을 완료하지 못했어요 (${r.status}). 입력을 유지한 채 다시 시도해 주세요.`),{status:r.status});}
        return r.status===204?null:await r.json();
      }
    } catch(e) {
      if(e instanceof TypeError) throw Error('서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
      throw e;
    } finally {clearTimeout(timer);}
  };
}
export function createAiClient(fetcher = fetch) {
  const request=createApiClient(fetcher);
  return async(path,body,server=API_BASE)=>mapDrafts(await request(path,body,server));
}

const categoryIds={생활용품:'DAILY_LIVING',의류:'CLOTHING','가구/인테리어':'FURNITURE',가전:'APPLIANCES',디지털기기:'DIGITAL',취미:'HOBBY',게임:'GAME',뷰티:'BEAUTY',식품:'FOOD',기타:'OTHER'};
const reasonIds={'SNS·광고를 보고':'ADVERTISEMENT','할인·한정 판매 때문에':'DISCOUNT_LIMITED','추가 할인을 받으려고':'EXTRA_DISCOUNT','스트레스·기분 전환':'STRESS','주변 사람이 가지고 있어서':'SOCIAL','실제로 필요해서':'NECESSITY','오래전부터 원해서':'LONG_WANTED',기타:'OTHER'};
export const itemInput = item => ({name:item.name,price:item.price,category:categoryIds[item.category],purchase_reasons:item.reasons.map(r=>reasonIds[r]),reason_other_text:item.reasonOtherText||undefined,sale_ends_on:item.saleEndsAt||undefined,source:item.source||'MANUAL',source_url:item.url?productUrl(item.url):undefined,question_mode:'LOCAL'});
export function remoteItem(local,row) {
  if(typeof row?.id!=='string'||typeof row.simulation?.id!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.simulation.start_date)||!/^\d{4}-\d{2}-\d{2}$/.test(row.simulation.end_date_exclusive)||!Number.isInteger(row.simulation.duration_days)||row.simulation.duration_days<0||row.simulation.duration_days>3650||!['BUY','GIVE_UP','HOLD',null].includes(row.decision))throw Error('서버 품목 응답을 확인하지 못했어요. 다시 시도해 주세요.');
  if(row.decision==='BUY'&&(typeof row.purchase?.id!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.purchase?.purchased_on)))throw Error('구매 정보를 확인하지 못했어요. 다시 시도해 주세요.');
  return {...local,remoteId:row.id,simulationId:row.simulation.id,start:row.simulation.start_date,days:row.simulation.duration_days,endDate:row.simulation.end_date_exclusive,...(Array.isArray(row.simulation.observation_dates)?{observationDates:row.simulation.observation_dates}:{}),status:row.decision==='BUY'?'buy':row.decision==='GIVE_UP'?'bye':'active',...(row.purchase?{purchaseId:row.purchase.id,decided:row.purchase.purchased_on}:{})};
}
