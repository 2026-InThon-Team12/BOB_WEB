import {preCatalog,postCatalog} from './question-catalog.js';
import {diffDays,observationDates} from './domain.js';

export function validAnswer(spec,value) {
  if(!spec||!value||Object.values(value).filter(v=>v!==undefined).length!==1)return false;
  if(value.choice_code!==undefined)return !!spec.options?.some(o=>o.code===value.choice_code);
  if(value.number_value!==undefined)return spec.type==='INTEGER'&&Number.isInteger(value.number_value)&&value.number_value>=(spec.minimum??0)&&value.number_value<=(spec.maximum??30);
  if(value.text_value!==undefined)return spec.type==='TEXT'&&typeof value.text_value==='string'&&!!value.text_value.trim()&&value.text_value.length<=(spec.max_length??300);
  return !!(value.object_value&&spec.type==='OBJECT'&&spec.fields&&Object.keys(value.object_value).length===Object.keys(spec.fields).length&&Object.entries(spec.fields).every(([k,s])=>s.options?.some(o=>o.code===value.object_value[k])));
}
export function fallbackQuestion(item,date) {
  const post=item.status==='buy',days=observationDates(item),age=post?diffDays(item.decided,date):days.indexOf(date);
  const history=Object.entries(item.reflections||{}).filter(([k])=>k.startsWith(post?'post:':'pre:')&&k.slice(k.indexOf(':')+1)<date).map(([,q])=>q);
  const stages=post?age<=3?['IMMEDIATE']:age>=90?['LONG_TERM','USAGE']:age>=30?['VALUE','MOTIVE','USAGE']:['USAGE']:[['TRIGGER','NECESSITY','PREDICTION','VALUE','PERSISTENCE'][Math.max(0,age)%5]];
  const bank=(post?postCatalog:preCatalog).filter(t=>stages.includes(t.stage)&&!['WORK_VALUE','GOAL_DELAY','GOAL_TRADEOFF','VALUE_WORTH','USAGE_DAYS','NON_USE_REASON'].includes(t.code));
  const chosen=!post&&date===days.at(-1)?preCatalog.find(t=>t.code==='EXPECTED_USE_DAYS'):[...bank].sort((a,b)=>history.filter(q=>q.templateCode===a.code).length-history.filter(q=>q.templateCode===b.code).length)[0];
  return {text:chosen.wording.replace('{item}',item.name),templateCode:chosen.code,spec:structuredClone(chosen.spec),method:'TEMPLATE'};
}
export function remoteQuestion(row,date) {
  const known=[...preCatalog,...postCatalog].find(t=>t.code===row?.template_code);
  if(!known||row.question_date!==date||typeof row.question!=='string'||!row.question.trim()||row.question.length>300||!validSpec(row.answer_spec))throw Error('질문 응답을 확인하지 못했어요.');
  return {text:row.question,templateCode:row.template_code,spec:row.answer_spec,method:row.generation_method,reference:row.reference_text||''};
}
export function validSpec(spec) {
  if(!spec||!['CHOICE','INTEGER','TEXT','OBJECT','SCALE'].includes(spec.type))return false;
  if(spec.options&&(!Array.isArray(spec.options)||!spec.options.length||spec.options.length>20||!spec.options.every(o=>typeof o.code==='string'&&typeof o.label==='string')))return false;
  if(['CHOICE','SCALE'].includes(spec.type))return spec.options?.length>=2;
  if(spec.type==='INTEGER')return Number.isInteger(spec.minimum)&&Number.isInteger(spec.maximum)&&spec.minimum>=0&&spec.minimum<=spec.maximum&&spec.maximum<=1000000000000;
  if(spec.type==='TEXT')return spec.max_length===undefined||(Number.isInteger(spec.max_length)&&spec.max_length<=2000);
  return spec.type==='OBJECT'&&spec.fields&&Object.keys(spec.fields).length<=10&&Object.values(spec.fields).every(validSpec);
}
export function answerLabel(spec,value) {
  if(value.choice_code!==undefined)return spec.options.find(o=>o.code===value.choice_code)?.label||value.choice_code;
  if(value.number_value!==undefined)return `${value.number_value.toLocaleString('ko-KR')}${spec.unit==='KRW'?'원':spec.unit==='DAYS'?'일':''}`;
  if(value.text_value!==undefined)return value.text_value;
  return Object.entries(value.object_value).map(([k,v])=>`${({when:'시점',context:'상황'})[k]||k}: ${spec.fields[k].options.find(o=>o.code===v)?.label||v}`).join(' · ');
}
