import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const publicFiles=new Set(['index.html','model-viewer.min.js','MODEL-VIEWER-LICENSE.txt','mascot-brown.glb','landing.css','landing.js','app.css','app.js','api.js','domain.js','questions.js','question-catalog.js','sync.js','backup.js','bob-logo.png','brand-0.png','brand-1.png']);
const endpoints=new Set(['/api/v1/guest-sessions','/api/v1/item-drafts','/api/v1/product-url-drafts','/api/v1/cart-extractions']);
createServer(async(req,res)=>{
 try {
  const pathname=new URL(req.url,'http://localhost').pathname;
  if((endpoints.has(pathname)&&req.method==='POST')||(pathname==='/api/v1/items/batch'&&req.method==='POST')||(/^\/api\/v1\/items\/[^/]+\/decision$/.test(pathname)&&req.method==='PUT')||(/^\/api\/v1\/purchases\/[^/]+\/review$/.test(pathname)&&req.method==='PUT')||(/^\/api\/v1\/(simulations|purchases)\/[^/]+\/local-question$/.test(pathname)&&req.method==='POST')||(/^\/api\/v1\/simulations\/[^/]+\/result-summary$/.test(pathname)&&req.method==='POST')) {
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>4100000){res.writeHead(413).end();return;}chunks.push(chunk);}
   const headers={};for(const key of ['content-type','authorization','idempotency-key'])if(req.headers[key])headers[key]=req.headers[key];
   const response=await fetch('https://bob-be.vercel.app'+pathname,{method:req.method,headers,body:Buffer.concat(chunks),signal:AbortSignal.timeout(110000)});
   res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')||'application/json','Cache-Control':'no-store'}).end(Buffer.from(await response.arrayBuffer()));return;
  }
  const name=pathname==='/'?'index.html':pathname.slice(1);
  if(!publicFiles.has(name)||!['GET','HEAD'].includes(req.method)){res.writeHead(404).end();return;}
  const data=await readFile(resolve(name));res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.glb':'model/gltf-binary'})[extname(name)]);res.end(req.method==='HEAD'?undefined:data);
 }catch{res.writeHead(502,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Backend connection failed'}));}
}).listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log('http://127.0.0.1:'+(process.env.PORT||4173)));
