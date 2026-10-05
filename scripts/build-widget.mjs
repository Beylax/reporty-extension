import { build } from 'vite';
import tailwind from '@tailwindcss/vite';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../apps/extension/',import.meta.url));
await build({logLevel:'error',configFile:false,root,plugins:[tailwind()],resolve:{alias:{'@':root}},oxc:{jsx:{runtime:'automatic'}},define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{outDir:fileURLToPath(new URL('../apps/web/public/widget/',import.meta.url)),emptyOutDir:true,lib:{entry:root+'widget/main.tsx',name:'ReportyWidget',formats:['iife'],fileName:()=> 'panel.js'}}});

// Lightweight bootstrap: React and panel styles load only while enabled.
await writeFile(new URL('../apps/web/public/widget/reporty.js',import.meta.url),`(()=>{const tag=document.currentScript,key=tag?.dataset.reporty,api=tag?new URL(tag.src).origin:'';if(!key)return;let loaded=false,busy=false;async function check(){if(loaded||busy)return;busy=true;try{const response=await fetch(api+'/api/widget?key='+encodeURIComponent(key),{credentials:'omit',cache:'no-store'});if(!response.ok)return;const config=await response.json();if(!config.enabled)return;loaded=true;const panel=document.createElement('script');panel.src=api+'/widget/panel.js';panel.dataset.reporty=key;panel.onerror=()=>{loaded=false;};document.head.append(panel);}catch{}finally{busy=false;}}check();setInterval(check,10000);})();`);
