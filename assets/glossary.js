'use strict';
(async()=>{
 const el=id=>document.getElementById(id),esc=CorpusRender.esc;el('brand').outerHTML=SiteUI.brand('glossary');SiteUI.footer();SiteUI.observe();
 let docs=[],worker,timer,serial=0;
 function run(){
  worker?.terminate();clearTimeout(timer);const generation=++serial;worker=new Worker('assets/static-worker.js');el('status').textContent='Поиск…';
  const fail=message=>{if(generation!==serial)return;clearTimeout(timer);worker.terminate();el('error').hidden=false;el('error').textContent=message;el('status').textContent='Поиск не выполнен';};
  worker.onerror=()=>fail('Не удалось запустить поиск.');
  worker.onmessage=({data})=>{if(generation!==serial)return;clearTimeout(timer);worker.terminate();if(data.error){fail(data.error);return;}el('error').hidden=true;el('rows').innerHTML=data.result.map(([i])=>`<tr><td data-label="Глосса"><a href="corpus.html?query=${encodeURIComponent(docs[i].label)}&fields=g&exact=1">${esc(docs[i].label)}</a></td><td data-label="Пояснение">${esc(docs[i].r||'—')}</td></tr>`).join('');el('status').textContent=`Найдено ${data.result.length} из ${docs.length}`;};
  timer=setTimeout(()=>fail('Поиск занял слишком много времени. Измените запрос.'),3000);
  worker.postMessage({docs,options:{q:el('query').value,fields:[...(el('label-field').checked?['g']:[]),...(el('explanation-field').checked?['r']:[])],advanced:{}}});
 }
 try{const response=await fetch('data/static-corpus.json',{cache:'no-cache'});if(!response.ok)throw Error('HTTP '+response.status);const data=await response.json();docs=data.glossary.map((row,i)=>({id:String(i),label:row['глосса'],r:row['пояснение'],s:'',w:[{f:'',p:'',a:[[{f:'',g:row['глосса'],l:''}]]}]}));
 el('query').oninput=run;for(const id of ['label-field','explanation-field'])el(id).onchange=run;el('clear').onclick=()=>{el('query').value='';run();};for(const id of ['all','none'])el(id).onclick=()=>{el('label-field').checked=el('explanation-field').checked=id==='all';run();};run();
 }catch(e){el('error').hidden=false;el('error').textContent='Не удалось загрузить глоссарий: '+e.message;}
})();
