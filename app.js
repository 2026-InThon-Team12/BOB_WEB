import { API_BASE, createAiClient } from './api.js';
/** @param {string} selector @returns {HTMLElement | null} */
const query = selector => document.querySelector(selector);
const KEY = 'bob.web.v1';
const categories = ['의류','디지털기기','가구/인테리어','생활용품','가전','취미','게임','뷰티','식품','기타'];
const reasons = ['SNS·광고를 보고','할인·한정 판매 때문에','추가 할인을 받으려고','스트레스·기분 전환','주변 사람이 가지고 있어서','실제로 필요해서','오래전부터 원해서','기타'];
const labels = {active:'시뮬레이션 중',buy:'Buy · 구매했어요',bye:'Bye · 보내줬어요'};
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won = n => Math.round(n).toLocaleString('ko-KR') + '원';
const day = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const today = () => day();
const elapsed = start => Math.round((Date.parse(today())-Date.parse(start))/86400000);
export const duration = price => price <= 30000 ? 3 : price < 100000 ? 7 : 14;
export const payment = (sum,min,pct,shipping,free) => sum === 0 ? 0 : sum - (sum >= min ? Math.round(sum*pct/100) : 0) + (free > 0 && sum >= free ? 0 : shipping);
const fresh = () => ({version:1,items:[],goals:[],impulses:[],expenses:[],incomes:[],budgets:{},apiBase:API_BASE});
let dirty = false, lastDay = today();
let state = fresh(), warning = '', filter = 'active', pendingImport = null, aiDrafts = [];
const validAmount = x => Number.isSafeInteger(x) && x >= 0 && x <= 1000000000000;
export function validate(s) {
  if (!s || s.version !== 1 || !['items','goals','impulses','expenses'].every(k => Array.isArray(s[k])) || !s.budgets || typeof s.budgets !== 'object') throw Error('BoB 웹 백업 파일이 아니에요.');
  if(s.incomes===undefined)s.incomes=[];
  if(!Array.isArray(s.incomes))throw Error('소득 기록 형식을 확인해 주세요.');
  for(const e of s.incomes)if(typeof e.id!=='string'||typeof e.name!=='string'||!e.name.trim()||!validAmount(e.amount)||e.amount===0||typeof e.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||day(new Date(e.date+'T12:00:00'))!==e.date)throw Error('소득 기록 형식을 확인해 주세요.');
  for(const i of s.items) if(typeof i.id !== 'string' || typeof i.name !== 'string' || !categories.includes(i.category) || !validAmount(i.price) || !['active','buy','bye'].includes(i.status) || !/^\d{4}-\d{2}-\d{2}$/.test(i.start) || !Number.isInteger(i.days) || i.days < 1 || i.days > 3650 || !Array.isArray(i.reasons) || !i.answers || typeof i.answers !== 'object' || !Object.values(i.answers).every(a=>['yes','no','unsure'].includes(a))) throw Error('물건 데이터 형식을 확인해 주세요.');
  for(const g of s.goals) if(typeof g.id !== 'string' || typeof g.name !== 'string' || !validAmount(g.price) || g.price === 0 || !validAmount(g.base)||(g.image && !validGoalImage(g.image))||(g.url!==undefined&&(typeof g.url!=='string'||(g.url&&!safeUrl(g.url))))) throw Error('목표 데이터 형식이 잘못됐어요.');
  for(const e of [...s.expenses,...s.impulses]) if(typeof e.id !== 'string' || typeof e.name !== 'string' || !validAmount(e.amount) || typeof e.date !== 'string'||(e.decision!==undefined&&!['resisted','spent'].includes(e.decision))) throw Error('금액 기록 형식이 잘못됐어요.');
  for(const b of Object.values(s.budgets)) if(!['income','food','living','transport','saving'].every(k=>validAmount(b[k]))) throw Error('예산 데이터가 잘못됐어요.');
  return s;
}
try { const raw = localStorage.getItem(KEY); if(raw) state=validate(JSON.parse(raw)); } catch { warning='저장된 데이터를 읽지 못했어요. 기존 데이터 보호를 위해 새 저장을 중지했어요. 설정에서 백업 파일로 복원해 주세요.'; }
let storageBlocked = !!warning;
function commit(update, message='저장했어요.') {
  if(storageBlocked) throw Error(warning);
  const next=structuredClone(state); update(next); const total=savedTotal(next); next.goals.forEach(g=>{if(g.active && !g.achieved && total-g.base>=g.price){g.achieved=true;g.achievedAt=today();}}); validate(next);
  try {localStorage.setItem(KEY,JSON.stringify(next));} catch {throw Error('저장 공간이 부족하거나 브라우저 저장이 차단됐어요. 백업 후 공간을 확보해 주세요.');}
  state=next; render(); if(message)notify(message);
}
function notify(message) {const n=query('#bob-status'); if(n) {n.textContent=message; n.hidden=false;}}
export const savedTotal = data => data.items.filter(i=>i.status==='bye').reduce((s,i)=>s+i.price,0)+data.impulses.filter(i=>i.decision!=='spent').reduce((s,i)=>s+i.amount,0);
const saved = () => savedTotal(state);
const goalAmount = g => g.achieved?g.price:Math.min(g.price,Math.max(0,saved()-g.base));
const used = i => Object.values(i.answers).filter(a=>a==='yes').length;
export function simulationProgress(item, date=today()) {
 const current=Math.round((Date.parse(date)-Date.parse(item.start))/86400000)+1;
 return {current:Math.max(0,Math.min(current,item.days)),finishedToday:current===item.days&&['yes','no','unsure'].includes(item.answers[date])};
}
export const ready = (i, date=today()) => i.status==='active' && (Date.parse(date)-Date.parse(i.start)>=i.days*86400000 || simulationProgress(i,date).finishedToday);
const due = () => state.items.filter(i=>i.status==='active' && !ready(i) && elapsed(i.start)>=0 && !i.answers[today()]);
const status = i => ready(i) ? '결과가 도착했어요' : labels[i.status];
const link = (route,text,cls='') => `<a class="${cls}" href="#/${route}">${text}</a>`;
/** @param {string|number} id */
const button = (text,action,id='',cls='') => `<button type="button" class="${cls}" data-action="${action}" data-id="${esc(id)}">${text}</button>`;
const empty = (title,text,route='WebAdd',cta='물건 등록하기') => `<div class="empty"><div class="empty-mark">BoB</div><h2>${title}</h2><p>${text}</p>${link(route,cta,'primary')}</div>`;
/** @param {string|number} value */
const field = (name,label,type='text',value='',extra='') => `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${type==='number'?'min="0" step="1" inputmode="numeric"':''} ${extra}></label>`;
const select = (name,label,values) => `<label>${label}<select name="${name}">${values.map(v=>`<option>${esc(v)}</option>`).join('')}</select></label>`;
const formEnd = text => `<p class="form-error" role="alert"></p><button class="primary" type="submit">${text}</button></form>`;
function rows(items) {return items.map(i=>`<a class="item-row" href="#/WebItem/${encodeURIComponent(i.id)}"><span class="item-icon" aria-hidden="true">${i.category==='의류'?'♧':i.category==='디지털기기'?'◉':'▧'}</span><span class="item-info"><strong>${esc(i.name)}</strong><small>${esc(i.category)} · ${esc(status(i))}</small></span><span><strong>${won(i.price)}</strong><small>${i.status==='active'?`${Math.min(elapsed(i.start)+1,i.days)} / ${i.days}일`:esc(i.decided||'')}</small></span><span aria-hidden="true">↗</span></a>`).join('');}
const homeMessages = ['오늘 하루, 후회 없는 소비 하셨나요?', '지금 갖고 싶은 마음, 내일도 같을까요?', '잠깐의 기다림이 더 좋은 선택을 만들어요.', '오늘 참은 작은 소비, 진짜 원하는 것에 한 걸음.', '나에게 꼭 필요한 것만, 천천히 골라요.'];
const homeMessage = homeMessages[Math.floor(Math.random()*homeMessages.length)];
let selectedHomeItem = '';
export function calendarMonth(date = new Date()) {
 const year=date.getFullYear(), month=date.getMonth();
 return {year,month:month+1,today:date.getDate(),offset:new Date(year,month,1).getDay(),days:new Date(year,month+1,0).getDate()};
}
function homeCalendar() {
 const c=calendarMonth();
 return `<div class="wallet-calendar"><div class="calendar-binding" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="calendar-heading"><strong>${c.year}년 ${c.month}월</strong><span>오늘 ${c.today}일</span></div><table aria-label="${c.year}년 ${c.month}월 달력"><thead><tr>${['일','월','화','수','목','금','토'].map(d=>`<th scope="col">${d}</th>`).join('')}</tr></thead><tbody>${Array.from({length:Math.ceil((c.offset+c.days)/7)},(_,w)=>`<tr>${Array.from({length:7},(_,d)=>{const n=w*7+d-c.offset+1;return n<1||n>c.days?'<td></td>':`<td><span ${n===c.today?'class="calendar-today" aria-current="date"':''}>${n}</span></td>`;}).join('')}</tr>`).join('')}</tbody></table></div>`;
}
export function simulationCells(item) {
 return Array.from({length:item.days},(_,index)=>{
  const date=new Date(item.start+'T12:00:00');date.setDate(date.getDate()+index);
  const key=day(date),answer=item.answers[key];
  return {date:key,answer:['yes','no','unsure'].includes(answer)?answer:'empty'};
 });
}
function simulationGrass(item) {
 const names={yes:'필요했어요',no:'필요 없었어요',unsure:'잘 모르겠어요',empty:'미기록'};
 return `<div class="simulation-grass"><p class="grass-heading">하루 한 칸, 나의 기록 <span>${item.days}일</span></p><div class="grass-grid" role="list" aria-label="날짜별 필요 기록">${simulationCells(item).map(c=>`<span role="listitem" tabindex="0" class="grass-cell ${c.answer==='empty'?'unanswered':c.answer}" aria-label="${c.date} · ${names[c.answer]}"><span class="grass-tooltip">${c.date} · ${names[c.answer]}</span></span>`).join('')}</div><div class="grass-legend">${Object.entries(names).filter(([key])=>key!=='empty').map(([key,label])=>`<span><i class="grass-cell ${key}" aria-hidden="true"></i>${label}</span>`).join('')}</div></div>`;
}
function homeSelection() {
 const i=state.items.find(i=>i.id===selectedHomeItem);
 if(!i)return `<div class="calendar-balance"><h2>이번 달 자유 소비 잔액</h2><div class="balance-line"><strong class="big">${won(balance())}</strong>${link('WebBudget','가계부 열기 →','text-link')}</div><p>예산과 추가 소득에서 이번 달 자유 지출을 뺀 금액이에요.</p></div>${homeCalendar()}`;
 const days=Math.max(0,Math.min(elapsed(i.start),i.days));
 return `<div class="detail-close-row"><button type="button" class="detail-close" data-action="clear-home" aria-label="선택 해제" title="선택 해제">×</button></div><h2>${esc(i.name)}</h2><p>${esc(i.category)} · ${won(i.price)}</p>${simulationGrass(i)}<div class="home-records"><div><small>기록한 날</small><strong>${Object.keys(i.answers).length}일</strong></div><div><small>필요했던 날</small><strong>${used(i)}일</strong></div></div><p>${i.status!=='active'?'시뮬레이션을 마친 물건이에요.':ready(i)?'기다림이 끝났어요. 기록을 보고 결정해 보세요.':`앞으로 ${i.days-days}일, 필요한 순간을 기록해 봐요.`}</p>${link('WebItem/'+encodeURIComponent(i.id),ready(i)?'결과 확인하고 결정하기 →':'기록 자세히 보기 →','primary')}`;
}
function home() {
 const visible=state.items.filter(i=>filter==='all'||i.status===filter);
 if(!visible.some(i=>i.id===selectedHomeItem))selectedHomeItem='';
 return `<section class="home-banner"><div><span class="eyebrow">TODAY, BUY OR BYE</span><h1>${homeMessage}</h1><p>사기 전에, 잠깐. 오늘의 마음을 BoB와 돌아봐요.</p></div><model-viewer class="banner-mascot" src="mascot-brown.glb" camera-orbit="30deg 90deg 105%" orientation="35deg -25deg 0deg" field-of-view="30deg" exposure="1" environment-image="neutral" shadow-intensity="0" interaction-prompt="none" loading="eager" reveal="auto" aria-hidden="true" tabindex="-1"></model-viewer></section>
 <div class="home-pair home-overview"><section class="callout"><div><span class="eyebrow">매일 1분, 나를 알아가는 시간</span><h2>이미 샀다면,<br>오늘 필요했을까요?</h2><p>오늘 필요한 순간이 있었는지 기록해 보세요.</p>${link('WebCheck',due().length?`오늘의 질문 ${due().length}개 답하기 →`:'오늘의 기록 확인하기 →','primary')}</div><svg class="notebook-art" viewBox="0 0 140 150" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"><rect x="22" y="32" width="86" height="100" rx="10"/><path d="M40 24v18m22-18v18m22-18v18M38 76h28m-28 20h22m-22 17h40"/><path d="m77 91 7-24 35-35a8 8 0 0 1 12 12L96 79z" fill="var(--cream)"/><path d="m110 41 12 12M77 91l19-12"/></g></svg></section><section class="panel home-goal"><span class="eyebrow">나의 목표 달성도</span>${goalCard(true)}${link('WebGoals','목표 관리 →','text-link')}</section></div>
 <div class="home-pair home-bottom"><section><div class="section-title home-items-toolbar"><div class="home-items-heading"><h2>나의 물건</h2><select id="home-item-filter" aria-label="물건 상태 필터">${[['active','진행 중'],['buy','Buy'],['bye','Bye'],['all','전체']].map(([value,label])=>`<option value="${value}" ${filter===value?'selected':''}>${label}</option>`).join('')}</select></div>${link('WebAdd','＋ 물건 등록','primary')}</div><div class="panel home-list">${visible.map(i=>`<button type="button" class="item-row home-item" data-action="select-home" data-id="${esc(i.id)}" aria-pressed="${selectedHomeItem===i.id}" aria-controls="home-detail"><span class="item-icon" aria-hidden="true">▧</span><span class="item-info"><strong>${esc(i.name)}</strong><small>${esc(i.category)} · ${esc(status(i))}</small></span><span><strong>${won(i.price)}</strong><small>${i.days}일 시뮬레이션</small></span><span aria-hidden="true">→</span></button>`).join('')||empty('아직 물건이 없어요','사고 싶은 물건을 올려 두고, 며칠만 산 것처럼 지내 보세요.')}</div></section><section id="home-detail" class="panel home-detail" aria-label="선택한 물건 또는 소비 잔액" aria-live="polite">${homeSelection()}</section></div>`;
}
export function validGoalImage(value) {return typeof value==='string' && value.length<=2800000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);}
async function readGoalImage(file) {
 if(!(file instanceof File)||!file.size)return '';
 if(file.size>2000000||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('2MB 이하의 PNG, JPEG, WebP 이미지를 골라 주세요.');
 const bitmap=await createImageBitmap(file).catch(()=>{throw Error('이미지를 읽을 수 없어요. 다른 사진을 골라 주세요.');});bitmap.close();
 return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('이미지를 읽지 못했어요. 다시 선택해 주세요.'));reader.readAsDataURL(file);});
}
function goalCard(home=false) {
 const g=state.goals.find(g=>g.active);
 if(!g)return '<h2>진짜 원하는 것을 위해</h2><p>참은 금액을 모을 목표를 정해 보세요.</p>';
 const amount=goalAmount(g),percent=Math.min(100,Math.floor(amount/g.price*100));
 const image=validGoalImage(g.image)?`<img class="${home?'goal-background':'goal-preview'}" src="${esc(g.image)}" alt="${home?'':esc(g.name)}" ${home?'aria-hidden="true"':''} width="180" height="180">`:'';
 return `${image}<div class="goal-summary"><h2>${esc(g.name)}</h2><div class="goal-meter-label"><span>목표까지 차곡차곡</span><strong>${percent}%</strong></div><progress aria-label="목표 달성률" value="${Math.min(amount,g.price)}" max="${g.price}">${percent}%</progress><p>${won(amount)} / ${won(g.price)}</p>${amount>=g.price?'<span class="badge">목표 달성!</span>':''}</div>`;
}
function goalImageForm() {const g=state.goals.find(g=>g.active);return g?`<form id="goal-image-form" novalidate>${field('image','현재 목표 상품 이미지','file','','accept="image/png,image/jpeg,image/webp"')}<p>2MB 이하 · 이 브라우저에만 저장해요.</p>${formEnd('목표 이미지 저장')}${g.image?button('이미지 제거','remove-goal-image',g.id):''}`:'';}
function add() {return `<div class="page-title"><div><span class="eyebrow">NEW SIMULATION</span><h1>장바구니 대신, BoB에.</h1><p>등록한 물건은 가격에 따라 3일, 7일, 14일 동안 생각해 봐요.</p></div></div><div class="two-columns"><section class="panel"><h2>물건 정보</h2><form id="add-form" novalidate>${field('name','물건 이름','text',aiDrafts[0]?.name||'','maxlength="120" required')}${field('price','가격 (원)','number',aiDrafts[0]?.price??'','required')}${select('category','카테고리',categories)}${field('url','상품 링크 (선택)','url',aiDrafts[0]?.source_url||'')}<fieldset><legend>왜 사고 싶어졌나요? <small>여러 개 골라도 돼요</small></legend><div class="chips">${reasons.map(r=>`<label><input type="checkbox" name="reason" value="${esc(r)}"><span>${esc(r)}</span></label>`).join('')}</div></fieldset>${formEnd('시뮬레이션 시작하기')}<p>등록 정보는 이 브라우저에만 저장돼요.</p></section><aside><section class="panel"><h2>캡처 또는 링크에서 가져오기</h2><p>선택한 이미지·링크만 AI 분석 서버에 전송해요. 결과를 확인한 후 직접 등록해 주세요.</p><form id="ai-form" novalidate>${field('url','상품 링크','url')}${field('image','장바구니 캡처','file','','accept="image/png,image/jpeg,image/webp"')}<p>이미지는 최대 4MB. 링크와 이미지 중 하나만 선택해 주세요.</p>${formEnd('AI로 정보 가져오기')}${aiDrafts.length?`<h3>인식한 물건 ${aiDrafts.length}개</h3>${aiDrafts.map((d,n)=>button(esc(d.name),'draft',n,'draft-choice')).join('')}`:''}</section><section class="tip"><h3>바로 결제하지 않아도 괜찮아요.</h3><p>기다리는 동안 진짜 필요한 물건인지 알게 될 거예요.</p></section></aside></div>`;}
export function swipeAnswer(dx, dy) {
 if(Math.abs(dy)>Math.abs(dx)&&dy < -90)return 'unsure';
 if(dx>90)return 'yes';
 if(dx < -90)return 'no';
 return null;
}
let swipeBusy = false;
/** @type {{card:HTMLElement,pointer:number,x:number,y:number,dx:number,dy:number}|null} */
let swipeDrag = null;
function resetSwipe(card) {
 card.classList.remove('is-dragging');card.style.transform='';card.style.opacity='';
 delete card.dataset.answer;card.style.removeProperty('--swipe-strength');
 const stamp=card.querySelector('.swipe-stamp');if(stamp)stamp.textContent='';
}
async function submitSwipe(id, answer) {
 const card=query('.swipe-card');
 if(swipeBusy||!card||card.dataset.itemId!==id||!['yes','no','unsure'].includes(answer)||!due().some(i=>i.id===id))return;
 swipeBusy=true;swipeDrag=null;card.classList.remove('is-dragging');card.setAttribute('aria-busy','true');
 card.dataset.answer=answer;card.style.setProperty('--swipe-strength','1');
 const stamp=card.querySelector('.swipe-stamp');if(stamp)stamp.textContent={yes:'필요했어요',no:'필요 없었어요',unsure:'잘 모르겠어요'}[answer];
 try {
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const end=answer==='unsure'?'translateY(-600px)':`translateX(${answer==='yes'?560:-560}px) rotate(${answer==='yes'?24:-24}deg)`;
  const animation=card.animate([{transform:card.style.transform||'none',opacity:1},{transform:end,opacity:0}],{duration:reduced?0:280,easing:'ease-out',fill:'forwards'});
  await animation.finished;
  if(!card.isConnected||location.hash!=='#/WebCheck')return;
  answeredPage=0;
  try{commit(s=>s.items.find(i=>i.id===id).answers[today()]=answer,'');}catch(e){animation.cancel();throw e;}
  if(!due().length)window.scrollTo(0,0);
  query('.swipe-card')?.focus({preventScroll:true});
 }catch(e){resetSwipe(card);notify(e.message||'답변을 저장하지 못했어요. 다시 시도해 주세요.');}
 finally{swipeBusy=false;card.removeAttribute('aria-busy');}
}
let answeredPage = 0;
export function answeredTodayPage(items, page=0, date=today()) {
 const answerLabels={yes:'필요했어요',no:'필요 없었어요',unsure:'잘 모르겠어요'};
 const answered=items.filter(i=>answerLabels[i.answers?.[date]]).map(i=>({item:i,...simulationProgress(i,date)})).sort((a,b)=>Number(b.finishedToday)-Number(a.finishedToday));
 const pages=Math.max(1,Math.ceil(answered.length/5)),current=Math.max(0,Math.min(Math.trunc(page)||0,pages-1));
 const arrow=(direction,label,target,disabled)=>`<button type="button" class="answered-arrow" data-action="answered-page" data-id="${target}" aria-label="${label}" ${disabled?'disabled':''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${direction==='left'?'m15 4-8 8 8 8':'m9 4 8 8-8 8'}"/></svg></button>`;
 return `<div id="answered-today" class="answered-today">${answered.length?`<div class="answered-carousel ${pages>1?'has-pages':''}">${pages>1?arrow('left','오늘 답변 목록 이전 페이지',current-1,current===0):''}<ul class="answered-list" aria-label="오늘 답변한 물건">${answered.slice(current*5,current*5+5).map(({item:i,current:count,finishedToday})=>`<li><a href="#/WebItem/${encodeURIComponent(i.id)}"${finishedToday?' class="is-complete"':''}><span class="answered-item-name"><strong>${esc(i.name)}</strong><small>${esc(i.category)} · ${won(i.price)}</small></span><span class="answered-item-status"><span class="answered-badge ${i.answers[date]}">${answerLabels[i.answers[date]]}</span><span class="answered-progress"><span>${finishedToday?'완료 · ':''}${count} / ${i.days}일</span><progress value="${count}" max="${i.days}" aria-label="시뮬레이션 ${i.days}일 중 ${count}일째">${count} / ${i.days}일</progress></span></span></a></li>`).join('')}</ul>${pages>1?arrow('right','오늘 답변 목록 다음 페이지',current+1,current===pages-1):''}</div><p id="answered-page-status" class="answered-page-status" tabindex="-1" aria-live="polite">오늘 답변한 물건 ${answered.length}개${pages>1?` · ${current+1} / ${pages} 페이지`:''}</p>`:'<p class="answered-none">오늘 답변한 물건이 아직 없어요.</p>'}</div>`;
}
function check() {const queue=due(),i=queue[0];if(!i)return `<section class="check-complete"><div class="empty-mark" aria-hidden="true">BoB</div><h1>오늘의 질문을 모두 마쳤어요</h1><p>답변은 하루에 한 번 기록돼요. 내일 다시 필요한 순간을 돌아봐요.</p>${answeredTodayPage(state.items,answeredPage)}${link('WebHome','홈으로 돌아가기','primary')}</section>`;return `<div class="page-title"><div><span class="eyebrow">DAILY CHECK-IN</span><h1>오늘, 그 물건이 필요했나요?</h1><p>남은 질문 ${queue.length}개 · ${today()}</p></div>${link('WebHome','나중에 하기')}</div><div class="swipe-experience"><div class="swipe-stage"><span class="swipe-guide swipe-guide-up" aria-hidden="true">↑ 잘 모르겠어요</span><span class="swipe-guide swipe-guide-left" aria-hidden="true">←<br>필요 없었어요</span><span class="swipe-guide swipe-guide-right" aria-hidden="true">→<br>필요했어요</span><section class="question-card swipe-card" data-item-id="${esc(i.id)}" tabindex="0" aria-label="${esc(i.name)} 오늘의 질문 카드" aria-describedby="swipe-instructions" aria-keyshortcuts="ArrowLeft ArrowUp ArrowRight"><span class="badge">${esc(i.category)} · ${elapsed(i.start)+1}일째 / ${i.days}일</span><div class="question-object" aria-hidden="true">?</div><h2>${esc(i.name)}</h2><p>오늘 이 물건을 쓸 만한<br>순간이 있었나요?</p><span class="swipe-stamp" aria-hidden="true"></span><small>카드를 원하는 방향으로 밀어 주세요</small></section></div><p id="swipe-instructions" class="swipe-instructions">왼쪽은 필요 없었어요 · 위쪽은 잘 모르겠어요 · 오른쪽은 필요했어요<br>마우스 드래그, 터치 스와이프 또는 키보드 방향키로 답할 수 있어요.</p><details class="swipe-alternative"><summary>직접 선택해서 답하기</summary><div>${button('필요 없었어요','answer-no',i.id)}${button('잘 모르겠어요','answer-unsure',i.id)}${button('필요했어요','answer-yes',i.id)}</div></details></div>`;}

function itemPage(id) {const i=state.items.find(i=>i.id===id);if(!i)return empty('물건을 찾을 수 없어요','삭제되었거나 주소가 잘못됐어요.','WebHome','홈으로');const count=used(i);return `${link('WebHome','← 나의 물건','text-link')}<div class="page-title"><div><span class="eyebrow">${esc(status(i))}</span><h1>${esc(i.name)}</h1><p>${esc(i.category)} · ${won(i.price)}</p></div></div><div class="two-columns"><section class="panel"><h2>산 것처럼 지내 본 기록</h2><div class="stats"><article><small>필요했던 날</small><strong>${count}일</strong></article><article><small>기록한 날</small><strong>${Object.keys(i.answers).length}일</strong></article><article><small>1회당 비용</small><strong>${count?won(i.price/count):'—'}</strong></article></div><div class="day-grid">${Array.from({length:i.days},(_,n)=>{const date=new Date(i.start+'T12:00:00');date.setDate(date.getDate()+n);const a=i.answers[day(date)];return `<span class="day ${a||''}" title="${day(date)} · ${a==='yes'?'있었어요':a==='no'?'없었어요':a==='unsure'?'모르겠어요':'미응답'}">${n+1}</span>`;}).join('')}</div><p>노랑: 필요했어요 · 갈색: 없었어요 · 연한색: 모르겠어요 / 미응답</p><h3>등록한 이유</h3><p>${i.reasons.map(esc).join(' · ')||'선택한 이유가 없어요.'}</p>${i.status==='active'?`<div class="actions">${ready(i)?button('Buy · 살게요','buy',id,'primary')+button('7일 더 지켜볼게요','hold',id):link('WebCheck','오늘의 질문 답하기','primary')}${button('Bye · 안 살래요','bye',id)}</div>`:''}${i.status==='buy'?`<h3>구매 후 사용 점검</h3>${elapsed(i.decided)>=14?`<p>지난 14일 동안 얼마나 자주 썼나요?</p><div class="actions">${[[12,'거의 매일'],[7,'자주'],[2.5,'가끔'],[0,'한 번도 안 씀']].map(([n,t])=>button(t,'review-'+n,id,i.review===n?'selected':'')).join('')}</div>`:`<p>구매 후 ${Math.max(0,14-elapsed(i.decided))}일 뒤에 실제 사용을 기록해요.</p>`}`:''}</section><aside class="panel"><h2>기다림도 하나의 선택</h2><p>${i.status==='bye'?'보내준 물건의 가격이 지킨 돈에 쌓였어요.':ready(i)?'기록한 필요와 비용을 함께 보고 결정해 보세요.':'가격에 맞춘 기간 동안 매일 한 번 돌아보세요.'}</p>${button('물건 삭제','delete-item',id,'danger')}</aside></div>`;}
let goalPage = 0, goalCreating = false, goalChoice = '1', goalDecisionFeedback = '';
const impulsePresets = [{name:'커피',amount:4800},{name:'치킨',amount:23000},{name:'떡볶이 배달',amount:18000},{name:'인형뽑기',amount:10000}];
export function goalCabinetPage(goals, page = 0) {
 const achieved=goals.filter(g=>g.achieved);
 const pages=Math.max(1,Math.ceil(achieved.length/9));
 const current=Math.max(0,Math.min(Math.trunc(page)||0,pages-1));
 const visible=achieved.slice(current*9,current*9+9);
 const shelves=Array.from({length:3},(_,row)=>`<div class="cabinet-shelf">${visible.slice(row*3,row*3+3).map(g=>`<article class="cabinet-goal" data-id="${esc(g.id)}" title="${esc(g.name)} · ${won(g.price)} · 달성">${g.image?`<img src="${esc(g.image)}" alt="" />`:'<span class="cabinet-goal-mark" aria-hidden="true">✦</span>'}<strong>${esc(g.name)}</strong><small>${won(g.price)}</small>${g.url?`<a class="cabinet-goal-state" href="${esc(g.url)}" target="_blank" rel="noopener noreferrer">달성 · 상품 보기 ↗</a>`:'<span class="cabinet-goal-state">달성</span>'}</article>`).join('')||(!row&&!achieved.length?'<p class="cabinet-empty">달성한 목표가 이곳에 놓여요.</p>':'')}</div>`).join('');
 return `<div class="cabinet-pages" id="cabinet-pages" data-page="${current}"><div class="cabinet-shelves">${shelves}</div>${pages>1?`<div class="cabinet-pagination" role="group" aria-label="목표 진열장 페이지"><button type="button" data-action="goal-page" data-id="${current-1}" aria-label="이전 페이지" ${current===0?'disabled':''}>←</button><span id="cabinet-page-status" tabindex="-1" aria-live="polite">${current+1} / ${pages}</span><button type="button" data-action="goal-page" data-id="${current+1}" aria-label="다음 페이지" ${current===pages-1?'disabled':''}>→</button></div>`:''}</div>`;
}
export function goalForecast(price, accumulated, monthlySaving, spending=0, date=today()) {
 const remaining=Math.max(0,price-accumulated),daily=monthlySaving>0?monthlySaving/30:0;
 const add=n=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+n);return Number.isNaN(d.getTime())?null:day(d);};
 const days=remaining===0?0:daily>0?Math.ceil(remaining/daily):null;
 const delay=daily>0&&spending>0?Math.max(1,Math.round(spending/daily)):null;
 return {daily,remaining,eta:days===null?null:add(days),delay,etaIfBuy:days!==null&&delay!==null?add(days+delay):null};
}
export function recordGoalDecision(data, goalId, name, amount, decision, date=today()) {
 const goal=data.goals.find(g=>g.id===goalId&&g.active&&!g.achieved);
 if(!goal)throw Error('진행 중인 목표를 확인해 주세요.');
 if(!name.trim()||name.length>120||!validAmount(amount)||amount<=0||!['resisted','spent'].includes(decision))throw Error('상품 이름과 금액을 확인해 주세요.');
 const id=uid();data.impulses.push({id,goalId,name:name.trim(),amount,decision,date});
 if(decision==='spent')data.expenses.push({id:uid(),impulseId:id,name:name.trim(),amount,bucket:'자유 소비',date});
}
const goalDate = date => date?new Date(date+'T12:00:00').toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'}):'저축액 설정 후 확인';
function goalDecisionValue(form) {
 const fd=new FormData(form),choice=String(fd.get('choice')??'');
 if(choice==='custom')return {name:String(fd.get('name')||'').trim(),amount:Number(fd.get('amount')||0)};
 return impulsePresets[Number(choice)]&&choice!==''?impulsePresets[Number(choice)]:{name:'',amount:0};
}
function goalImpact(g, name, amount) {
 if(!name||!validAmount(amount)||amount<=0)return '<p>지금 사려는 상품을 선택해 주세요.</p>';
 const forecast=goalForecast(g.price,goalAmount(g),budget().saving,amount);
 if(!forecast.daily)return `<p>가계부에 월 저축액을 입력하면 예상 달성일과 늦어지는 기간을 알 수 있어요.</p>${link('WebBudget','저축액 설정하기 →','text-link')}`;
 return `<p><strong>${esc(name)}</strong>에 ${won(amount)}을 쓰면<br>목표 달성이 <strong class="delay-days">${forecast.delay.toLocaleString('ko-KR')}일 늦어져요.</strong></p><div class="goal-date-comparison"><span>현재 예상 <strong>${goalDate(forecast.eta)}</strong></span><span aria-hidden="true">→</span><span>소비하면 <strong>${goalDate(forecast.etaIfBuy)}</strong></span></div><small>월 저축 ${won(budget().saving)} ÷ 30일 기준</small>`;
}
function goalDecisionCard(g) {
 if(g.achieved)return `<section class="panel goal-decision goal-celebration"><span class="eyebrow">GOAL ACHIEVED</span><h2>목표를 달성했어요!</h2><p>${esc(g.name)}을 진열장에 올렸어요.<br>다음으로 이루고 싶은 목표를 정해 볼까요?</p>${button('다음 목표 정하기','new-goal','','primary')}</section>`;
 const picked=impulsePresets[Number(goalChoice)],valid=goalChoice!==''&&!!picked;
 return `<section class="panel goal-decision"><h2>지금 뭘 사려고 하나요?</h2><form id="goal-decision-form" data-goal-id="${esc(g.id)}" novalidate><div class="goal-decision-content"><fieldset class="goal-choices"><legend class="sr-only">소비할 상품 선택</legend>${impulsePresets.map((p,i)=>`<label><input type="radio" name="choice" value="${i}" ${goalChoice===String(i)?'checked':''}><span>${esc(p.name)}<strong>${won(p.amount)}</strong></span></label>`).join('')}<label class="goal-custom-choice"><input type="radio" name="choice" value="custom" ${goalChoice==='custom'?'checked':''}><span>직접 입력</span></label></fieldset><div id="goal-custom-fields" class="goal-custom-fields" ${goalChoice==='custom'?'':'hidden'}>${field('name','상품 이름','text','','maxlength="120" placeholder="예: 마라탕"')}${field('amount','가격 (원)','number','','placeholder="0"')}</div><div id="goal-impact" class="goal-impact" aria-live="polite">${goalImpact(g,valid?picked.name:'',valid?picked.amount:0)}</div><p id="goal-decision-feedback" class="goal-decision-feedback" role="status" tabindex="-1">${esc(goalDecisionFeedback)}</p><p class="form-error" role="alert"></p></div><div class="goal-decision-actions"><button type="submit" class="primary" value="resisted" ${valid?'':'disabled'}>참을게요</button><button type="submit" value="spent" ${valid?'':'disabled'}>그래도 살래요</button></div></form></section>`;
}
function goalCurrent(g) {
 const amount=goalAmount(g),percent=Math.min(100,Math.floor(amount/g.price*100)),forecast=goalForecast(g.price,amount,budget().saving);
 return `<div class="goal-active-panels"><section class="panel goal-current"><div class="goal-current-heading"><span class="eyebrow">${g.achieved?'달성한 목표':'현재 목표'}</span>${button(g.achieved?'새 목표':'목표 바꾸기','new-goal')}</div><div class="goal-current-product">${g.image?`<img src="${esc(g.image)}" alt="">`:''}<div><h2>${esc(g.name)}</h2>${g.url?`<a href="${esc(g.url)}" target="_blank" rel="noopener noreferrer">구매 링크 ↗</a>`:''}</div><strong>${percent}%</strong></div><progress aria-label="목표 달성률" value="${amount}" max="${g.price}">${percent}%</progress><div class="goal-current-amount"><strong>${won(amount)}</strong><span> / ${won(g.price)}</span></div><div class="goal-current-eta"><span>${g.achieved?'달성일':'예상 달성일'}</span><strong>${goalDate(g.achieved?g.achievedAt||today():forecast.eta)}</strong></div><details class="goal-current-editor"><summary>상품 이미지 변경</summary><div>${goalImageForm()}</div></details></section>${goalDecisionCard(g)}</div>`;
}
function goalCreateForm() {
 return `<section class="panel goal-create"><div class="goal-form-heading"><h2>새 목표 만들기</h2>${state.goals.some(g=>g.active)?button('취소','cancel-goal-create'):''}</div><form id="goal-form" novalidate>${field('name','목표 이름','text','','required')}${field('price','목표 금액 (원)','number','','required')}${field('url','구매 링크 (선택)','url','','placeholder="https://"')}${field('image','상품 이미지 (선택)','file','','accept="image/png,image/jpeg,image/webp"')}<p>2MB 이하 · 이 브라우저에만 저장해요.</p>${formEnd('새 목표로 시작')}<p class="goal-create-note">새 목표를 만든 이후 참은 금액부터 쌓여요.</p></section>`;
}
function goals() {
 const activeGoal=state.goals.find(g=>g.active);
 return `<div class="page-title"><div><span class="eyebrow">SOMETHING WORTH WAITING FOR</span><h1>진짜 원하는 것에 가까이.</h1><p>참은 소비가 목표를 향한 한 걸음이 돼요.</p></div></div>
 <div class="two-columns goals-layout">${activeGoal&&!goalCreating?goalCurrent(activeGoal):goalCreateForm()}
 <section class="goal-cabinet" aria-labelledby="cabinet-title"><div class="cabinet-crown" aria-hidden="true"></div><header><h2 id="cabinet-title">나의 목표 진열장</h2><span aria-hidden="true">✦</span></header>${goalCabinetPage(state.goals,goalPage)}<div class="cabinet-feet" aria-hidden="true"></div></section></div>`;
}

const month = () => today().slice(0,7);
const budget = () => state.budgets[month()] || Object.entries(state.budgets).filter(([m])=>m<month()).sort(([a],[b])=>a.localeCompare(b)).at(-1)?.[1] || {income:0,food:0,living:0,transport:0,saving:0};
export function walletTotals(data, period) {
 const b=data.budgets[period] || Object.entries(data.budgets).filter(([m])=>m<period).sort(([a],[b])=>a.localeCompare(b)).at(-1)?.[1] || {income:0,food:0,living:0,transport:0,saving:0};
 const extraIncome=(data.incomes||[]).filter(e=>e.date.startsWith(period)).reduce((sum,e)=>sum+e.amount,0);
 const spent=data.expenses.filter(e=>e.date.startsWith(period)&&e.bucket==='자유 소비').reduce((sum,e)=>sum+e.amount,0);
 const planned=b.income-b.food-b.living-b.transport-b.saving;
 return {planned,extraIncome,spent,balance:planned+extraIncome-spent};
}
const balance = () => walletTotals(state,month()).balance;
let budgetEditing = false;
function walletSummary(totals) {
 return `<section class="panel wallet-summary" aria-label="이번 달 자유 소비 예산 잔액"><svg class="wallet-art" viewBox="0 0 140 120" aria-hidden="true"><g stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M24 34 100 18v72l-76 10z" fill="var(--gold)"/><path d="M20 39q0-10 12-10h67" fill="none"/><rect x="18" y="38" width="108" height="66" rx="12" fill="var(--brown)"/><path d="M27 48h87v46H27z" fill="none" stroke="var(--gold)" stroke-width="2" stroke-dasharray="4 5"/><path d="M105 60h23v25h-23q-14-12 0-25z" fill="var(--gold)"/><circle cx="110" cy="72" r="3" fill="var(--brown)" stroke="none"/></g></svg><div><span>이번 달 자유 소비 예산 잔액</span><strong tabindex="-1" id="wallet-balance">${won(totals.balance)}</strong><small>추가 소득 +${won(totals.extraIncome)} · 자유 지출 −${won(totals.spent)}</small></div></section>`;
}
function budgetReceipt(b, totals, savedBudget) {
 const editing=!savedBudget||budgetEditing;
 const fields=[['income','수입'],['food','식비'],['living','생활비'],['transport','교통비'],['saving','저축']];
 const label=(k,t)=>`<span class="receipt-label">${k==='income'?'':'<span class="receipt-minus" aria-hidden="true">−</span>'}${t} (원)</span>`;
 const rows=editing?`<form id="budget-form" novalidate><div class="receipt-fields">${fields.map(([k,t])=>field(k,label(k,t),'text',b[k],'inputmode="numeric" pattern="[0-9]*" required')).join('')}</div>`:`<dl class="receipt-fields receipt-saved-fields">${fields.map(([k,t])=>`<div><dt>${label(k,t)}</dt><dd>${won(b[k])}</dd></div>`).join('')}</dl>`;
 return `<section class="panel budget-receipt ${editing?'':'receipt-saved'}"><header class="receipt-heading"><span class="receipt-brand">BoB</span><h2>이번 달 예산</h2><span>${month()} · 나를 위한 소비 계획</span></header>${rows}<div class="receipt-total"><span>계획한 자유 소비</span><strong>${won(totals.planned)}</strong></div>${editing?formEnd('예산 저장')+(savedBudget?button('수정 취소','cancel-budget-edit','','receipt-edit'):''):button('예산 수정','edit-budget','','receipt-edit')}<div class="receipt-barcode" aria-hidden="true"></div><small class="receipt-footer">BUY OR BYE · 나를 위한 한 달</small></section>`;
}
function wallet() {
 const b=budget(),totals=walletTotals(state,month()),savedBudget=!!state.budgets[month()];
 const records=[...state.expenses.map(e=>({...e,kind:'expense'})),...state.incomes.map(e=>({...e,kind:'income',bucket:'추가 소득'}))].filter(e=>e.date.startsWith(month())).reverse().sort((a,b)=>b.date.localeCompare(a.date));
 return `<div class="page-title wallet-title compact-page-title"><div><span class="eyebrow">${month()} · MY WALLET</span><h1>어디에 쓰고 싶은가요?</h1>${savedBudget?'':`<p>이번 달 자유 소비 잔액 <strong>${won(totals.balance)}</strong></p>`}</div></div><div class="two-columns wallet-layout"><div class="wallet-budget-column">${savedBudget?walletSummary(totals):''}${budgetReceipt(b,totals,savedBudget)}</div>
 <section class="panel wallet-records">${savedBudget?'<svg class="wallet-record-tail" viewBox="0 0 30 48" aria-hidden="true"><path d="M30 2C24 17 15 23 2 22C12 35 22 42 30 46Z" fill="var(--paper)"/><path d="M30 2C24 17 15 23 2 22C12 35 22 42 30 46" fill="none" stroke="var(--line)" stroke-width="1"/></svg>':''}<h2>소득 · 지출 기록</h2><form id="wallet-entry-form" novalidate><label>기록 유형<select id="wallet-entry-kind" name="kind"><option value="expense">지출</option><option value="income">추가 소득</option></select></label><label><span id="wallet-entry-label">지출 내용</span><input name="name" maxlength="120" required></label>${field('amount','금액 (원)','text','','inputmode="numeric" pattern="[0-9]*" required')}<div id="wallet-expense-category">${select('bucket','항목',['자유 소비','식비','생활비','교통비'])}</div><p id="wallet-income-note" class="wallet-income-note" hidden>예산의 수입에 포함하지 않은 소득만 기록해 주세요. 자유 소비 잔액에 더해져요.</p>${formEnd('지출 추가')}<div class="wallet-history"><h3>이번 달 내역</h3>${records.map(e=>`<div class="item-row"><span class="item-info"><strong>${esc(e.name)}</strong><small>${esc(e.bucket)} · ${esc(e.date)}</small></span><strong class="wallet-record-amount ${e.kind}">${e.kind==='income'?'+':'−'}${won(e.amount)}</strong>${button('삭제','delete-'+e.kind,e.id)}</div>`).join('')||'<p>아직 소득·지출 기록이 없어요.</p>'}</div></section></div>`;
}
export function reportSummary(data) {
 const total=data.items.length,bye=data.items.filter(i=>i.status==='bye').length;
 return {total,bye,percent:total?bye/total*100:0,saved:savedTotal(data),reviewed:data.items.filter(i=>typeof i.review==='number').length};
}
function reportOverview(data) {
 const summary=reportSummary(data),percent=summary.percent.toLocaleString('ko-KR',{maximumFractionDigits:1});
 return `<section class="panel report-overview" aria-label="소비 기록 요약"><figure class="report-bye-chart"><figcaption>등록한 물건 중 Bye</figcaption><div class="report-donut"><svg viewBox="0 0 200 200" role="img" aria-label="전체 등록 물건 ${summary.total}개 중 Bye ${summary.bye}개, ${percent}%"><circle class="donut-track" cx="100" cy="100" r="78"/><circle class="donut-value" cx="100" cy="100" r="78" pathLength="100" stroke-dasharray="${summary.percent} 100" transform="rotate(-90 100 100)"/></svg><div class="donut-label" aria-hidden="true"><strong>${percent}<small>%</small></strong><span>Bye 비율</span></div></div><p>${summary.total?`등록한 ${summary.total.toLocaleString('ko-KR')}개 중 ${summary.bye.toLocaleString('ko-KR')}개를 보내줬어요.`:'물건을 등록하면 Bye 비율을 볼 수 있어요.'}</p><div class="report-chart-legend" aria-hidden="true"><span><i class="bye"></i>Bye</span><span><i></i>진행 중 · Buy</span></div></figure><dl class="report-summary-values"><div><dt>Bye 한 물건</dt><dd>${summary.bye.toLocaleString('ko-KR')}<span>개</span></dd></div><div><dt>지킨 돈</dt><dd>${won(summary.saved)}</dd></div><div><dt>구매 후 점검</dt><dd>${summary.reviewed.toLocaleString('ko-KR')}<span>개</span></dd></div></dl></section>`;
}
let reportPage = 0;
export function usageComparison(item, date=today()) {
 const expected=Math.min(14,Math.round(used(item)/item.days*14));
 const actual=Number.isFinite(item.review)&&item.review>=0&&item.review<=14?item.review:null;
 const since=Math.floor((Date.parse(date)-Date.parse(item.decided))/86400000);
 return {expected,actual,remaining:Number.isFinite(since)?Math.max(0,14-since):null};
}
export function purchaseReasons(items) {
 return reasons.map(reason=>{const matches=items.filter(i=>i.reasons.includes(reason));return {reason,items:matches,bye:matches.filter(i=>i.status==='bye').length};}).filter(r=>r.items.length).sort((a,b)=>b.items.length-a.items.length);
}
export function usageReport(items, page=0, date=today()) {
 const purchases=items.filter(i=>i.status==='buy'||Number.isFinite(i.review));
 const pages=Math.max(1,Math.ceil(purchases.length/3)),current=Math.max(0,Math.min(pages-1,page));
 const rows=purchases.slice(current*3,current*3+3).map(i=>{
  const {expected,actual,remaining}=usageComparison(i,date),difference=actual===null?null:actual-expected;
  const bar=(label,value,kind)=>`<div class="usage-bar"><span>${label}</span><div class="usage-track" aria-hidden="true"><i class="${kind}" style="width:${value/14*100}%"></i></div><strong>${value}일</strong></div>`;
  return `<article class="usage-item"><div class="usage-item-title">${link('WebItem/'+encodeURIComponent(i.id),esc(i.name))}<span>${esc(i.category)}</span></div>${bar('예상',expected,'expected')}${actual!==null?`${bar('실제',actual,'actual')}<p class="usage-insight">${difference===0?'예상한 만큼 사용했어요.':`생각했던 것보다 약 ${Math.abs(difference)}일 ${difference>0?'더':'적게'} 사용했어요.`}</p>`:`<div class="usage-pending"><span>실제 사용 · ${remaining===null?'점검 날짜 확인이 필요해요':remaining>0?`사용 점검까지 ${remaining}일`:'사용 점검할 시간이에요'}</span>${remaining===0?link('WebItem/'+encodeURIComponent(i.id),'실제 사용 기록하기 →','text-link'):''}</div>`}</article>`;
 }).join('');
 return `<div id="report-usage"><div class="usage-items">${rows||`<div class="report-no-data"><strong>구매 후의 이야기도 남겨 보세요.</strong><p>구매한 물건이 생기면 예상 사용과 실제 사용을 나란히 보여드려요.</p>${link('WebHome','나의 물건 보기 →','text-link')}</div>`}</div>${pages>1?`<nav class="report-pagination" aria-label="사용 비교 페이지"><button data-action="report-page" data-id="${current-1}" aria-label="이전 사용 비교 페이지" ${current===0?'disabled':''}>←</button><span id="report-page-status" role="status" tabindex="-1">${current+1} / ${pages}</span><button data-action="report-page" data-id="${current+1}" aria-label="다음 사용 비교 페이지" ${current===pages-1?'disabled':''}>→</button></nav>`:''}</div>`;
}
export function reasonsReport(items) {
 const groups=purchaseReasons(items),max=groups[0]?.items.length||1;
 return groups.map(r=>`<details class="reason-breakdown"><summary><span class="reason-heading"><strong>${esc(r.reason)}</strong><span>${r.items.length}개 중 Bye ${r.bye}개 <i aria-hidden="true">⌄</i></span></span><span class="reason-track" style="--reason-columns:${Math.min(max,20)}" aria-hidden="true">${r.items.map(i=>`<i class="reason-block${i.status==='bye'?' is-bye':''}" title="${esc(i.name)} · ${esc(labels[i.status])}"></i>`).join('')}</span></summary><ul>${r.items.map(i=>`<li>${link('WebItem/'+encodeURIComponent(i.id),`<span>${esc(i.name)}<small>${won(i.price)}</small></span><span class="reason-item-status">${esc(labels[i.status])} →</span>`)}</li>`).join('')}</ul></details>`).join('')||`<div class="report-no-data"><strong>어떤 마음으로 고른 물건인가요?</strong><p>물건을 등록할 때 구매 이유를 골라 주세요.</p>${link('WebAdd','물건 등록하기 →','text-link')}</div>`;
}
function report() {
 return `<div class="page-title compact-page-title"><div><span class="eyebrow">YOUR SPENDING STORY</span><h1>내 소비를 알아가는 중.</h1><p>기록이 쌓일수록, 나에게 필요한 것이 선명해져요.</p></div></div>${reportOverview(state)}<div class="two-columns report-details"><section class="panel report-usage-panel"><h2>생각보다 얼마나 썼나요?</h2><p class="report-description">구매 후 14일, 예상과 실제를 나란히.</p><div class="report-key"><span><i class="expected"></i>예상 사용</span><span><i class="actual"></i>실제 사용</span></div>${usageReport(state.items,reportPage)}<p class="report-method">예상은 시뮬레이션의 필요했던 날을 14일로 환산해요. 실제는 사용 점검에서 답한 빈도를 일수로 환산한 값이에요.</p></section><section class="panel report-reasons-panel"><h2>내 마음을 움직인 이유</h2><p class="report-description">자주 고른 이유부터, 그 뒤의 선택까지.</p><div class="report-key"><span><i class="reason-all"></i>등록한 물건</span><span><i class="reason-bye"></i>그중 Bye</span></div>${reasonsReport(state.items)}<p class="report-method">한 블록은 물건 하나예요. 여러 이유를 고르면 각각에 포함돼요.<br>이유를 누르면 해당 물건을 볼 수 있어요.</p></section></div>`;
}
function discount() {return `<div class="page-title"><div><span class="eyebrow">DISCOUNT CHECK</span><h1>할인 받으려다 더 쓰나요?</h1><p>필요한 것만 샀을 때와 장바구니 전체 결제액을 비교해요.</p></div></div><section class="panel narrow"><form id="discount-form" novalidate>${field('needed','필요한 물건 합계 (원)','number','','required')}${field('extra','할인을 위해 추가한 물건 (원)','number',0,'required')}${field('min','할인 적용 최소 금액 (원)','number',30000,'required')}${field('pct','할인율 (%)','number',10,'max="100" required')}${field('shipping','배송비 (원)','number',3000,'required')}${field('free','무료배송 기준 (원, 0이면 없음)','number',40000,'required')}${formEnd('비교하기')}<div id="discount-result" aria-live="polite"></div></section>`;}
function settings() {return `<div class="page-title compact-page-title"><div><span class="eyebrow">YOUR DATA, YOUR DEVICE</span><h1>내 데이터와 설정</h1><p>기록은 이 브라우저에만 저장돼요. 브라우저 데이터를 지우기 전에 백업해 주세요.</p></div></div><section class="panel narrow"><h2>데이터 백업</h2><div class="actions">${button('백업 파일 다운로드','export')}<label class="file-button">백업 복원<input id="import-file" type="file" accept="application/json,.json"></label></div><h2>AI 분석 서버</h2><p>AI 가져오기에서만 사용돼요. 개인 기록은 서버에 저장하지 않아요.</p><form id="settings-form" novalidate>${field('apiBase','서버 주소','url',state.apiBase||'')}${formEnd('설정 저장')}<h2>데이터 초기화</h2><p>이 브라우저의 모든 BoB 웹 기록을 삭제해요.</p>${button('모든 기록 삭제','reset','','danger')}</section>`;}
const routes={WebHome:['홈',home],WebAdd:['물건 등록',add],WebCheck:['오늘의 질문',check],WebGoals:['목표',goals],WebBudget:['가계부',wallet],WebReport:['리포트',report],WebDiscount:['할인 함정',discount],WebSettings:['설정',settings]};
function render() {
 dirty = false;
 const app=query('#app'),landing=query('#landing');if(!app)return;
 const [route,id]=location.hash.replace(/^#\//,'').split('/');const isLanding=!route||route==='WebLanding'||!location.hash.startsWith('#/');if(landing)landing.hidden=!isLanding;app.hidden=isLanding;if(isLanding)return;
 const current=routes[route];document.title=`${current?.[0]||'물건 상세'} · BoB`;
 app.innerHTML=`<a class="skip" href="#bob-main">본문으로 이동</a><div class="app-shell"><aside class="sidebar">${link('WebLanding','<span class="brand-mark"><img class="brand-logo" src="bob-logo.png" alt="BoB" width="144" height="134"><span>Buy or Bye</span></span>','app-brand')}<nav aria-label="웹앱 메뉴">${Object.entries(routes).filter(([r])=>!['WebAdd','WebDiscount'].includes(r)).map(([r,[title]],n)=>`<a href="#/${r}" ${r===route?'aria-current="page"':''}><span aria-hidden="true">${['⌂','＋','◷','◎','▤','◇'][n]}</span>${title}</a>`).join('')}</nav><div class="sidebar-note">살까, 말까?<br>며칠만 산 것처럼.<small>기록은 이 브라우저에 저장돼요.</small></div></aside><main id="bob-main" tabindex="-1"><div id="bob-status" role="status" ${warning?'':'hidden'}>${esc(warning)}</div>${route==='WebItem'?itemPage(id||''):current?current[1]():empty('없는 페이지예요','메뉴에서 원하는 화면으로 이동해 주세요.','WebHome','홈으로')}</main></div><dialog id="bob-dialog" aria-labelledby="dialog-title"><h2 id="dialog-title"></h2><p id="dialog-description"></p><div class="actions"><button id="dialog-cancel">취소</button><button id="dialog-ok" class="primary">확인</button></div></dialog>`;
}
function confirmAction(title,description,action) {const dialog=/** @type {HTMLDialogElement} */(query('#bob-dialog'));dialog.querySelector('h2').textContent=title;dialog.querySelector('p').textContent=description;query('#dialog-cancel').onclick=()=>dialog.close();query('#dialog-ok').onclick=()=>{dialog.close();try{action();}catch(e){notify(e.message);}};dialog.showModal();query('#dialog-cancel').focus();}
function getNumber(fd,key,positive=false) {const raw=fd.get(key);const n=Number(raw);if(raw===null||String(raw).trim()===''||!validAmount(n)||(positive&&n===0))throw Error('금액을 0 이상의 정수로 입력해 주세요. 목표 금액은 0보다 커야 해요.');return n;}
function getName(fd) {const name=String(fd.get('name')||'').trim();if(!name||name.length>120)throw Error('이름을 1~120자로 입력해 주세요.');return name;}
const uid = () => crypto.randomUUID();
function safeUrl(value) {if(!value)return '';const u=new URL(value);if(!['http:','https:'].includes(u.protocol))throw Error('http 또는 https 링크를 입력해 주세요.');return u.href;}
const requestAi = createAiClient();
const aiRequest = (path,body) => requestAi(path,body,state.apiBase || API_BASE);
if(typeof document!=='undefined') {
 document.addEventListener('input',event=>{if(event.target instanceof Element && event.target.closest('#app form'))dirty=true;if(!(event.target instanceof HTMLInputElement))return;const form=event.target.closest('#goal-decision-form');if(!(form instanceof HTMLFormElement))return;if(event.target.name==='choice')goalChoice=event.target.value;query('#goal-custom-fields').hidden=goalChoice!=='custom';const g=state.goals.find(g=>g.id===form.dataset.goalId&&g.active&&!g.achieved);if(!g)return;const chosen=goalDecisionValue(form);query('#goal-impact').innerHTML=goalImpact(g,chosen.name,chosen.amount);query('#goal-decision-feedback').textContent='';form.querySelectorAll('button[type="submit"]').forEach(b=>{if(b instanceof HTMLButtonElement)b.disabled=!chosen.name||chosen.name.length>120||!validAmount(chosen.amount)||chosen.amount<=0;});});
 window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
 document.addEventListener('click',event=>{if(!(event.target instanceof Element))return;const skip=event.target.closest('a[href="#bob-main"]');if(skip){event.preventDefault();query('#bob-main')?.focus();return;}if(!dirty)return;const anchor=event.target.closest('a[href^="#/"]');if(!anchor||anchor.getAttribute('href')===location.hash)return;event.preventDefault();event.stopImmediatePropagation();confirmAction('입력 중인 내용을 버릴까요?','저장하지 않은 입력이 사라져요.',()=>{dirty=false;location.hash=anchor.getAttribute('href');});},true);
 document.addEventListener('submit',async event=>{const form=event.target;if(!(form instanceof HTMLFormElement)||!form.closest('#app'))return;event.preventDefault();const fd=new FormData(form),error=/** @type {HTMLElement} */(form.querySelector('.form-error')),submit=/** @type {HTMLButtonElement} */(form.querySelector('[type="submit"]'));error.textContent='';try {
  switch(form.id){
   case 'add-form':{const name=getName(fd),price=getNumber(fd,'price'),url=safeUrl(String(fd.get('url')||''));const id=uid();commit(s=>s.items.unshift({id,name,price,category:String(fd.get('category')),reasons:fd.getAll('reason'),url,start:today(),days:duration(price),status:'active',answers:{}}));aiDrafts=[];location.hash='#/WebItem/'+id;break;}
   case 'goal-form':{if(submit.disabled)return;const name=getName(fd),price=getNumber(fd,'price',true),url=safeUrl(String(fd.get('url')||'').trim()),base=saved();submit.disabled=true;const image=await readGoalImage(fd.get('image'));commit(s=>{s.goals.forEach(g=>g.active=false);s.goals.push({id:uid(),name,price,base,active:true,image,url,createdAt:today()});},'');goalCreating=false;goalChoice='1';goalDecisionFeedback='';render();break;}
   case 'goal-image-form':{if(submit.disabled)return;const id=state.goals.find(g=>g.active)?.id;submit.disabled=true;const image=await readGoalImage(fd.get('image'));if(!image)throw Error('저장할 이미지를 선택해 주세요.');commit(s=>{const g=s.goals.find(g=>g.id===id);if(!g)throw Error('목표를 찾지 못했어요.');g.image=image;});break;}
   case 'goal-decision-form':{const chosen=goalDecisionValue(form),decision=event.submitter instanceof HTMLButtonElement?event.submitter.value:'';const oldChoice=goalChoice;goalChoice='';try{commit(s=>recordGoalDecision(s,form.dataset.goalId,chosen.name,chosen.amount,decision),'');}catch(e){goalChoice=oldChoice;throw e;}if(state.goals.find(g=>g.id===form.dataset.goalId)?.achieved)goalPage=Math.floor((state.goals.filter(g=>g.achieved).length-1)/9);goalDecisionFeedback=decision==='resisted'?`${won(chosen.amount)}을 참아서 목표에 더했어요.`:`${won(chosen.amount)}을 가계부에 기록했어요.`;render();query('#goal-decision-feedback')?.focus({preventScroll:true});break;}
   case 'impulse-form':{const name=getName(fd),amount=getNumber(fd,'amount',true);commit(s=>s.impulses.push({id:uid(),name,amount,date:today()}));break;}
   case 'wallet-entry-form':{const name=getName(fd),amount=getNumber(fd,'amount',true),kind=String(fd.get('kind')),bucket=String(fd.get('bucket'));if(!['expense','income'].includes(kind)||(kind==='expense'&&!['자유 소비','식비','생활비','교통비'].includes(bucket)))throw Error('기록 유형과 항목을 확인해 주세요.');commit(s=>{const entry={id:uid(),name,amount,date:today()};if(kind==='income')s.incomes.push(entry);else s.expenses.push({...entry,bucket});},kind==='income'?'추가 소득을 기록했어요.':'지출을 기록했어요.');break;}
   case 'budget-form':{const b=Object.fromEntries(['income','food','living','transport','saving'].map(k=>[k,getNumber(fd,k)]));const wasEditing=budgetEditing;budgetEditing=false;try{commit(s=>s.budgets[month()]=b,'');}catch(e){budgetEditing=wasEditing;throw e;}query('#wallet-balance')?.focus({preventScroll:true});break;}
   case 'settings-form':{const base=safeUrl(String(fd.get('apiBase')||''));if(!base)throw Error('AI 서버 주소를 입력해 주세요.');commit(s=>s.apiBase=base);break;}
   case 'discount-form':{const n=Object.fromEntries(['needed','extra','min','pct','shipping','free'].map(k=>[k,getNumber(fd,k)]));if(n.pct>100)throw Error('할인율은 0~100% 사이로 입력해 주세요.');const all=payment(n.needed+n.extra,n.min,n.pct,n.shipping,n.free),needed=payment(n.needed,n.min,n.pct,n.shipping,n.free);query('#discount-result').innerHTML=`<h2>${all>needed?`할인 받으려다 ${won(all-needed)} 더 써요`:'필요한 소비인지 한 번 더 생각해 봐요'}</h2><p>필요한 것만: ${won(needed)}<br>모두 구매: ${won(all)}</p>`;break;}
   case 'ai-form':{const url=String(fd.get('url')||'').trim(),file=fd.get('image');if(!(file instanceof File))throw Error('이미지를 선택해 주세요.');if(Boolean(url)===Boolean(file.size))throw Error('링크 또는 이미지 하나를 선택해 주세요.');submit.disabled=true;submit.textContent='분석 중…';if(file.size){if(file.size>4000000||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('4MB 이하의 PNG, JPEG, WebP 이미지를 골라 주세요.');const body=new FormData();body.append('image',file);aiDrafts=await aiRequest('/cart-extractions',body);}else aiDrafts=await aiRequest('/product-url-drafts',{url:safeUrl(url)});if(location.hash==='#/WebAdd'){render();notify('인식 결과를 확인하고 등록해 주세요.');}break;}
  }
 }catch(e){error.textContent=e.name==='AbortError'?'분석 시간이 초과됐어요. 다시 시도해 주세요.':e.message;error.tabIndex=-1;error.focus();}finally{if(submit?.isConnected){submit.disabled=false;if(form.id==='ai-form')submit.textContent='AI로 정보 가져오기';}}});
 document.addEventListener('click',event=>{if(!(event.target instanceof Element))return;const b=/** @type {HTMLElement} */(event.target.closest('[data-action]'));if(!b||!b.closest('#app'))return;const action=b.dataset.action,id=b.dataset.id,i=state.items.find(i=>i.id===id);try {
  if(action==='select-home'){selectedHomeItem=id;render();const selected=Array.from(document.querySelectorAll('button[data-action="select-home"]')).find(el=>el.getAttribute('data-id')===id);if(selected instanceof HTMLElement)selected.focus({preventScroll:true});}
  else if(action==='clear-home'){selectedHomeItem='';render();query('#home-detail').tabIndex=-1;query('#home-detail').focus({preventScroll:true});}
  else if(action==='draft'){const draft=aiDrafts[Number(id)];/** @type {HTMLInputElement} */(query('#add-form [name="name"]')).value=draft.name;/** @type {HTMLInputElement} */(query('#add-form [name="price"]')).value=draft.price;/** @type {HTMLInputElement} */(query('#add-form [name="url"]')).value=draft.source_url||'';/** @type {HTMLSelectElement} */(query('#add-form [name="category"]')).value=draft.category;dirty=true;}
  else if(action.startsWith('answer-')&&i)void submitSwipe(id,action.slice(7));
  else if(action==='report-page'){reportPage=Number(id);query('#report-usage').outerHTML=usageReport(state.items,reportPage);query('#report-page-status')?.focus({preventScroll:true});}
  else if(action==='answered-page'){answeredPage=Number(id);query('#answered-today').outerHTML=answeredTodayPage(state.items,answeredPage);query('#answered-page-status')?.focus({preventScroll:true});}
  else if(['buy','bye','hold'].includes(action)&&i&&i.status==='active'&&(action==='bye'||ready(i))){confirmAction(action==='buy'?'이 물건을 구매할까요?':action==='bye'?'이 물건을 보내줄까요?':'7일 더 지켜볼까요?',action==='buy'?'가격이 이번 달 가계부 지출에 기록돼요.':action==='bye'?'물건 가격이 지킨 돈에 쌓여요.':'기존 기록을 유지하고 시뮬레이션을 7일 연장해요.',()=>commit(s=>{const item=s.items.find(i=>i.id===id);if(action==='hold')item.days+=7;else {item.status=action;item.decided=today();if(action==='buy')s.expenses.push({id:uid(),itemId:id,name:item.name,amount:item.price,date:today(),bucket:item.category==='식품'?'식비':['생활용품','가구/인테리어'].includes(item.category)?'생활비':'자유 소비'});}}));}
  else if(action.startsWith('review-')&&i?.status==='buy'&&elapsed(i.decided)>=14)commit(s=>s.items.find(i=>i.id===id).review=Number(action.slice(7)));
  else if(action==='remove-goal-image')commit(s=>{const g=s.goals.find(g=>g.id===id);if(g)delete g.image;});
  else if(action==='goal-page'){goalPage=Number(id);query('#cabinet-pages').outerHTML=goalCabinetPage(state.goals,goalPage);query('#cabinet-page-status')?.focus({preventScroll:true});}
  else if(action==='new-goal'){goalCreating=true;render();query('#goal-form input')?.focus({preventScroll:true});}
  else if(action==='cancel-goal-create'){goalCreating=false;render();}
  else if(action==='edit-budget'){budgetEditing=true;render();query('#budget-form input')?.focus({preventScroll:true});}
  else if(action==='cancel-budget-edit'){const cancel=()=>{budgetEditing=false;render();query('#wallet-balance')?.focus({preventScroll:true});};if(dirty)confirmAction('수정을 취소할까요?','저장한 예산은 유지되고 입력 중인 변경만 사라져요.',cancel);else cancel();}
  else if(action.startsWith('delete-'))confirmAction('이 기록을 삭제할까요?','삭제한 기록은 되돌릴 수 없어요. 관련 금액 집계에서도 제외돼요.',()=>{commit(s=>{if(action==='delete-item'){s.items=s.items.filter(i=>i.id!==id);s.expenses=s.expenses.filter(e=>e.itemId!==id);}else if(action==='delete-expense')s.expenses=s.expenses.filter(e=>e.id!==id);else if(action==='delete-income')s.incomes=s.incomes.filter(e=>e.id!==id);else s.impulses=s.impulses.filter(e=>e.id!==id);});if(action==='delete-item')location.hash='#/WebHome';});
  else if(action==='export'){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='BoB-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  else if(action==='reset')confirmAction('모든 기록을 삭제할까요?','물건, 답변, 목표, 가계부 기록이 모두 삭제돼요. 필요한 기록은 먼저 백업해 주세요.',()=>{localStorage.removeItem(KEY);state=fresh();storageBlocked=false;warning='';render();notify('모든 기록을 삭제했어요.');});
 }catch(e){notify(e.message);}});
 document.addEventListener('change',async event=>{if(event.target instanceof HTMLSelectElement&&event.target.id==='wallet-entry-kind'){const income=event.target.value==='income';query('#wallet-entry-label').textContent=income?'소득 내용':'지출 내용';query('#wallet-expense-category').hidden=income;const category=/** @type {HTMLSelectElement} */(query('#wallet-expense-category select'));category.disabled=income;query('#wallet-income-note').hidden=!income;query('#wallet-entry-form button[type=submit]').textContent=income?'소득 추가':'지출 추가';return;}if(event.target instanceof HTMLSelectElement&&event.target.id==='home-item-filter'){filter=event.target.value;selectedHomeItem='';render();query('#home-item-filter')?.focus({preventScroll:true});return;}if(!(event.target instanceof HTMLInputElement)||event.target.id!=='import-file')return;try{const file=event.target.files[0];if(!file)return;if(file.size>10000000)throw Error('10MB 이하의 백업 파일을 선택해 주세요.');pendingImport=validate(JSON.parse(await file.text()));confirmAction('백업으로 복원할까요?','현재 기록을 백업 파일의 내용으로 교체해요.',()=>{localStorage.setItem(KEY,JSON.stringify(pendingImport));state=pendingImport;pendingImport=null;warning='';storageBlocked=false;render();notify('복원했어요.');});}catch(e){notify(e.message||'백업 파일을 읽지 못했어요.');}});
 document.addEventListener('pointerdown',event=>{
  if(swipeBusy||swipeDrag||!event.isPrimary||event.button!==0||!(event.target instanceof Element))return;
  const card=event.target.closest('.swipe-card');if(!(card instanceof HTMLElement))return;
  swipeDrag={card,pointer:event.pointerId,x:event.clientX,y:event.clientY,dx:0,dy:0};
  card.setPointerCapture(event.pointerId);card.classList.add('is-dragging');card.focus({preventScroll:true});
 });
 document.addEventListener('pointermove',event=>{
  if(!swipeDrag||event.pointerId!==swipeDrag.pointer)return;
  const drag=swipeDrag;if(!drag.card.isConnected){swipeDrag=null;return;}
  drag.dx=event.clientX-drag.x;drag.dy=event.clientY-drag.y;
  const answer=Math.abs(drag.dy)>Math.abs(drag.dx)&&drag.dy<0?'unsure':drag.dx>0?'yes':'no';
  const distance=answer==='unsure'?-drag.dy:Math.abs(drag.dx),strength=Math.max(0,Math.min(1,(distance-20)/70));
  drag.card.style.transform=`translate(${drag.dx}px,${Math.min(drag.dy,40)}px) rotate(${drag.dx/14}deg)`;
  drag.card.dataset.answer=answer;drag.card.style.setProperty('--swipe-strength',String(strength));
  const stamp=drag.card.querySelector('.swipe-stamp');if(stamp)stamp.textContent={yes:'필요했어요',no:'필요 없었어요',unsure:'잘 모르겠어요'}[answer];
 });
 document.addEventListener('pointerup',event=>{
  if(!swipeDrag||event.pointerId!==swipeDrag.pointer)return;
  const drag=swipeDrag;swipeDrag=null;
  if(drag.card.hasPointerCapture(event.pointerId))drag.card.releasePointerCapture(event.pointerId);
  const answer=swipeAnswer(event.clientX-drag.x,event.clientY-drag.y);
  if(answer)void submitSwipe(drag.card.dataset.itemId,answer);else resetSwipe(drag.card);
 });
 const cancelSwipe=event=>{if(swipeDrag&&event.pointerId===swipeDrag.pointer){resetSwipe(swipeDrag.card);swipeDrag=null;}};
 document.addEventListener('pointercancel',cancelSwipe);
 document.addEventListener('lostpointercapture',cancelSwipe);
 document.addEventListener('keydown',event=>{if(!(event.target instanceof Element))return;if(event.key==='Escape'&&swipeDrag){resetSwipe(swipeDrag.card);swipeDrag=null;return;}if(event.repeat||event.isComposing||location.hash!=='#/WebCheck'||event.target.closest('input,textarea,select,button,a,summary,[contenteditable="true"]')||query('dialog[open]'))return;const answer={ArrowRight:'yes',ArrowLeft:'no',ArrowUp:'unsure'}[event.key];if(answer){event.preventDefault();void submitSwipe(query('.swipe-card')?.dataset.itemId,answer);}});
 window.addEventListener('hashchange',()=>{render();if(location.hash.startsWith('#/')){window.scrollTo(0,0);query('#bob-main')?.focus();}});
 window.addEventListener('storage',event=>{if(event.key===KEY){try{state=event.newValue?validate(JSON.parse(event.newValue)):fresh();render();notify('다른 탭에서 변경한 기록을 반영했어요.');}catch{notify('다른 탭의 데이터를 읽지 못했어요. 새로고침 전에 백업해 주세요.');}}});
 setInterval(()=>{if(!document.hidden && today()!==lastDay && !dirty){lastDay=today();render();}},30000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden && today()!==lastDay && !dirty){lastDay=today();render();}});
 render();
}
