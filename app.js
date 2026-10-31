import { API_BASE, createApiClient, mapDrafts, productUrl } from './api.js';
import {dateKey,addDays,diffDays,latestBudget,freeLimit,isFreeExpense,fundingPlan,newFunding,replaceGoal,refreshGoals,observationDates,simulationEnd,simulationReady,reflectionKey,reflectionDue,reflectionAnswered,reflectionMetrics,localSummary,migrateWeb} from './domain.js';
import {importBackup,portableBackup} from './backup.js';
import {validAnswer,answerLabel,validSpec} from './questions.js';
import {createServices} from './sync.js';
/** @param {string} selector @returns {HTMLElement | null} */
const query = selector => document.querySelector(selector);
const KEY = 'bob.web.v1';
const categories = ['의류','디지털기기','가구/인테리어','생활용품','가전','취미','게임','뷰티','식품','기타'];
const reasons = ['SNS·광고를 보고','할인·한정 판매 때문에','추가 할인을 받으려고','스트레스·기분 전환','주변 사람이 가지고 있어서','실제로 필요해서','오래전부터 원해서','기타'];
const labels = {active:'시뮬레이션 중',buy:'Buy · 구매했어요',bye:'Bye · 보내줬어요'};
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won = n => Math.round(n).toLocaleString('ko-KR') + '원';
const day = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const today = () => dateKey();
const elapsed = start => Math.round((Date.parse(today())-Date.parse(start))/86400000);
export const duration = price => price <= 30000 ? 3 : price < 100000 ? 7 : 14;
export const payment = (sum,min,pct,shipping,free) => sum === 0 ? 0 : sum - (sum >= min ? Math.round(sum*pct/100) : 0) + (free > 0 && sum >= free ? 0 : shipping);
const fresh = () => ({version:2,items:[],goals:[],impulses:[],expenses:[],incomes:[],budgets:{},apiBase:API_BASE});
let dirty = false, lastDay = today();
let state = fresh(), warning = '', filter = 'active', pendingImport = null, aiDrafts = [];
const validAmount = x => Number.isSafeInteger(x) && x >= 0 && x <= 1000000000000;
export function validate(s) {
  if (!s || ![1,2].includes(s.version) || !['items','goals','impulses','expenses'].every(k => Array.isArray(s[k])) || !s.budgets || typeof s.budgets !== 'object') throw Error('BoB 웹 백업 파일이 아니에요.');
  if(s.incomes===undefined)s.incomes=[];
  if(!Array.isArray(s.incomes))throw Error('소득 기록 형식을 확인해 주세요.');
  for(const e of s.incomes)if(typeof e.id!=='string'||typeof e.name!=='string'||!e.name.trim()||!validAmount(e.amount)||e.amount===0||typeof e.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||day(new Date(e.date+'T12:00:00'))!==e.date)throw Error('소득 기록 형식을 확인해 주세요.');
  for(const i of s.items) if(typeof i.id !== 'string' || typeof i.name !== 'string' || !categories.includes(i.category) || !validAmount(i.price) || !['active','buy','bye'].includes(i.status) || !/^\d{4}-\d{2}-\d{2}$/.test(i.start) || !Number.isInteger(i.days) || i.days < 0 || i.days > 3650 || !Array.isArray(i.reasons) || !i.answers || typeof i.answers !== 'object' || !Object.values(i.answers).every(a=>['yes','no','unsure'].includes(a))) throw Error('물건 데이터 형식을 확인해 주세요.');
  for(const g of s.goals) if(typeof g.id !== 'string' || typeof g.name !== 'string' || !validAmount(g.price) || g.price === 0 || (g.base!==undefined&&!validAmount(g.base))||(g.image && !validGoalImage(g.image))||(g.url!==undefined&&(typeof g.url!=='string'||(g.url&&!safeUrl(g.url))))) throw Error('목표 데이터 형식이 잘못됐어요.');
  for(const e of [...s.expenses,...s.impulses]) if(typeof e.id !== 'string' || typeof e.name !== 'string' || !validAmount(e.amount) || typeof e.date !== 'string'||(e.decision!==undefined&&!['resisted','spent'].includes(e.decision))) throw Error('금액 기록 형식이 잘못됐어요.');
  for(const b of Object.values(s.budgets)) if(!['income','food','living','transport','saving'].every(k=>validAmount(b[k]))) throw Error('예산 데이터가 잘못됐어요.');
  const validDate = date => typeof date==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;
  for(const i of s.items){
    if(i.url&&(typeof i.url!=='string'||!safeUrl(i.url)))throw Error('상품 링크를 확인해 주세요.');
    if(!validDate(i.start)||i.endDate&&!validDate(i.endDate)||i.decided&&!validDate(i.decided)||i.saleEndsAt&&!validDate(i.saleEndsAt)||i.observationDates&&(!Array.isArray(i.observationDates)||i.observationDates.length!==i.days||!i.observationDates.every(validDate)||new Set(i.observationDates).size!==i.days))throw Error('관찰 날짜 형식을 확인해 주세요.');
    if(i.reflections&&typeof i.reflections!=='object')throw Error('답변 기록 형식을 확인해 주세요.');
    for(const [key,q] of Object.entries(i.reflections||{}))if(!/^(pre|post):/.test(key)||!validDate(key.slice(key.indexOf(':')+1))||typeof q.text!=='string'||!validSpec(q.spec)||(q.answer&&!validAnswer(q.spec,q.answer)))throw Error('질문과 답변 형식을 확인해 주세요.');
  }
  for(const g of s.goals)if(g.funding){const f=g.funding;if(!validDate(f.startsOn)||!['openingBalance','baselineSpent','reservedThisMonth'].every(k=>validAmount(f[k]))||['frozenBalance','frozenAllocated'].some(k=>f[k]!==undefined&&!validAmount(f[k]))||f.frozenOn&&!validDate(f.frozenOn))throw Error('목표 적립 기록을 확인해 주세요.');}
  for(const e of [...s.expenses,...s.impulses])if(!validDate(e.date))throw Error('금액 기록의 날짜를 확인해 주세요.');
  return s;
}
try { const raw = localStorage.getItem(KEY); if(raw) {const parsed=validate(JSON.parse(raw));state=migrateWeb(parsed,today());if(parsed.version===1){if(!localStorage.getItem(KEY+'.before-v2'))localStorage.setItem(KEY+'.before-v2',raw);localStorage.setItem(KEY,JSON.stringify(state));}} } catch { warning='저장된 데이터를 읽지 못했어요. 기존 데이터 보호를 위해 새 저장을 중지했어요. 설정에서 백업 파일로 복원해 주세요.'; }
let storageBlocked = !!warning;
function write(update) {
  if(storageBlocked) throw Error(warning);
  const next=structuredClone(state);update(next);refreshGoals(next,today());validate(next);
  try {localStorage.setItem(KEY,JSON.stringify(next));} catch {throw Error('저장 공간이 부족하거나 브라우저 저장이 차단됐어요. 백업 후 공간을 확보해 주세요.');}
  state=next;
}
function commit(update,message='저장했어요.') {write(update);render();if(message)notify(message);}
function notify(message) {const n=query('#bob-status'); if(n) {n.textContent=message; n.hidden=false;}}
export const savedTotal = data => data.items.filter(i=>i.status==='bye').reduce((s,i)=>s+i.price,0)+data.impulses.filter(i=>i.decision!=='spent'&&!i.cancelledAt).reduce((s,i)=>s+i.amount,0);
const saved = () => savedTotal(state);
const goalAmount = g => Math.min(g.price,fundingPlan(g,state,today()).saved);
const used = i => Object.values(i.answers).filter(a=>a==='yes').length;
export function simulationProgress(item,date=today()) {
 const dates=observationDates(item),current=dates.filter(d=>d<=date).length;
 return {current,finishedToday:dates.at(-1)===date&&(!!item.answers?.[date]||!!item.reflections?.['pre:'+date]?.answer)};
}
export const ready = (item,date=today()) => simulationReady(item,date);
const due = () => [...state.items].reverse().filter(i=>reflectionDue(i,today())&&!reflectionAnswered(i,today()));
const status = i => ready(i) ? '결과가 도착했어요' : labels[i.status];
const link = (route,text,cls='') => `<a class="${cls}" href="#/${route}">${text}</a>`;
/** @param {string|number} id */
const button = (text,action,id='',cls='') => `<button type="button" class="${cls}" data-action="${action}" data-id="${esc(id)}">${text}</button>`;
const empty = (title,text,route='WebAdd',cta='물건 등록하기') => `<div class="empty"><div class="empty-mark">BoB</div><h2>${title}</h2><p>${text}</p>${link(route,cta,'primary')}</div>`;
/** @param {string|number} value */
const field = (name,label,type='text',value='',extra='') => `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${type==='number'?'min="0" step="1" inputmode="numeric"':''} ${extra}></label>`;
const select = (name,label,values) => `<label>${label}<select name="${name}">${values.map(v=>`<option>${esc(v)}</option>`).join('')}</select></label>`;
const formEnd = text => `<p class="form-error" role="alert"></p><button class="primary" type="submit">${text}</button></form>`;
function rows(items) {return items.map(i=>`<a class="item-row" href="#/WebItem/${encodeURIComponent(i.id)}"><span class="item-icon" aria-hidden="true">${i.category==='의류'?'♧':i.category==='디지털기기'?'◉':'▧'}</span><span class="item-info"><strong>${esc(i.name)}</strong><small>${esc(i.category)} · ${esc(status(i))}</small></span><span><strong>${won(i.price)}</strong><small>${i.status==='active'?`${simulationProgress(i).current} / ${i.days}일`:esc(i.decided||'')}</small></span><span aria-hidden="true">↗</span></a>`).join('');}
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
 return observationDates(item).map(date=>({date,answer:item.answers[date]|| (item.reflections?.['pre:'+date]?.answer ? (item.reflections['pre:'+date].answer.choice_code==='UNSURE'?'unsure':'recorded'):'empty')}));
}
function simulationGrass(item) {
 const names={yes:'필요했어요',no:'필요 없었어요',unsure:'잘 모르겠어요',recorded:'답변했어요',empty:'미기록'};
 return `<div class="simulation-grass"><p class="grass-heading">하루 한 칸, 나의 기록 <span>${item.days}일</span></p><div class="grass-grid" role="list" aria-label="날짜별 필요 기록">${simulationCells(item).map(c=>`<span role="listitem" tabindex="0" class="grass-cell ${c.answer==='empty'?'unanswered':c.answer}" aria-label="${c.date} · ${names[c.answer]}"><span class="grass-tooltip">${c.date} · ${names[c.answer]}</span></span>`).join('')}</div><div class="grass-legend">${Object.entries(names).filter(([key])=>key!=='empty').map(([key,label])=>`<span><i class="grass-cell ${key}" aria-hidden="true"></i>${label}</span>`).join('')}</div></div>`;
}
function homeSelection() {
 const i=state.items.find(i=>i.id===selectedHomeItem);
 if(!i)return `<div class="calendar-balance"><h2>이번 달 자유 소비 잔액</h2><div class="balance-line"><strong class="big">${won(balance())}</strong>${link('WebBudget','가계부 열기 →','text-link')}</div><p>예산과 추가 소득에서 이번 달 자유 지출을 뺀 금액이에요.</p></div>${homeCalendar()}`;
 const days=Math.max(0,Math.min(elapsed(i.start),i.days));
 return `<div class="detail-close-row"><button type="button" class="detail-close" data-action="clear-home" aria-label="선택 해제" title="선택 해제">×</button></div><h2>${esc(i.name)}</h2><p>${esc(i.category)} · ${won(i.price)}</p>${simulationGrass(i)}<div class="home-records"><div><small>기록한 날</small><strong>${new Set([...Object.keys(i.answers),...Object.keys(i.reflections||{}).filter(k=>k.startsWith('pre:')&&i.reflections[k].answer).map(k=>k.slice(k.indexOf(':')+1))]).size}일</strong></div><div><small>${Object.keys(i.reflections||{}).length?'비교용 응답률':'필요했던 날'}</small><strong>${Object.keys(i.reflections||{}).length?Math.round(reflectionMetrics(i,today()).coverage*100)+'%':used(i)+'일'}</strong></div></div><p>${i.status!=='active'?'시뮬레이션을 마친 물건이에요.':ready(i)?'기다림이 끝났어요. 기록을 보고 결정해 보세요.':`앞으로 ${i.days-days}일, 필요한 순간을 기록해 봐요.`}</p>${link('WebItem/'+encodeURIComponent(i.id),ready(i)?'결과 확인하고 결정하기 →':'기록 자세히 보기 →','primary')}`;
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
let imageImports=[];
const categoryRequests=new WeakMap();
const categoryHint=(name='name')=>`<small class="category-hint" id="category-hint-${name}" role="status">이름을 입력하면 카테고리를 자동으로 추천해요.</small>`;
function cancelCategoryRecommendation(input) {
 clearTimeout(categoryRequests.get(input)?.timer);categoryRequests.delete(input);
}
function recommendCategory(input,composing=false) {
 if(!(input instanceof HTMLInputElement)||!/^name(?:-\d+)?$/.test(input.name)||!input.closest('#add-form'))return;
 cancelCategoryRecommendation(input);
 const form=input.form,category=/** @type {HTMLSelectElement} */(form.elements.namedItem(input.name.replace('name','category'))),hint=form.querySelector('#category-hint-'+input.name),name=input.value.trim();
 if(!category||!hint)return;
 hint.textContent='이름을 입력하면 카테고리를 자동으로 추천해요.';
 if(composing||name.length<2)return;
 const request={timer:0};categoryRequests.set(input,request);
 const current=()=>input.isConnected&&categoryRequests.get(input)===request&&input.value.trim()===name;
 request.timer=setTimeout(async()=>{
  if(!current())return;
  hint.textContent='카테고리를 추천하고 있어요…';
  try {
   const drafts=await aiRequest('/item-drafts',{name});
   if(!current())return;
   if(!drafts[0]||!categories.includes(drafts[0].category))throw Error('No category');
   category.value=drafts[0].category;
   hint.textContent=`${category.value} 카테고리를 추천했어요. 직접 바꿀 수 있어요.`;
  }catch{if(current())hint.textContent='자동 추천을 불러오지 못했어요. 카테고리를 직접 선택해 주세요.';}
 },600);
}
function registrationRows(){
 if(!aiDrafts.length)return `${field('name','물건 이름','text','','maxlength="120" required aria-describedby="category-hint-name"')}${field('price','가격 (원)','text','','inputmode="numeric" required')}${select('category','카테고리',categories)}${categoryHint()}${field('url','상품 링크 (선택)','url','','placeholder="https://"')}`;
 return `<p>등록할 물건을 선택하고 내용을 확인해 주세요. 한 번에 최대 20개를 등록해요.</p>${aiDrafts.map((d,n)=>`<fieldset class="draft-row"><legend><label><input type="checkbox" name="included" value="${n}" checked> 물건 ${n+1} 등록</label></legend>${field('name-'+n,'물건 이름','text',d.name,'maxlength="120" required aria-describedby="category-hint-name-'+n+'"')}${field('price-'+n,'가격 (원)','text',d.price,'inputmode="numeric" required')}<label>카테고리<select name="category-${n}">${categories.map(c=>`<option ${c===d.category?'selected':''}>${c}</option>`).join('')}</select></label>${categoryHint('name-'+n)}${field('url-'+n,'상품 링크 (선택)','url',d.source_url||'')}<label><input type="checkbox" name="needed" value="${n}" checked> 할인 없이도 필요한 물건</label></fieldset>`).join('')}`;
}
const registrationModes={image:'장바구니 이미지에서 추출하기',link:'상품 구매 링크로 등록하기',manual:'직접 입력하기'};
let registrationMode='',registrationBusy=false;
const registrationPanels=new Map();
function registrationForm(){return `<form id="add-form" novalidate>${registrationRows()}<fieldset><legend>왜 사고 싶어졌나요? <small>한 개 이상 선택 · 등록할 물건에 공통 적용</small></legend><div class="chips">${reasons.map(r=>`<label><input type="checkbox" name="reason" value="${esc(r)}"><span>${esc(r)}</span></label>`).join('')}</div></fieldset><div id="reason-other" hidden>${field('other','기타 이유','text','','maxlength="300"')}</div><div id="reason-deadline" hidden>${field('deadline','판매 마감일','date','','min="'+today()+'"')}<small>마감일까지 관찰해요. 오늘 마감이면 바로 결정할 수 있어요.</small></div><div id="registration-discount" hidden><h3>추가 할인, 정말 이득일까요?</h3>${!aiDrafts.length?'<label><input type="checkbox" name="needed" value="manual" checked> 할인 없이도 필요한 물건</label>':''}${field('discountMin','할인 최소 금액 (원)','text',30000,'inputmode="numeric"')}${select('discountUnit','할인 종류',['퍼센트','정액'])}${field('discountValue','할인 값 (% 또는 원)','text',10,'inputmode="numeric"')}${field('discountShipping','기본 배송비 (원)','text',3000,'inputmode="numeric"')}${field('discountFree','무료배송 기준 (원, 0이면 없음)','text',40000,'inputmode="numeric"')}${select('discountDecision','등록할 물건',['필요한 것만','전체'])}<p id="registration-comparison" aria-live="polite"></p></div><p>품목·구매 결정은 서버에 반영돼요. 매일 답변은 이 브라우저에 저장하고 결과 요약 시 서버에 전송해요.</p>${formEnd('확인한 물건 등록하기')}`;}
function imageImportStatus(){return imageImports.length?`<div id="image-import-status" role="status">${imageImports.map((entry,n)=>`<p>${esc(entry.file.name)} · ${entry.error?'분석 실패':entry.rows?'완료':'분석 대기'}${entry.error?button('다시 분석','retry-image',n):''}</p>`).join('')}</div>`:'';}
function registrationContent(){
 if(!registrationMode)return '';
 if(registrationMode==='manual'||aiDrafts.length)return `<section class="panel registration-screen"><h2 tabindex="-1">${registrationMode==='manual'?'물건 정보 직접 입력':'가져온 물건 확인'}</h2>${registrationMode!=='manual'?`<p>이름과 가격을 확인한 뒤 등록해 주세요.</p>${imageImportStatus()}${button('다시 가져오기','restart-import','','text-link')}`:''}${registrationForm()}</section>`;
 const image=registrationMode==='image';
 return `<section class="panel registration-screen"><h2 tabindex="-1">${image?'캡처에서 가져오기':'링크에서 가져오기'}</h2><p>${image?'장바구니 캡처를 여러 장 선택하면 물건을 한 번에 가져와요.':'상품 구매 링크를 붙여 넣으면 물건 정보를 가져와요.'}</p><form id="ai-form" novalidate>${image?field('image','장바구니 캡처 (최대 10장)','file','','multiple accept="image/png,image/jpeg,image/webp"'):field('url','상품 구매 링크','url','','placeholder="https://" required')}<p>${image?'각 이미지 최대 4MB · PNG, JPEG, WebP':'https로 시작하는 상품 구매 페이지를 입력해 주세요.'}<br>${image?'이미지를':'링크를'} AI 분석 서버로 보내요.</p>${formEnd(image?'캡처에서 물건 가져오기':'링크에서 물건 가져오기')}${imageImportStatus()}</section>`;
}
function setRegistrationBusy(busy){
 registrationBusy=busy;document.querySelectorAll('[data-action="registration-mode"], [data-action="restart-import"], [data-action="retry-image"]').forEach(b=>{if(b instanceof HTMLButtonElement)b.disabled=busy;});
}
function restoreRegistrationFields(form,data,previousDrafts){
 if(!form||!data)return;
 for(const input of form.elements){
  if(!(input instanceof HTMLInputElement||input instanceof HTMLSelectElement))continue;
  const match=input.name.match(/-(\d+)$/),row=match?Number(match[1]):['included','needed'].includes(input.name)?Number(input.value):null;
  const oldIndex=row===null?null:previousDrafts.indexOf(aiDrafts[row]);if(oldIndex===-1)continue;
  const name=match?input.name.replace(/-\d+$/,'-'+oldIndex):input.name;
  if(input instanceof HTMLInputElement&&input.type==='checkbox')input.checked=data.getAll(name).includes(row===null?input.value:String(oldIndex));
  else if(data.has(name))input.value=String(data.get(name));
 }
 refreshRegistration(form);
}
function switchRegistrationMode(mode){
 if(registrationBusy||mode===registrationMode||!registrationModes[mode])return;
 const content=query('#registration-content');
 if(content.firstElementChild)registrationPanels.set(registrationMode,{node:content.firstElementChild,drafts:aiDrafts,images:imageImports});
 registrationMode=mode;const saved=registrationPanels.get(mode);aiDrafts=saved?.drafts||[];imageImports=saved?.images||[];
 if(saved)content.replaceChildren(saved.node);else content.innerHTML=registrationContent();
 document.querySelectorAll('[data-action="registration-mode"]').forEach(b=>b.setAttribute('aria-pressed',String(b.getAttribute('data-id')===mode)));
 content.querySelector('h2')?.focus({preventScroll:true});
}
function add() {
 if(state.pendingRegistration)return `<section class="panel narrow"><h1>등록 결과를 확인해 주세요</h1><p>요청한 물건의 서버 저장 결과를 아직 확인하지 못했어요. 같은 요청으로 다시 확인하므로 중복 등록되지 않아요.</p><ul>${state.pendingRegistration.items.map(i=>`<li>${esc(i.name)} · ${won(i.price)}</li>`).join('')}</ul>${button('등록 결과 다시 확인','retry-registration','','primary')}${link('WebHome','홈으로','text-link')}</section>`;
 return `<div class="page-title compact-page-title registration-title"><div><span class="eyebrow">NEW SIMULATION</span><h1>물품 등록 방식 선택</h1><p>사고 싶은 물건, 편한 방법으로 올려 주세요.</p></div></div><div class="registration-layout"><section class="registration-methods"><div class="registration-options" role="group" aria-label="물품 등록 방식">${Object.entries(registrationModes).map(([mode,label])=>`<button type="button" data-action="registration-mode" data-id="${mode}" aria-controls="registration-content" aria-pressed="${registrationMode===mode}" ${registrationBusy?'disabled':''}><span>${label}</span><span aria-hidden="true">→</span></button>`).join('')}</div><small>등록 다음 날부터 가격에 따라<br>3일, 7일, 14일 동안 생각해 봐요.</small></section><div id="registration-content">${registrationContent()}</div></div>`;
}
function registrationInput(fd) {
 const selected=aiDrafts.length?fd.getAll('included').map(Number):[-1];
 if(!selected.length||selected.length>20)throw Error('등록할 물건을 1~20개 선택해 주세요.');
 const chosen=fd.getAll('reason').map(String);if(!chosen.length)throw Error('구매 이유를 하나 이상 선택해 주세요.');
 const other=String(fd.get('other')||'').trim(),deadline=String(fd.get('deadline')||'');
 if(chosen.includes('기타')&&(!other||other.length>300))throw Error('기타 이유를 1~300자로 입력해 주세요.');
 if(chosen.includes('할인·한정 판매 때문에')&&(!/^\d{4}-\d{2}-\d{2}$/.test(deadline)||deadline<today()))throw Error('오늘 이후의 판매 마감일을 선택해 주세요.');
 const items=selected.map(n=>{const suffix=n<0?'':'-'+n,name=String(fd.get('name'+suffix)||'').trim(),price=getNumber(fd,'price'+suffix,true),category=String(fd.get('category'+suffix)),rawUrl=String(fd.get('url'+suffix)||'').trim();if(!name||name.length>120||!categories.includes(category))throw Error('물건 이름과 카테고리를 확인해 주세요.');return {id:uid(),name,price,category,reasons:chosen,url:rawUrl?productUrl(rawUrl):'',source:n<0?'MANUAL':aiDrafts[n].source||'SCREENSHOT',reasonOtherText:chosen.includes('기타')?other:undefined,saleEndsAt:chosen.includes('할인·한정 판매 때문에')?deadline:undefined,createdAt:today(),start:addDays(today(),1),days:duration(price),status:'active',answers:{},reflections:{}};});
 let review;
 if(chosen.includes('추가 할인을 받으려고')){const unit=fd.get('discountUnit')==='정액'?'WON':'PCT',value=getNumber(fd,'discountValue'),free=getNumber(fd,'discountFree');if(unit==='PCT'&&value>100)throw Error('할인율은 100% 이하여야 해요.');const needed=fd.getAll('needed').map(String),indexes=selected.flatMap((n,index)=>needed.includes(n<0?'manual':String(n))?[index]:[]),decision=fd.get('discountDecision')==='전체'?'ALL':'NEEDED';if(!indexes.length&&decision==='NEEDED')throw Error('필요한 물건을 하나 이상 선택해 주세요.');review={rule:{minimum_amount:getNumber(fd,'discountMin'),unit,value,shipping_fee:getNumber(fd,'discountShipping'),free_shipping_enabled:free>0,free_shipping_minimum:free||null},needed_item_indexes:indexes,decision};}
 return {items,review};
}
function refreshRegistration(form) {
 const fd=new FormData(form),rs=fd.getAll('reason');
 query('#reason-other').hidden=!rs.includes('기타');query('#reason-deadline').hidden=!rs.includes('할인·한정 판매 때문에');query('#registration-discount').hidden=!rs.includes('추가 할인을 받으려고');
 if(rs.includes('추가 할인을 받으려고'))try{const {items,review}=registrationInput(fd),checkout=amount=>amount?Math.max(0,amount-(amount>=review.rule.minimum_amount?Math.min(amount,review.rule.unit==='PCT'?Math.round(amount*review.rule.value/100):review.rule.value):0))+(review.rule.free_shipping_enabled&&amount>=review.rule.free_shipping_minimum?0:review.rule.shipping_fee):0;const all=checkout(items.reduce((n,i)=>n+i.price,0)),needed=checkout(items.filter((_,n)=>review.needed_item_indexes.includes(n)).reduce((n,i)=>n+i.price,0));query('#registration-comparison').textContent=`필요한 것만 ${won(needed)} · 전체 ${won(all)}${all>needed?' · 전체를 사면 '+won(all-needed)+' 더 써요.':''}`;}catch{query('#registration-comparison').textContent='물건 정보와 할인 조건을 입력하면 결제액을 비교해요.';}
}
async function analyzeImages(indexes) {
 for(const n of indexes){const entry=imageImports[n];try{const body=new FormData();body.append('image',entry.file);entry.rows=(await aiRequest('/cart-extractions',body)).map(d=>({...d,source:'SCREENSHOT'}));entry.error='';}catch(e){entry.error=e.message;}}
 aiDrafts=imageImports.flatMap(entry=>entry.rows||[]);
}
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
let editingQuestion=null;
const currentReflection = () => {
 if(editingQuestion&&editingQuestion.key.slice(editingQuestion.key.indexOf(':')+1)!==today())editingQuestion=null;
 const item=editingQuestion?state.items.find(i=>i.id===editingQuestion.id):due()[0];
 if(!item)return null;
 const key=editingQuestion?.key||reflectionKey(item,today());
 return {item,key,question:item.reflections?.[key]};
};
function saveCurrentAnswer(value) {
 const entry=currentReflection();if(!entry?.question||!reflectionDue(entry.item,today())||entry.key.slice(entry.key.indexOf(':')+1)!==today()||!validAnswer(entry.question.spec,value))throw Error('오늘 질문의 답변을 확인해 주세요.');
 write(s=>{const i=s.items.find(i=>i.id===entry.item.id),q=i.reflections[entry.key];q.answer=value;q.label=answerLabel(q.spec,value);if(q.legacy)i.answers[today()]={YES:'yes',NO:'no',UNSURE:'unsure'}[value.choice_code];delete i.summary;});
 editingQuestion=null;answeredPage=0;render();query('.question-card')?.focus({preventScroll:true});
}
async function submitSwipe(id,answer) {
 const card=query('.swipe-card'),entry=currentReflection();
 if(swipeBusy||!card||entry?.item.id!==id)return;
 const code={yes:'YES',no:'NO',unsure:'UNSURE'}[answer];
 if(!entry.question?.spec.options?.some(o=>o.code===code))return;
 swipeBusy=true;
 try {const animation=card.animate([{transform:card.style.transform||'none',opacity:1},{transform:answer==='unsure'?'translateY(-500px)':`translateX(${answer==='yes'?500:-500}px)`,opacity:0}],{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:240,fill:'forwards'});await animation.finished;if(card.isConnected){try{saveCurrentAnswer({choice_code:code});}catch(e){animation.cancel();throw e;}}}
 catch(e){resetSwipe(card);notify(e.message);}finally{swipeBusy=false;swipeDrag=null;}
}
let answeredPage = 0;
export function answeredTodayPage(items, page=0, date=today()) {
 const answerLabels={yes:'필요했어요',no:'필요 없었어요',unsure:'잘 모르겠어요'};
 const answered=items.flatMap(i=>{const entries=Object.entries(i.reflections||{}).filter(([k,q])=>k.slice(k.indexOf(':')+1)===date&&q.answer);return entries.length?entries.map(([key,q])=>({item:i,key,label:q.label,...simulationProgress(i,date),finishedToday:key.startsWith('pre:')&&simulationProgress(i,date).finishedToday})):answerLabels[i.answers?.[date]]?[{item:i,key:'pre:'+date,label:answerLabels[i.answers[date]],...simulationProgress(i,date)}]:[];}).sort((a,b)=>Number(b.finishedToday)-Number(a.finishedToday));
 const pages=Math.max(1,Math.ceil(answered.length/5)),current=Math.max(0,Math.min(Math.trunc(page)||0,pages-1));
 const arrow=(direction,label,target,disabled)=>`<button type="button" class="answered-arrow" data-action="answered-page" data-id="${target}" aria-label="${label}" ${disabled?'disabled':''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${direction==='left'?'m15 4-8 8 8 8':'m9 4 8 8-8 8'}"/></svg></button>`;
 return `<div id="answered-today" class="answered-today">${answered.length?`<div class="answered-carousel ${pages>1?'has-pages':''}">${pages>1?arrow('left','오늘 답변 목록 이전 페이지',current-1,current===0):''}<ul class="answered-list" aria-label="오늘 답변한 물건">${answered.slice(current*5,current*5+5).map(({item:i,key,label,current:count,finishedToday})=>`<li><a href="#/WebItem/${encodeURIComponent(i.id)}"${finishedToday?' class="is-complete"':''}><span class="answered-item-name"><strong>${esc(i.name)}</strong><small>${esc(i.category)} · ${won(i.price)}</small></span><span class="answered-item-status"><span class="answered-badge ${i.answers[date]}">${esc(label)}</span>${key.startsWith('post:')?`<small>구매 후 ${diffDays(i.decided,date)+1}일째</small>`:`<span class="answered-progress"><span>${finishedToday?'완료 · ':''}${count} / ${i.days}일</span><progress value="${count}" max="${i.days}" aria-label="시뮬레이션 ${i.days}일 중 ${count}일째">${count} / ${i.days}일</progress></span>`}</span></a>${date===today()&&reflectionDue(i,date)?button('답변 수정','edit-answer',i.id+'|'+key,'answer-edit'):''}</li>`).join('')}</ul>${pages>1?arrow('right','오늘 답변 목록 다음 페이지',current+1,current===pages-1):''}</div><p id="answered-page-status" class="answered-page-status" tabindex="-1" aria-live="polite">오늘 답변한 물건 ${answered.length}개${pages>1?` · ${current+1} / ${pages} 페이지`:''}</p>`:'<p class="answered-none">오늘 답변한 물건이 아직 없어요.</p>'}</div>`;
}
function reflectionControls(q) {
 const spec=q.spec,answer=q.answer||{},options=spec.options||[];
 if(spec.type==='INTEGER')return `${field('number','내 답변 ('+(spec.unit==='KRW'?'원':'일')+')','text',answer.number_value??'',`inputmode="numeric" pattern="[0-9]*" placeholder="${spec.minimum}~${spec.maximum}"`)}<small>${spec.minimum}~${spec.maximum}${spec.unit==='KRW'?'원':'일'}로 입력해 주세요.</small>`;
 if(spec.type==='TEXT')return `<label>내 답변<textarea name="text" maxlength="${spec.max_length||300}" rows="4">${esc(answer.text_value||'')}</textarea></label>`;
 if(spec.type==='OBJECT')return Object.entries(spec.fields).map(([key,f])=>`<label>${key==='when'?'언제':'어떤 상황에서'}<select name="object-${esc(key)}" required><option value="">선택해 주세요</option>${f.options.map(o=>`<option value="${esc(o.code)}" ${answer.object_value?.[key]===o.code?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>`).join('');
 return `<fieldset class="reflection-choices"><legend class="sr-only">내 답변</legend>${options.map(o=>`<label><input type="radio" name="choice" value="${esc(o.code)}" ${answer.choice_code===o.code?'checked':''}><span>${esc(o.label)}</span></label>`).join('')}</fieldset>`;
}
function check() {
 const queue=due(),entry=currentReflection();
 if(!entry)return `<section class="check-complete"><div class="empty-mark" aria-hidden="true">BoB</div><h1>오늘의 질문을 모두 마쳤어요</h1><p>오늘 답변은 수정할 수 있어요. 내일 다시 필요한 순간을 돌아봐요.</p>${answeredTodayPage(state.items,answeredPage)}${link('WebHome','홈으로 돌아가기','primary')}</section>`;
 const {item:i,question:q}=entry;
 const header=`<div class="page-title"><div><span class="eyebrow">DAILY CHECK-IN</span><h1>오늘, 그 물건은 어땠나요?</h1><p>남은 질문 ${queue.length}개 · ${today()}</p></div>${link('WebHome','나중에 하기')}</div>`;
 if(!q)return header+`<section class="panel reflection-card" role="status"><h2>${esc(i.name)}</h2><p>오늘의 질문을 준비하고 있어요…</p>${button('다시 불러오기','retry-question',i.id)}</section>`;
 const swipe=q.spec.type==='CHOICE'&&['YES','NO','UNSURE'].every(c=>q.spec.options?.some(o=>o.code===c));
 return header+`<div class="swipe-experience"><section class="question-card reflection-card ${swipe?'swipe-card':''}" data-item-id="${esc(i.id)}" tabindex="0" aria-label="${esc(i.name)} 오늘의 질문"><span class="badge">${i.status==='buy'?'구매 후 '+(diffDays(i.decided,today())+1)+'일째':simulationProgress(i).current+' / '+i.days+'일'}</span><h2>${esc(i.name)}</h2><p class="reflection-prompt">${esc(q.text)}</p>${q.reference?`<small>${esc(q.reference)}</small>`:''}${q.method==='TEMPLATE'?'<small>기본 질문으로 돌아봐요.</small>':''}<form id="reflection-form" novalidate>${reflectionControls(q)}${!['CHOICE','OBJECT'].includes(q.spec.type)&&q.spec.options?.some(o=>o.code==='UNSURE')?'<button type="submit" name="unsure" value="UNSURE">잘 모르겠어요</button>':''}${formEnd(editingQuestion?'답변 수정':'답변 기록')}${editingQuestion?button('취소','cancel-answer-edit'):''}<span class="swipe-stamp" aria-hidden="true"></span>${swipe?'<small>좌: 아니에요 · 위: 모르겠어요 · 우: 맞아요<br>카드의 빈 공간을 밀거나 직접 선택해 주세요.</small>':''}</section></div>`;
}

function itemPage(id) {
 const i=state.items.find(i=>i.id===id);if(!i)return empty('물건을 찾을 수 없어요','삭제되었거나 주소가 잘못됐어요.','WebHome','홈으로');
 const summary=i.summary||localSummary(i,today()),records=Object.entries(i.reflections||{}).filter(([,q])=>q.answer).sort(([a],[b])=>b.slice(b.indexOf(':')+1).localeCompare(a.slice(a.indexOf(':')+1)));
 const canHold=ready(i)&&(!i.saleEndsAt||i.saleEndsAt>today());
 return `${link('WebHome','← 나의 물건','text-link')}<div class="page-title"><div><span class="eyebrow">${esc(status(i))}</span><h1>${esc(i.name)}</h1><p>${esc(i.category)} · ${won(i.price)} · ${i.remoteId?'서버에 연결된 물건':'이전 로컬 기록'}</p></div></div><div class="two-columns"><section class="panel"><h2>산 것처럼 지내 본 기록</h2><p>${esc(i.start)}부터 ${i.days}일 · ${esc(simulationEnd(i))}에 결과를 확인해요.</p>${simulationGrass(i)}${ready(i)||i.status!=='active'?`<section class="reflection-summary"><h3>나의 기록 요약</h3><p>${esc(summary.text)}</p>${!summary.eligible?'<small>응답률·예상 사용일수·구매 시점을 충족한 기록만 예상과 실제를 비교해요.</small>':''}${summary.method==='ERROR'?`<p class="form-error">AI 요약을 받지 못해 기본 요약을 보여드려요.</p>${button('AI 요약 다시 시도','retry-summary',id)}`:''}</section>`:''}<h3>등록한 이유</h3><p>${i.reasons.map(esc).join(' · ')}${i.reasonOtherText?' · '+esc(i.reasonOtherText):''}</p>${i.url?`<p><a class="text-link" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">상품 링크 열기 ↗</a></p>`:''}${i.saleEndsAt?`<p>판매 마감일 ${esc(i.saleEndsAt)}</p>`:''}${i.status==='active'?`<div class="actions">${button('Buy · 살게요','buy',id,'primary')}${canHold?button('7일 더 지켜볼게요','hold',id):''}${!i.remoteId||ready(i)?button('Bye · 안 살래요','bye',id):'<small>Bye는 시뮬레이션 종료 후 선택할 수 있어요.</small>'}${reflectionDue(i,today())?link('WebCheck','오늘의 질문 →','text-link'):''}</div>`:''}${i.status==='buy'?`<h3>구매 후 사용 점검</h3>${elapsed(i.decided)>=14?`<p>지난 14일 동안 얼마나 자주 썼나요?</p><div class="actions">${[[12,'거의 매일'],[7,'자주'],[2.5,'가끔'],[0,'한 번도 안 씀']].map(([n,t])=>button(t,'review-'+n,id,i.review===n?'selected':'')).join('')}</div>`:`<p>구매 후 ${Math.max(0,14-elapsed(i.decided))}일 뒤에 실제 사용을 기록해요.</p>`}${link('WebCheck','구매 후 오늘의 질문 →','text-link')}`:''}</section><aside class="panel"><h2>답변 기록</h2><div class="reflection-history">${records.map(([key,q])=>`<details><summary>${esc(key.slice(key.indexOf(':')+1))} · ${key.startsWith('post:')?'구매 후':'구매 전'}</summary><p>${esc(q.text)}</p><strong>${esc(q.label)}</strong></details>`).join('')||'<p>아직 상세 답변이 없어요. 이전의 필요 기록은 왼쪽에 보존돼요.</p>'}</div><p>삭제하면 이 브라우저의 물건과 연결 지출이 지워져요.${i.remoteId?' 서버의 등록 기록은 남습니다.':''}</p>${button('물건 삭제','delete-item',id,'danger')}</aside></div>`;
}
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
export function goalForecast(goal,data,spending=0,date=today()) {
 const before=fundingPlan(goal,data,date),after=fundingPlan(goal,data,date,spending);
 return {...before,daily:before.dailySaving,delay:before.eta&&after.eta?Math.max(0,diffDays(before.eta,after.eta)):null,etaIfBuy:after.eta};
}
export function recordGoalDecision(data, goalId, name, amount, decision, date=today()) {
 const goal=data.goals.find(g=>g.id===goalId&&g.active&&!g.achieved);
 if(!goal)throw Error('진행 중인 목표를 확인해 주세요.');
 if(!name.trim()||name.length>120||!validAmount(amount)||amount<=0||!['resisted','spent'].includes(decision))throw Error('상품 이름과 금액을 확인해 주세요.');
 const id=uid();data.impulses.push({id,goalId,name:name.trim(),amount,decision,date});
 if(decision==='spent')data.expenses.push({id:uid(),impulseId:id,name:name.trim(),amount,bucket:'자유 소비',date});
}
const goalDate = date => date?new Date(date+'T12:00:00').toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'}):'자유 소비 예산 설정 후 확인';
function goalDecisionValue(form) {
 const fd=new FormData(form),choice=String(fd.get('choice')??'');
 if(choice==='custom')return {name:String(fd.get('name')||'').trim(),amount:Number(fd.get('amount')||0)};
 return impulsePresets[Number(choice)]&&choice!==''?impulsePresets[Number(choice)]:{name:'',amount:0};
}
function goalImpact(g, name, amount) {
 if(!name||!validAmount(amount)||amount<=0)return '<p>지금 사려는 상품을 선택해 주세요.</p>';
 const forecast=goalForecast(g,state,amount);
 if(!forecast.daily)return `<p>남은 자유 소비 예산으로 예상 달성일을 계산해요. 예산이 부족하면 날짜를 추정하지 않아요.</p>${link('WebBudget','예산 확인하기 →','text-link')}`;
 return `<p><strong>${esc(name)}</strong>에 ${won(amount)}을 쓰면<br>목표 달성이 <strong class="delay-days">${forecast.delay===null?'예상하기 어려워져요':forecast.delay===0?'예상일이 같아요':forecast.delay.toLocaleString('ko-KR')+'일 늦어져요' }.</strong></p><div class="goal-date-comparison"><span>현재 예상 <strong>${goalDate(forecast.eta)}</strong></span><span aria-hidden="true">→</span><span>소비하면 <strong>${goalDate(forecast.etaIfBuy)}</strong></span></div><small>남은 자유 소비 예산·실제 지출·월별 일수 기준</small>`;
}
function goalDecisionCard(g) {
 if(g.achieved)return `<section class="panel goal-decision goal-celebration"><span class="eyebrow">GOAL ACHIEVED</span><h2>목표를 달성했어요!</h2><p>${esc(g.name)}을 진열장에 올렸어요.<br>다음으로 이루고 싶은 목표를 정해 볼까요?</p>${button('다음 목표 정하기','new-goal','','primary')}</section>`;
 const picked=impulsePresets[Number(goalChoice)],valid=goalChoice!==''&&!!picked;
 return `<section class="panel goal-decision"><h2>지금 뭘 사려고 하나요?</h2><form id="goal-decision-form" data-goal-id="${esc(g.id)}" novalidate><div class="goal-decision-content"><fieldset class="goal-choices"><legend class="sr-only">소비할 상품 선택</legend>${impulsePresets.map((p,i)=>`<label><input type="radio" name="choice" value="${i}" ${goalChoice===String(i)?'checked':''}><span>${esc(p.name)}<strong>${won(p.amount)}</strong></span></label>`).join('')}<label class="goal-custom-choice"><input type="radio" name="choice" value="custom" ${goalChoice==='custom'?'checked':''}><span>직접 입력</span></label></fieldset><div id="goal-custom-fields" class="goal-custom-fields" ${goalChoice==='custom'?'':'hidden'}>${field('name','상품 이름','text','','maxlength="120" placeholder="예: 마라탕"')}${field('amount','가격 (원)','number','','placeholder="0"')}</div><div id="goal-impact" class="goal-impact" aria-live="polite">${goalImpact(g,valid?picked.name:'',valid?picked.amount:0)}</div><p id="goal-decision-feedback" class="goal-decision-feedback" role="status" tabindex="-1">${esc(goalDecisionFeedback)}</p><p class="form-error" role="alert"></p></div><div class="goal-decision-actions"><button type="submit" class="primary" value="resisted" ${valid?'':'disabled'}>참을게요</button><button type="submit" value="spent" ${valid?'':'disabled'}>그래도 살래요</button></div></form></section>`;
}
function goalCurrent(g) {
 const amount=goalAmount(g),percent=Math.min(100,Math.floor(amount/g.price*100)),forecast=goalForecast(g,state);
 return `<div class="goal-active-panels"><section class="panel goal-current"><div class="goal-current-heading"><span class="eyebrow">${g.achieved?'달성한 목표':'현재 목표'}</span>${button(g.achieved?'새 목표':'목표 바꾸기','new-goal')}</div><div class="goal-current-product">${g.image?`<img src="${esc(g.image)}" alt="">`:''}<div><h2>${esc(g.name)}</h2>${g.url?`<a href="${esc(g.url)}" target="_blank" rel="noopener noreferrer">구매 링크 ↗</a>`:''}</div><strong>${percent}%</strong></div><progress aria-label="목표 달성률" value="${amount}" max="${g.price}">${percent}%</progress><div class="goal-current-amount"><strong>${won(amount)}</strong><span> / ${won(g.price)}</span></div><div class="goal-current-eta"><span>${g.achieved?'달성일':'예상 달성일'}</span><strong>${goalDate(g.achieved?g.achievedAt||today():forecast.eta)}</strong></div><details class="goal-current-editor"><summary>상품 이미지 변경</summary><div>${goalImageForm()}</div></details></section>${goalDecisionCard(g)}</div>`;
}
function goalCreateForm() {
 return `<section class="panel goal-create"><div class="goal-form-heading"><h2>새 목표 만들기</h2>${state.goals.some(g=>g.active)?button('취소','cancel-goal-create'):''}</div><form id="goal-form" novalidate>${field('name','목표 이름','text','','required')}${field('price','목표 금액 (원)','number','','required')}${field('url','구매 링크 (선택)','url','','placeholder="https://"')}${state.goals.some(g=>g.active&&!g.achieved)?`<details class="goal-carry"><summary>이전 목표 금액 이어 모으기</summary>${field('carry','이어 모을 금액 (원)','number',0)}</details>`:''}${field('image','상품 이미지 (선택)','file','','accept="image/png,image/jpeg,image/webp"')}<p>2MB 이하 · 이 브라우저에만 저장해요.</p>${formEnd('새 목표로 시작')}<p class="goal-create-note">남은 자유 소비 예산을 날짜에 맞춰 모아요. 참기·Bye는 행동 기록이며 적립금에 바로 더하지 않아요.</p></section>`;
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
 const spent=data.expenses.filter(e=>e.date.startsWith(period)&&isFreeExpense(e)).reduce((sum,e)=>sum+e.amount,0);
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
export function reportSummary(data,period='') {
 const registered=data.items.filter(i=>!period||(i.createdAt||i.start||'').startsWith(period));
 const byes=data.items.filter(i=>i.status==='bye'&&(!period||(i.decided||'').startsWith(period)));
 const resisted=data.impulses.filter(e=>e.decision!=='spent'&&!e.cancelledAt&&(!period||(e.date||'').startsWith(period)));
 const total=registered.length,bye=byes.length;
 // The donut describes the selected month's registered cohort; monthly Bye count is separate.
 const cohortBye=registered.filter(i=>i.status==='bye').length;
 return {total,bye,percent:total?cohortBye/total*100:0,saved:byes.reduce((n,i)=>n+i.price,0)+resisted.reduce((n,e)=>n+e.amount,0),reviewed:data.items.filter(i=>typeof i.review==='number'&&(!period||(i.reviewedAt||i.decided||'').startsWith(period))).length};
}
function reportOverview(data,period) {
 const summary=reportSummary(data,period),percent=summary.percent.toLocaleString('ko-KR',{maximumFractionDigits:1});
 return `<section class="panel report-overview" aria-label="소비 기록 요약"><figure class="report-bye-chart"><figcaption>선택한 달에 등록한 물건 중 Bye</figcaption><div class="report-donut"><svg viewBox="0 0 200 200" role="img" aria-label="선택한 달 등록 물건 ${summary.total}개의 Bye 비율 ${percent}%"><circle class="donut-track" cx="100" cy="100" r="78"/><circle class="donut-value" cx="100" cy="100" r="78" pathLength="100" stroke-dasharray="${summary.percent} 100" transform="rotate(-90 100 100)"/></svg><div class="donut-label" aria-hidden="true"><strong>${percent}<small>%</small></strong><span>Bye 비율</span></div></div><p>${summary.total?`선택한 달에 등록한 ${summary.total.toLocaleString('ko-KR')}개의 현재 선택이에요.`:'물건을 등록하면 Bye 비율을 볼 수 있어요.'}</p><div class="report-chart-legend" aria-hidden="true"><span><i class="bye"></i>Bye</span><span><i></i>진행 중 · Buy</span></div></figure><dl class="report-summary-values"><div><dt>Bye 한 물건</dt><dd>${summary.bye.toLocaleString('ko-KR')}<span>개</span></dd></div><div><dt>지킨 돈</dt><dd>${won(summary.saved)}</dd></div><div><dt>구매 후 점검</dt><dd>${summary.reviewed.toLocaleString('ko-KR')}<span>개</span></dd></div></dl></section>`;
}
let reportPage = 0;
export function usageComparison(item,date=today()) {
 const summary=item.summary||localSummary(item,date),m=reflectionMetrics(item,date);
 const expected=summary.eligible&&m.eligible&&summary.expectedDays!==null?Math.round(summary.expectedDays/30*14*10)/10:null;
 const actual=Number.isFinite(item.review)&&item.review>=0&&item.review<=14?item.review:null;
 const since=diffDays(item.decided,date);
 return {expected,actual,remaining:Number.isFinite(since)?Math.max(0,14-since):null};
}
export function purchaseReasons(items) {
 return reasons.map(reason=>{const matches=items.filter(i=>i.reasons.includes(reason));const bye=matches.filter(i=>i.status==='bye').length,decided=matches.filter(i=>i.status==='bye'||i.status==='buy').length;return {reason,items:matches,bye,decided,rate:decided?bye/decided:null};}).filter(r=>r.items.length).sort((a,b)=>(b.rate??-1)-(a.rate??-1)||b.items.length-a.items.length);
}
export function usageReport(items, page=0, date=today()) {
 const purchases=items.filter(i=>i.status==='buy'||Number.isFinite(i.review));
 const pages=Math.max(1,Math.ceil(purchases.length/3)),current=Math.max(0,Math.min(pages-1,page));
 const rows=purchases.slice(current*3,current*3+3).map(i=>{
  const {expected,actual,remaining}=usageComparison(i,date),difference=actual===null||expected===null?null:Math.round((actual-expected)*10)/10;
  const bar=(label,value,kind)=>`<div class="usage-bar"><span>${label}</span><div class="usage-track" aria-hidden="true"><i class="${kind}" style="width:${value/14*100}%"></i></div><strong>${value}일</strong></div>`;
  return `<article class="usage-item"><div class="usage-item-title">${link('WebItem/'+encodeURIComponent(i.id),esc(i.name))}<span>${esc(i.category)}</span></div>${expected===null?'<p class="usage-pending">예상 비교 제외 · 유효한 예상 사용일수와 충분한 답변이 필요해요.</p>':bar('예상',expected,'expected')}${actual!==null?`${bar('실제',actual,'actual')}<p class="usage-insight">${difference===null?'실제 사용 기록은 보존돼요.':difference===0?'예상한 만큼 사용했어요.':`생각했던 것보다 약 ${Math.abs(difference)}일 ${difference>0?'더':'적게'} 사용했어요.`}</p>`:`<div class="usage-pending"><span>실제 사용 · ${remaining===null?'점검 날짜 확인이 필요해요':remaining>0?`사용 점검까지 ${remaining}일`:'사용 점검할 시간이에요'}</span>${remaining===0?link('WebItem/'+encodeURIComponent(i.id),'실제 사용 기록하기 →','text-link'):''}</div>`}</article>`;
 }).join('');
 return `<div id="report-usage"><div class="usage-items">${rows||`<div class="report-no-data"><strong>구매 후의 이야기도 남겨 보세요.</strong><p>구매한 물건이 생기면 예상 사용과 실제 사용을 나란히 보여드려요.</p>${link('WebHome','나의 물건 보기 →','text-link')}</div>`}</div>${pages>1?`<nav class="report-pagination" aria-label="사용 비교 페이지"><button data-action="report-page" data-id="${current-1}" aria-label="이전 사용 비교 페이지" ${current===0?'disabled':''}>←</button><span id="report-page-status" role="status" tabindex="-1">${current+1} / ${pages}</span><button data-action="report-page" data-id="${current+1}" aria-label="다음 사용 비교 페이지" ${current===pages-1?'disabled':''}>→</button></nav>`:''}</div>`;
}
export function reasonsReport(items) {
 const groups=purchaseReasons(items),max=Math.max(1,...groups.map(g=>g.items.length));
 return groups.map(r=>`<details class="reason-breakdown"><summary><span class="reason-heading"><strong>${esc(r.reason)}</strong><span>${r.items.length}개 · ${r.rate===null?'결정 대기':`결정 ${r.decided}개 중 Bye ${Math.round(r.rate*100)}%`} <i aria-hidden="true">⌄</i></span></span><span class="reason-track" style="--reason-columns:${Math.min(max,20)}" aria-hidden="true">${r.items.map(i=>`<i class="reason-block${i.status==='bye'?' is-bye':''}" title="${esc(i.name)} · ${esc(labels[i.status])}"></i>`).join('')}</span></summary><ul>${r.items.map(i=>`<li>${link('WebItem/'+encodeURIComponent(i.id),`<span>${esc(i.name)}<small>${won(i.price)}</small></span><span class="reason-item-status">${esc(labels[i.status])} →</span>`)}</li>`).join('')}</ul></details>`).join('')||`<div class="report-no-data"><strong>어떤 마음으로 고른 물건인가요?</strong><p>물건을 등록할 때 구매 이유를 골라 주세요.</p>${link('WebAdd','물건 등록하기 →','text-link')}</div>`;
}
let reportMonth='';
function categoryReport(items){
 const groups=new Map();
 for(const i of items){const c=usageComparison(i);if(c.expected===null||c.actual===null)continue;const g=groups.get(i.category)||{expected:0,actual:0,count:0};g.expected+=c.expected;g.actual+=c.actual;g.count++;groups.set(i.category,g);}
 return groups.size?`<details class="category-comparison"><summary>분야별 예상과 실제</summary>${[...groups].map(([name,g])=>`<p><strong>${esc(name)}</strong> · ${g.count}개<br>예상 ${Math.round(g.expected*10)/10}일 / 실제 ${g.actual}일 · ${g.actual===0?(g.expected>0?'예상보다 적게 사용':'예상과 같음'):g.expected/g.actual>=2?'과대예측':g.expected/g.actual>=1.3?'예상보다 적게 사용':'거의 정확'}</p>`).join('')}</details>`:'';
}
function report() {
 const selected=reportMonth||month(),outside=state.expenses.filter(e=>(e.source||'manual')==='manual'&&!e.itemId&&!e.impulseId&&e.date.startsWith(selected)).reduce((n,e)=>n+e.amount,0);
 return `<div class="page-title compact-page-title"><div><span class="eyebrow">YOUR SPENDING STORY</span><h1>내 소비를 알아가는 중.</h1><p>기록이 쌓일수록, 나에게 필요한 것이 선명해져요.</p></div></div><nav class="report-month" aria-label="리포트 월">${button('←','report-month',-1)}<strong>${selected}</strong><button data-action="report-month" data-id="1" aria-label="다음 달" ${selected>=month()?'disabled':''}>→</button></nav>${reportOverview(state,selected)}<p>이번 달 직접 기록한 지출 ${won(outside)}</p><div class="two-columns report-details"><section class="panel report-usage-panel"><h2>생각보다 얼마나 썼나요?</h2><p class="report-description">구매 후 14일, 예상과 실제를 나란히.</p><div class="report-key"><span><i class="expected"></i>예상 사용</span><span><i class="actual"></i>실제 사용</span></div>${usageReport(state.items,reportPage)}${categoryReport(state.items)}<p class="report-method">예상은 마지막 질문의 30일 예상 사용일수를 14일로 환산해요. 유효 응답률 70% 이상이며 시뮬레이션 종료 전에 구매하지 않은 기록만 비교해요. 비교와 이유 분석은 전체 기간 기준이에요.</p></section><section class="panel report-reasons-panel"><h2>내 마음을 움직인 이유</h2><p class="report-description">결정한 물건 중 Bye 비율이 높은 이유부터.</p><div class="report-key"><span><i class="reason-all"></i>등록한 물건</span><span><i class="reason-bye"></i>그중 Bye</span></div>${reasonsReport(state.items)}<p class="report-method">한 블록은 물건 하나예요. 여러 이유를 고르면 각각에 포함돼요.<br>이유를 누르면 해당 물건을 볼 수 있어요.</p></section></div>`;
}
function discount() {return `<div class="page-title"><div><span class="eyebrow">DISCOUNT CHECK</span><h1>할인 받으려다 더 쓰나요?</h1><p>필요한 것만 샀을 때와 장바구니 전체 결제액을 비교해요.</p></div></div><section class="panel narrow"><form id="discount-form" novalidate>${field('needed','필요한 물건 합계 (원)','number','','required')}${field('extra','할인을 위해 추가한 물건 (원)','number',0,'required')}${field('min','할인 적용 최소 금액 (원)','number',30000,'required')}${field('pct','할인율 (%)','number',10,'max="100" required')}${field('shipping','배송비 (원)','number',3000,'required')}${field('free','무료배송 기준 (원, 0이면 없음)','number',40000,'required')}${formEnd('비교하기')}<div id="discount-result" aria-live="polite"></div></section>`;}
function settings() {return `<div class="page-title compact-page-title"><div><span class="eyebrow">YOUR DATA, YOUR DEVICE</span><h1>내 데이터와 설정</h1><p>예산·목표·매일 답변은 이 브라우저에 저장돼요. 브라우저 데이터를 지우기 전에 백업해 주세요.</p></div></div><section class="panel narrow"><h2>데이터 백업</h2><p>웹 백업과 BOB 앱 백업(v1~v4)을 가져올 수 있어요. 인증 정보는 백업에 포함하지 않아요. 기기 내부 파일 이미지는 다시 선택해 주세요.</p><div class="actions">${button('백업 파일 다운로드','export')}<label class="file-button">백업 복원<input id="import-file" type="file" accept="application/json,.json"></label></div><h2>AI 분석 서버</h2><p>새 물품·구매 결정·사용 점검은 서버와 연결돼요. 매일 답변은 이 브라우저에 보관하고 요약할 때만 전송해요. 예산과 목표는 로컬 저장해요.</p><form id="settings-form" novalidate>${field('apiBase','서버 주소','url',state.apiBase||'')}${formEnd('설정 저장')}<h2>저녁 8시 알림</h2><p>웹에서는 이 페이지가 열려 있을 때만 알림을 받을 수 있어요. 브라우저를 닫은 상태의 푸시는 아직 지원하지 않아요.</p>${button(state.reminders?'알림 끄기':'열려 있는 동안 알림 받기','toggle-reminder')}<h2>데이터 초기화</h2><p>이 브라우저의 모든 BoB 웹 기록을 삭제해요.</p>${button('모든 기록 삭제','reset','','danger')}</section>`;}
const routes={WebHome:['홈',home],WebAdd:['물건 등록',add],WebCheck:['오늘의 질문',check],WebGoals:['목표',goals],WebBudget:['가계부',wallet],WebReport:['리포트',report],WebDiscount:['할인 함정',discount],WebSettings:['설정',settings]};
const questionAttempts=new Set(),summaryAttempts=new Set();
function render() {
 dirty = false;
 refreshGoals(state,today());
 const app=query('#app'),landing=query('#landing');if(!app)return;
 const [route,id]=location.hash.replace(/^#\//,'').split('/');const isLanding=!route||route==='WebLanding'||!location.hash.startsWith('#/');if(landing)landing.hidden=!isLanding;app.hidden=isLanding;if(isLanding)return;
 const current=routes[route];document.title=`${current?.[0]||'물건 상세'} · BoB`;
 app.innerHTML=`<a class="skip" href="#bob-main">본문으로 이동</a><div class="app-shell"><aside class="sidebar">${link('WebLanding','<span class="brand-mark"><img class="brand-logo" src="bob-logo.png" alt="BoB" width="144" height="134"><span>Buy or Bye</span></span>','app-brand')}<nav aria-label="웹앱 메뉴">${Object.entries(routes).filter(([r])=>!['WebAdd','WebDiscount'].includes(r)).map(([r,[title]],n)=>`<a href="#/${r}" ${r===route?'aria-current="page"':''}><span aria-hidden="true">${['⌂','＋','◷','◎','▤','◇'][n]}</span>${title}</a>`).join('')}</nav><div class="sidebar-note">살까, 말까?<br>며칠만 산 것처럼.<small>기록은 이 브라우저에 저장돼요.</small></div></aside><main id="bob-main" tabindex="-1"><div id="bob-status" role="status" ${warning?'':'hidden'}>${esc(warning)}</div>${route==='WebItem'?itemPage(id||''):current?current[1]():empty('없는 페이지예요','메뉴에서 원하는 화면으로 이동해 주세요.','WebHome','홈으로')}</main></div><dialog id="bob-dialog" aria-labelledby="dialog-title"><h2 id="dialog-title"></h2><p id="dialog-description"></p><div class="actions"><button id="dialog-cancel">취소</button><button id="dialog-ok" class="primary">확인</button></div></dialog>`;
 if(route==='WebCheck'){
  const entry=currentReflection(),key=entry?.item.id+':'+entry?.key;
  if(entry&&!entry.question&&!questionAttempts.has(key)){questionAttempts.add(key);void services.question(entry.item.id).then(()=>{if(location.hash==='#/WebCheck'&&!dirty)render();}).catch(e=>notify(e.message));}
 }
 if(route==='WebItem'){
  const item=state.items.find(i=>i.id===id),key=id+':'+today();
  if(item&&ready(item)&&!summaryAttempts.has(key)){summaryAttempts.add(key);void services.summarize(id).then(()=>{if(location.hash==='#/WebItem/'+id&&!dirty)render();}).catch(e=>notify(e.message));}
 }

}
function confirmAction(title,description,action) {const dialog=/** @type {HTMLDialogElement} */(query('#bob-dialog'));dialog.querySelector('h2').textContent=title;dialog.querySelector('p').textContent=description;query('#dialog-cancel').onclick=()=>dialog.close();query('#dialog-ok').onclick=async()=>{const ok=query('#dialog-ok');ok.setAttribute('disabled','');try{await action();if(dialog.isConnected)dialog.close();}catch(e){if(dialog.isConnected){dialog.querySelector('p').textContent=e.message;ok.removeAttribute('disabled');}else notify(e.message);}};dialog.showModal();query('#dialog-ok').removeAttribute('disabled');query('#dialog-cancel').focus();}
function getNumber(fd,key,positive=false) {const raw=fd.get(key);const n=Number(raw);if(raw===null||String(raw).trim()===''||!validAmount(n)||(positive&&n===0))throw Error('금액을 0 이상의 정수로 입력해 주세요. 목표 금액은 0보다 커야 해요.');return n;}
function getName(fd) {const name=String(fd.get('name')||'').trim();if(!name||name.length>120)throw Error('이름을 1~120자로 입력해 주세요.');return name;}
const uid = () => crypto.randomUUID();
function safeUrl(value) {if(!value)return '';const u=new URL(value);if(!['http:','https:'].includes(u.protocol))throw Error('http 또는 https 링크를 입력해 주세요.');return u.href;}
const requestApi=createApiClient();
const services=createServices(()=>state,write,today,requestApi);
const aiRequest = async (path,body) => mapDrafts(await requestApi(path,body,state.apiBase||API_BASE,{existingResource:state.items.some(i=>i.remoteId)||!!state.pendingRegistration}));
if(typeof document!=='undefined') {
 document.addEventListener('input',event=>recommendCategory(event.target,event instanceof InputEvent&&event.isComposing));
 document.addEventListener('compositionstart',event=>recommendCategory(event.target,true));
 document.addEventListener('compositionend',event=>recommendCategory(event.target));
 document.addEventListener('change',event=>{
  const category=event.target;if(!(category instanceof HTMLSelectElement)||!category.closest('#add-form')||!/^category(?:-\d+)?$/.test(category.name))return;
  const input=category.form.elements.namedItem(category.name.replace('category','name'));cancelCategoryRecommendation(input);
  category.form.querySelector('#category-hint-'+category.name.replace('category','name')).textContent='직접 선택한 카테고리로 등록해요.';
 });
 document.addEventListener('submit',event=>{const form=event.target;if(form instanceof HTMLFormElement&&form.id==='add-form')form.querySelectorAll('input[name="name"],input[name^="name-"]').forEach(input=>{cancelCategoryRecommendation(input);const hint=form.querySelector('#category-hint-'+input.getAttribute('name'));if(hint)hint.textContent='선택한 카테고리로 등록해요.';});});
 document.addEventListener('input',event=>{if(event.target instanceof Element&&event.target.closest('#add-form'))refreshRegistration(event.target.closest('form'));});
 document.addEventListener('input',event=>{if(event.target instanceof Element && event.target.closest('#app form'))dirty=true;if(!(event.target instanceof HTMLInputElement))return;const form=event.target.closest('#goal-decision-form');if(!(form instanceof HTMLFormElement))return;if(event.target.name==='choice')goalChoice=event.target.value;query('#goal-custom-fields').hidden=goalChoice!=='custom';const g=state.goals.find(g=>g.id===form.dataset.goalId&&g.active&&!g.achieved);if(!g)return;const chosen=goalDecisionValue(form);query('#goal-impact').innerHTML=goalImpact(g,chosen.name,chosen.amount);query('#goal-decision-feedback').textContent='';form.querySelectorAll('button[type="submit"]').forEach(b=>{if(b instanceof HTMLButtonElement)b.disabled=!chosen.name||chosen.name.length>120||!validAmount(chosen.amount)||chosen.amount<=0;});});
 window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
 document.addEventListener('click',event=>{if(!(event.target instanceof Element))return;const skip=event.target.closest('a[href="#bob-main"]');if(skip){event.preventDefault();query('#bob-main')?.focus();return;}if(!dirty)return;const anchor=event.target.closest('a[href^="#/"]');if(!anchor||anchor.getAttribute('href')===location.hash)return;event.preventDefault();event.stopImmediatePropagation();confirmAction('입력 중인 내용을 버릴까요?','저장하지 않은 입력이 사라져요.',()=>{dirty=false;location.hash=anchor.getAttribute('href');});},true);
 document.addEventListener('submit',async event=>{const form=event.target;if(!(form instanceof HTMLFormElement)||!form.closest('#app'))return;event.preventDefault();const fd=new FormData(form),error=/** @type {HTMLElement} */(form.querySelector('.form-error')),submit=/** @type {HTMLButtonElement} */(form.querySelector('[type="submit"]'));error.textContent='';try {
  switch(form.id){
   case 'reflection-form':{const q=currentReflection()?.question;if(!q)throw Error('질문을 다시 확인해 주세요.');let value;if(event.submitter instanceof HTMLButtonElement&&event.submitter.value==='UNSURE')value={choice_code:'UNSURE'};else if(q.spec.type==='INTEGER'){const raw=String(fd.get('number')||'').trim();if(!/^\d+$/.test(raw))throw Error('숫자로 답변을 입력해 주세요.');value={number_value:Number(raw)};}else if(q.spec.type==='TEXT')value={text_value:String(fd.get('text')||'').trim()};else if(q.spec.type==='OBJECT')value={object_value:Object.fromEntries(Object.keys(q.spec.fields).map(k=>[k,String(fd.get('object-'+k)||'')]))};else value={choice_code:String(fd.get('choice')||'')};saveCurrentAnswer(value);break;}
   case 'add-form':{if(submit.disabled)return;const {items,review}=registrationInput(fd);submit.disabled=true;setRegistrationBusy(true);submit.textContent='등록 확인 중…';try{const saved=await services.register(items,review);aiDrafts=[];imageImports=[];registrationMode='';registrationPanels.clear();dirty=false;location.hash='#/WebItem/'+saved[0].id;}catch(e){if(state.pendingRegistration){render();notify(e.message);}else{submit.textContent='물건 등록';throw e;}}break;}
   case 'goal-form':{if(submit.disabled)return;const name=getName(fd),price=getNumber(fd,'price',true),url=safeUrl(String(fd.get('url')||'').trim());submit.disabled=true;const image=await readGoalImage(fd.get('image'));commit(s=>{replaceGoal(s,{id:uid(),name,price,image,url},today(),fd.has('carry')?getNumber(fd,'carry'):0);},'');goalCreating=false;goalChoice='1';goalDecisionFeedback='';render();break;}
   case 'goal-image-form':{if(submit.disabled)return;const id=state.goals.find(g=>g.active)?.id;submit.disabled=true;const image=await readGoalImage(fd.get('image'));if(!image)throw Error('저장할 이미지를 선택해 주세요.');commit(s=>{const g=s.goals.find(g=>g.id===id);if(!g)throw Error('목표를 찾지 못했어요.');g.image=image;});break;}
   case 'goal-decision-form':{const chosen=goalDecisionValue(form),decision=event.submitter instanceof HTMLButtonElement?event.submitter.value:'';const oldChoice=goalChoice;goalChoice='';try{commit(s=>recordGoalDecision(s,form.dataset.goalId,chosen.name,chosen.amount,decision),'');}catch(e){goalChoice=oldChoice;throw e;}if(state.goals.find(g=>g.id===form.dataset.goalId)?.achieved)goalPage=Math.floor((state.goals.filter(g=>g.achieved).length-1)/9);goalDecisionFeedback=decision==='resisted'?`${won(chosen.amount)}을 참았어요. 목표를 위한 예산을 지켰어요.`:`${won(chosen.amount)}을 가계부에 기록했어요.`;render();query('#goal-decision-feedback')?.focus({preventScroll:true});break;}
   case 'impulse-form':{const name=getName(fd),amount=getNumber(fd,'amount',true);commit(s=>s.impulses.push({id:uid(),name,amount,date:today()}));break;}
   case 'wallet-entry-form':{const name=getName(fd),amount=getNumber(fd,'amount',true),kind=String(fd.get('kind')),bucket=String(fd.get('bucket'));if(!['expense','income'].includes(kind)||(kind==='expense'&&!['자유 소비','식비','생활비','교통비'].includes(bucket)))throw Error('기록 유형과 항목을 확인해 주세요.');commit(s=>{const entry={id:uid(),name,amount,date:today()};if(kind==='income')s.incomes.push(entry);else s.expenses.push({...entry,bucket});},kind==='income'?'추가 소득을 기록했어요.':'지출을 기록했어요.');break;}
   case 'budget-form':{const b=Object.fromEntries(['income','food','living','transport','saving'].map(k=>[k,getNumber(fd,k)]));const wasEditing=budgetEditing;budgetEditing=false;try{commit(s=>s.budgets[month()]=b,'');}catch(e){budgetEditing=wasEditing;throw e;}query('#wallet-balance')?.focus({preventScroll:true});break;}
   case 'settings-form':{const base=safeUrl(String(fd.get('apiBase')||''));if(!base)throw Error('AI 서버 주소를 입력해 주세요.');commit(s=>{if(s.items.some(i=>i.remoteId)&&base!==s.apiBase)throw Error('서버에 연결된 물품이 있어 주소를 바꿀 수 없어요.');s.apiBase=base;});break;}
   case 'discount-form':{const n=Object.fromEntries(['needed','extra','min','pct','shipping','free'].map(k=>[k,getNumber(fd,k)]));if(n.pct>100)throw Error('할인율은 0~100% 사이로 입력해 주세요.');const all=payment(n.needed+n.extra,n.min,n.pct,n.shipping,n.free),needed=payment(n.needed,n.min,n.pct,n.shipping,n.free);query('#discount-result').innerHTML=`<h2>${all>needed?`할인 받으려다 ${won(all-needed)} 더 써요`:'필요한 소비인지 한 번 더 생각해 봐요'}</h2><p>필요한 것만: ${won(needed)}<br>모두 구매: ${won(all)}</p>`;break;}
   case 'ai-form':{const url=String(fd.get('url')||'').trim(),files=/** @type {File[]} */(fd.getAll('image').filter(f=>f instanceof File&&f.size));if(registrationMode==='image'&&!files.length)throw Error('장바구니 캡처를 선택해 주세요.');if(registrationMode==='link'&&!url)throw Error('상품 구매 링크를 입력해 주세요.');if(files.length>10)throw Error('이미지는 한 번에 최대 10장까지 분석해요.');for(const f of files)if(f.size>4000000||!['image/png','image/jpeg','image/webp'].includes(f.type))throw Error('4MB 이하의 PNG, JPEG, WebP 이미지를 골라 주세요.');submit.disabled=true;setRegistrationBusy(true);submit.textContent='분석 중…';if(url)aiDrafts=(await aiRequest('/product-url-drafts',{url:productUrl(url)})).map(d=>({...d,source:'URL'}));else{imageImports=files.map(file=>({file,rows:null,error:''}));await analyzeImages(files.map((_,n)=>n));}if(location.hash==='#/WebAdd'){render();dirty=true;query('#registration-content h2')?.focus({preventScroll:true});}break;}

  }
 }catch(e){error.textContent=e.name==='AbortError'?'분석 시간이 초과됐어요. 다시 시도해 주세요.':e.message;error.tabIndex=-1;error.focus();}finally{if(['ai-form','add-form'].includes(form.id))setRegistrationBusy(false);if(submit?.isConnected){submit.disabled=false;if(form.id==='ai-form')submit.textContent=registrationMode==='image'?'캡처에서 물건 가져오기':'링크에서 물건 가져오기';}}});
 document.addEventListener('click',event=>{if(!(event.target instanceof Element))return;const b=/** @type {HTMLElement} */(event.target.closest('[data-action]'));if(!b||!b.closest('#app'))return;const action=b.dataset.action,id=b.dataset.id,i=state.items.find(i=>i.id===id);try {
  if(action==='registration-mode')switchRegistrationMode(id);
  else if(action==='restart-import'){if(registrationBusy)return;const restart=()=>{aiDrafts=[];imageImports=[];registrationPanels.delete(registrationMode);render();dirty=registrationPanels.size>0;query('#registration-content h2')?.focus({preventScroll:true});};if(dirty)confirmAction('다시 가져올까요?','현재 확인 중인 물건 대신 새 이미지나 링크에서 가져와요.',restart);else restart();}
  else if(action==='retry-registration'){b.setAttribute('disabled','');void services.register([],null).then(saved=>{aiDrafts=[];imageImports=[];registrationMode='';registrationPanels.clear();location.hash='#/WebItem/'+saved[0].id;}).catch(e=>{b.removeAttribute('disabled');notify(e.message);});}
  else if(action==='retry-image'){if(registrationBusy)return;const previousDrafts=aiDrafts,form=/** @type {HTMLFormElement} */(query('#add-form')),data=form?new FormData(form):null;setRegistrationBusy(true);void analyzeImages([Number(id)]).then(()=>{if(location.hash==='#/WebAdd'){render();restoreRegistrationFields(query('#add-form'),data,previousDrafts);dirty=true;}}).catch(e=>notify(e.message)).finally(()=>setRegistrationBusy(false));}
  else if(action==='select-home'){selectedHomeItem=id;render();const selected=Array.from(document.querySelectorAll('button[data-action="select-home"]')).find(el=>el.getAttribute('data-id')===id);if(selected instanceof HTMLElement)selected.focus({preventScroll:true});}
  else if(action==='clear-home'){selectedHomeItem='';render();query('#home-detail').tabIndex=-1;query('#home-detail').focus({preventScroll:true});}
  else if(action==='draft'){const draft=aiDrafts[Number(id)];/** @type {HTMLInputElement} */(query('#add-form [name="name"]')).value=draft.name;/** @type {HTMLInputElement} */(query('#add-form [name="price"]')).value=draft.price;/** @type {HTMLInputElement} */(query('#add-form [name="url"]')).value=draft.source_url||'';/** @type {HTMLSelectElement} */(query('#add-form [name="category"]')).value=draft.category;dirty=true;}
  else if(action.startsWith('answer-')&&i)void submitSwipe(id,action.slice(7));
  else if(action==='report-month'){const d=new Date((reportMonth||month())+'-01T12:00:00');d.setMonth(d.getMonth()+Number(id));reportMonth=day(d).slice(0,7);reportPage=0;render();}
  else if(action==='report-page'){reportPage=Number(id);query('#report-usage').outerHTML=usageReport(state.items,reportPage);query('#report-page-status')?.focus({preventScroll:true});}
  else if(action==='answered-page'){answeredPage=Number(id);query('#answered-today').outerHTML=answeredTodayPage(state.items,answeredPage);query('#answered-page-status')?.focus({preventScroll:true});}
  else if(['buy','bye','hold'].includes(action)&&i&&i.status==='active'){confirmAction(action==='buy'?'이 물건을 구매할까요?':action==='bye'?'이 물건을 보내줄까요?':'7일 더 지켜볼까요?',action==='buy'?'가격이 자유 소비 지출에 기록돼요.':action==='bye'?'지킨 돈에 기록돼요. 목표 적립금에 바로 더하지는 않아요.':'내일부터 새 관찰일을 추가해요. 판매 마감일을 넘기지 않아요.',async()=>{await services.decide(id,action);render();});}
  else if(action.startsWith('review-')&&i?.status==='buy')void services.review(id,Number(action.slice(7))).then(()=>render()).catch(e=>notify(e.message));
  else if(action==='edit-answer'){
   const [itemId,key]=id.split('|'),item=state.items.find(i=>i.id===itemId);
   if(item&&!item.reflections?.[key]&&item.answers[today()])write(s=>{const i=s.items.find(i=>i.id===itemId);i.reflections ||= {};i.reflections[key]={text:'오늘 이 물건을 쓸 만한 순간이 있었나요?',legacy:true,spec:{type:'CHOICE',options:[{code:'NO',label:'필요 없었어요'},{code:'UNSURE',label:'잘 모르겠어요'},{code:'YES',label:'필요했어요'}]},answer:{choice_code:{yes:'YES',no:'NO',unsure:'UNSURE'}[i.answers[today()]]}};});
   editingQuestion={id:itemId,key};render();
  }
  else if(action==='cancel-answer-edit'){editingQuestion=null;render();}
  else if(action==='retry-question'){questionAttempts.delete(id+':'+reflectionKey(i,today()));render();}
  else if(action==='retry-summary')void services.summarize(id).then(()=>render()).catch(e=>notify(e.message));
  else if(action==='toggle-reminder'){if(state.reminders)commit(s=>s.reminders=false,'');else if(!('Notification' in window))notify('이 브라우저는 알림을 지원하지 않아요.');else void Notification.requestPermission().then(permission=>{if(permission==='granted')commit(s=>s.reminders=true,'');else notify('브라우저에서 알림 권한을 허용해 주세요.');});}
  else if(action==='remove-goal-image')commit(s=>{const g=s.goals.find(g=>g.id===id);if(g)delete g.image;});
  else if(action==='goal-page'){goalPage=Number(id);query('#cabinet-pages').outerHTML=goalCabinetPage(state.goals,goalPage);query('#cabinet-page-status')?.focus({preventScroll:true});}
  else if(action==='new-goal'){goalCreating=true;render();query('#goal-form input')?.focus({preventScroll:true});}
  else if(action==='cancel-goal-create'){goalCreating=false;render();}
  else if(action==='edit-budget'){budgetEditing=true;render();query('#budget-form input')?.focus({preventScroll:true});}
  else if(action==='cancel-budget-edit'){const cancel=()=>{budgetEditing=false;render();query('#wallet-balance')?.focus({preventScroll:true});};if(dirty)confirmAction('수정을 취소할까요?','저장한 예산은 유지되고 입력 중인 변경만 사라져요.',cancel);else cancel();}
  else if(action.startsWith('delete-'))confirmAction('이 기록을 삭제할까요?','삭제한 기록은 되돌릴 수 없어요. 관련 금액 집계에서도 제외돼요.',()=>{commit(s=>{if(action==='delete-item'){s.items=s.items.filter(i=>i.id!==id);s.expenses=s.expenses.filter(e=>e.itemId!==id);}else if(action==='delete-expense')s.expenses=s.expenses.filter(e=>e.id!==id);else if(action==='delete-income')s.incomes=s.incomes.filter(e=>e.id!==id);else s.impulses=s.impulses.filter(e=>e.id!==id);});if(action==='delete-item')location.hash='#/WebHome';});
  else if(action==='export'){const blob=new Blob([storageBlocked?localStorage.getItem(KEY)||'{}':JSON.stringify(portableBackup(state),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='BoB-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  else if(action==='reset')confirmAction('모든 기록을 삭제할까요?','물건, 답변, 목표, 가계부 기록이 모두 삭제돼요. 필요한 기록은 먼저 백업해 주세요.',()=>{for(const key of [KEY,KEY+'.before-v2',KEY+'.before-import'])localStorage.removeItem(key);questionAttempts.clear();summaryAttempts.clear();editingQuestion=null;state=fresh();storageBlocked=false;warning='';render();notify('모든 기록을 삭제했어요.');});
 }catch(e){notify(e.message);}});
 document.addEventListener('change',async event=>{if(event.target instanceof HTMLSelectElement&&event.target.id==='wallet-entry-kind'){const income=event.target.value==='income';query('#wallet-entry-label').textContent=income?'소득 내용':'지출 내용';query('#wallet-expense-category').hidden=income;const category=/** @type {HTMLSelectElement} */(query('#wallet-expense-category select'));category.disabled=income;query('#wallet-income-note').hidden=!income;query('#wallet-entry-form button[type=submit]').textContent=income?'소득 추가':'지출 추가';return;}if(event.target instanceof HTMLSelectElement&&event.target.id==='home-item-filter'){filter=event.target.value;selectedHomeItem='';render();query('#home-item-filter')?.focus({preventScroll:true});return;}if(!(event.target instanceof HTMLInputElement)||event.target.id!=='import-file')return;try{const file=event.target.files[0];if(!file)return;if(file.size>10000000)throw Error('10MB 이하의 백업 파일을 선택해 주세요.');pendingImport=validate(importBackup(JSON.parse(await file.text()),today()));confirmAction('백업으로 복원할까요?','현재 기록을 백업으로 교체해요. 이전 기록 사본을 보관하고, 복원된 물품은 로컬 기록으로 관리해요. 서버 연결과 기기 내부 이미지는 옮겨지지 않아요.',()=>{localStorage.setItem(KEY+'.before-import',JSON.stringify(state));localStorage.setItem(KEY,JSON.stringify(pendingImport));state=pendingImport;pendingImport=null;questionAttempts.clear();summaryAttempts.clear();editingQuestion=null;warning='';storageBlocked=false;render();notify('복원했어요.');});}catch(e){notify(e.message||'백업 파일을 읽지 못했어요.');}});
 document.addEventListener('pointerdown',event=>{
  if(swipeBusy||swipeDrag||!event.isPrimary||event.button!==0||!(event.target instanceof Element))return;
  if(event.target.closest('input,textarea,select,button,label,a'))return;const card=event.target.closest('.swipe-card');if(!(card instanceof HTMLElement))return;
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
  const stamp=drag.card.querySelector('.swipe-stamp');if(stamp)stamp.textContent=currentReflection()?.question?.spec.options?.find(o=>o.code===answer.toUpperCase())?.label||'';
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
 window.addEventListener('hashchange',()=>{if(location.hash!=='#/WebCheck')editingQuestion=null;render();if(location.hash.startsWith('#/')){window.scrollTo(0,0);query('#bob-main')?.focus();}});
 window.addEventListener('storage',event=>{if(event.key===KEY){try{state=event.newValue?validate(JSON.parse(event.newValue)):fresh();render();notify('다른 탭에서 변경한 기록을 반영했어요.');}catch{notify('다른 탭의 데이터를 읽지 못했어요. 새로고침 전에 백업해 주세요.');}}});
 setInterval(()=>{if(state.reminders&&'Notification' in window&&Notification.permission==='granted'&&Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',hourCycle:'h23'}).format(new Date()))>=20&&due().length&&state.remindedOn!==today()){try{new Notification('오늘의 돌아보기',{body:'답하지 않은 질문을 확인해 주세요.'});write(s=>s.remindedOn=today());}catch{ /* Browser notification permission can change while the tab is open. */ }}},30000);
 setInterval(()=>{if(!document.hidden && today()!==lastDay && !dirty){lastDay=today();render();}},30000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden && today()!==lastDay && !dirty){lastDay=today();render();}});
 render();
}
