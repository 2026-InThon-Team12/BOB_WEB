export const API_BASE = 'https://bob-be.vercel.app';
const categoryLabels = {DAILY_LIVING:'생활용품',CLOTHING:'의류',FURNITURE:'가구/인테리어',APPLIANCES:'가전',DIGITAL:'디지털기기',HOBBY:'취미',GAME:'게임',BEAUTY:'뷰티',FOOD:'식품',OTHER:'기타'};
export function mapDrafts(data) {
  if(!Array.isArray(data?.items)||!data.items.length) throw Error('인식한 물건이 없어요. 직접 입력해 주세요.');
  return data.items.map(i=>{
    if(typeof i.name!=='string'||!i.name.trim()||(i.price!=null&&(typeof i.price!=='number'||!Number.isFinite(i.price)||i.price<=0||i.price>1000000000000))) throw Error('AI 응답 형식이 달라요. 직접 입력해 주세요.');
    return {name:i.name.trim(),price:i.price==null?'':Math.round(i.price),category:categoryLabels[i.category]||'기타',source_url:typeof i.source_url==='string'?i.source_url:''};
  });
}
export function createAiClient(fetcher = fetch) {
  let token='',tokenBase='';
  return async function request(path,body,server=API_BASE) {
    const base=new URL(server.trim().replace(/\/+$/,'').replace(/\/api\/v1$/,''));
    if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash) throw Error('올바른 AI 서버 주소를 입력해 주세요.');
    const configured=base.href.replace(/\/$/,'');
    const origin=configured===API_BASE && typeof location!=='undefined' ? location.origin : configured;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),110000);
    try {
      for(let attempt=0;attempt<2;attempt++) {
        if(!token||tokenBase!==origin) {
          const r=await fetcher(origin+'/api/v1/guest-sessions',{method:'POST',signal:controller.signal});
          if(!r.ok) throw Error('AI 세션을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.');
          const session=await r.json();
          if(typeof session.access_token!=='string'||!session.access_token) throw Error('AI 인증 응답이 올바르지 않아요.');
          token=session.access_token;tokenBase=origin;
        }
        const multipart=body instanceof FormData;
        const headers={Authorization:'Bearer '+token,...(!multipart?{'Content-Type':'application/json'}:{})};
        const r=await fetcher(origin+'/api/v1'+path,{method:'POST',headers,body:multipart?body:JSON.stringify(body),signal:controller.signal});
        if(r.status===401&&attempt===0){token='';continue;}
        if(!r.ok) throw Error(r.status===429?'요청이 많아요. 잠시 후 다시 시도해 주세요.':`AI 분석에 실패했어요 (${r.status}). 다시 시도하거나 직접 입력해 주세요.`);
        return mapDrafts(await r.json());
      }
    } catch(e) {
      if(e instanceof TypeError) throw Error('AI 서버에 연결하지 못했어요. 인터넷 연결과 서버의 CORS 설정을 확인해 주세요.');
      throw e;
    } finally {clearTimeout(timer);}
  };
}
