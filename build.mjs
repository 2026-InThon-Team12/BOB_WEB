import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
for(const file of ['index.html','model-viewer.min.js','MODEL-VIEWER-LICENSE.txt','mascot-brown.glb','landing.css','landing.js','app.css','app.js','api.js','bob-logo.png','brand-0.png','brand-1.png']) await copyFile(file,`dist/${file}`);
console.log('Built dist/');
