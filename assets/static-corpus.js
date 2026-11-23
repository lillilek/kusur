/* Reader controls adapted from the Itelmen reader. */
'use strict';
(async()=>{
 const el=id=>document.getElementById(id),{esc,article,plain}=CorpusRender;
 const params=new URLSearchParams(location.search),entry=params.get('entry')||'';
 const labels={w:'Словоформа',s:'Строка',l:'Лемма',f:'Морфема',g:'Глосса',p:'Часть речи',r:'Перевод'};
 el('brand').outerHTML=SiteUI.brand('static-corpus');SiteUI.footer();SiteUI.observe();
 el('fields').innerHTML=Object.entries(labels).map(([key,label])=>`<label><input type="checkbox" value="${key}" checked>${label}</label>`).join('');
 const controls=['query','scope','marks','regex','exact','formsOn','glossOn','transOn','sentenceOn','mode','savedOnly','aw','al','ap','af','ag','second','translation','lo','hi','order','role'];
 let docs=[],found=[],shown=0,worker=null,timer=null,debounce=null,generation=0,saved=new Set();
 try{const stored=JSON.parse(localStorage.getItem('kusur-examples')||'[]');if(Array.isArray(stored))saved=new Set(stored);}catch{el('toast').textContent='Сохранённая подборка недоступна; можно создать новую.';}
 function setLayers(){for(const [id,cls] of [['formsOn','hide-morphs'],['glossOn','hide-glosses'],['transOn','hide-translation'],['sentenceOn','hide-sentence']])el('list').classList.toggle(cls,!el(id).checked);}
 function url(){const u=new URL('corpus.html',location.href);for(const id of controls){const c=el(id);if(id==='savedOnly')continue;u.searchParams.set(id,c.type==='checkbox'?Number(c.checked):c.value);}u.searchParams.set('fields',[...el('fields').querySelectorAll('input:checked')].map(c=>c.value).join(','));if(entry)u.searchParams.set('entry',entry);return u;}
 function append(){
  let last=shown?docs[found[shown-1][0]].textId:null,html='';
  for(const [i,hits] of found.slice(shown,shown+30)){const s=docs[i];if(s.textId!==last)html+=`<h2 class="results-title">${esc(s.title)}</h2>`;html+=article(s,hits,{mode:el('mode').value,saved:saved.has(s.id)});last=s.textId;shown++;}
  el('list').insertAdjacentHTML('beforeend',html);el('more').hidden=shown>=found.length;
 }
 function error(message){el('error').hidden=!message;el('error').textContent=message;el('query').setAttribute('aria-invalid',String(!!message));}
 function run(){
  clearTimeout(debounce);worker?.terminate();clearTimeout(timer);const gen=++generation;error('');setLayers();el('status').textContent='Поиск…';el('more').hidden=true;
  const advanced=Object.fromEntries(['aw','al','ap','af','ag','second','translation','lo','hi','role'].map(id=>[id,el(id).value.trim()]));advanced.free=el('order').value==='any';
  const options={q:el('query').value.trim(),fields:[...el('fields').querySelectorAll('input:checked')].map(c=>c.value),marks:el('marks').checked,regex:el('regex').checked,exact:el('exact').checked,text:el('scope').value,entry,advanced};
  try{worker=new Worker('assets/static-worker.js');}catch(e){error('Не удалось запустить поиск: '+e.message);return;}
  const fail=message=>{if(gen!==generation)return;clearTimeout(timer);worker?.terminate();found=[];shown=0;el('list').replaceChildren();error(message);el('status').textContent='Поиск не выполнен';};
  worker.onerror=()=>fail('Не удалось загрузить обработчик поиска. Перезагрузите страницу.');
  worker.onmessage=({data})=>{
   if(gen!==generation)return;clearTimeout(timer);worker.terminate();if(data.error){fail('Ошибка запроса: '+data.error);return;}
   found=data.result;if(el('savedOnly').checked)found=found.filter(([i])=>saved.has(docs[i].id));
   shown=0;el('list').replaceChildren();append();el('status').textContent=options.fields.length?`Найдено ${found.length} из ${docs.length} предложений`:'Выберите хотя бы одно поле поиска.';
   if(!params.has('embed')){const u=url();u.hash=location.hash;history.replaceState(null,'',u);}
   let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{id='';}
   if(id){while(!el(id)&&shown<found.length)append();if(el(id))el(id).scrollIntoView({block:'start'});else el('toast').textContent=docs.some(s=>s.id===id)?'Пример скрыт условиями запроса. Очистите запрос для просмотра.':'Пример по этой ссылке отсутствует в текущей выгрузке.';}
  };
  timer=setTimeout(()=>fail('Поиск остановлен: выражение выполняется слишком долго. Упростите его или нажмите «Очистить».'),3000);worker.postMessage({docs,options});
 }
 function schedule(){worker?.terminate();clearTimeout(timer);generation++;clearTimeout(debounce);debounce=setTimeout(run,140);}
 async function copy(text){try{await navigator.clipboard.writeText(text);el('toast').textContent='Скопировано.';}catch{el('toast').textContent='Браузер не разрешил копирование. Выделите текст или используйте выгрузку TSV.';}}
 el('list').onclick=async e=>{
  const button=e.target.closest('button');if(!button)return;const id=button.dataset.save||button.dataset.copy,s=docs.find(x=>x.id===id);if(!s)return;
  if(button.dataset.save){if(saved.has(id))saved.delete(id);else saved.add(id);try{localStorage.setItem('kusur-examples',JSON.stringify([...saved]));}catch{el('toast').textContent='Подборка доступна до закрытия страницы: браузер не разрешил сохранение.';}if(el('savedOnly').checked)run();else button.textContent=saved.has(id)?'Убрать из подборки':'В подборку';}
  else await copy(s.title+' · § '+s.n+'\n'+plain(s)+'\n'+new URL('corpus.html#'+encodeURIComponent(id),location.href).href);
 };
 el('more').onclick=append;
 el('clear').onclick=()=>{if(entry){location.href='corpus.html';return;}for(const id of ['query','aw','al','ap','af','ag','second','translation'])el(id).value='';el('scope').value='';el('savedOnly').checked=false;el('lo').value='0';el('hi').value='0';history.replaceState(null,'',location.pathname);run();};
 for(const id of ['all','none'])el(id).onclick=()=>{el('fields').querySelectorAll('input').forEach(c=>c.checked=id==='all');run();};
 el('share').onclick=()=>copy(url().href);
 el('download').onclick=()=>{
  const rows=[['Текст','Номер','Предложение','Разборы','Перевод','Ссылка'],...found.map(([i])=>{const s=docs[i];return [s.title,s.n,s.s,s.w.map(w=>w.a.map(a=>a.map(m=>m.f+' / '+m.g).join(' · ')).join(' || ')).join('   '),s.r,new URL('corpus.html#'+encodeURIComponent(s.id),location.href).href];})];
  const tsv=rows.map(row=>row.map(x=>{let v=String(x).replace(/[\t\r\n]/g,' ');return /^[=+@-]/.test(v)?"'"+v:v;}).join('\t')).join('\n');
  const link=document.createElement('a');link.href=URL.createObjectURL(new Blob(['\uFEFF'+tsv],{type:'text/tab-separated-values;charset=utf-8'}));link.download='kusur-examples.tsv';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
 };
 try{
  const response=await fetch('data/static-corpus.json',{cache:'no-cache'});if(!response.ok)throw Error('HTTP '+response.status);const data=await response.json();
  docs=data.texts.flatMap(t=>t.sentences.map(s=>({...s,textId:t.id,title:t.title})));for(const text of data.texts)el('scope').add(new Option(text.title,text.id));
  el('data-summary').textContent=`${data.stats.texts} текста · ${data.stats.sentences} предложений · ${data.stats.words} слов`;
  const characters=new Set(['Ӏ','ӏ','\u0301']);for(const s of docs)for(const w of s.w)for(const c of w.f.normalize('NFC'))if((/\p{L}|\p{M}/u.test(c)&&!/[a-zа-яё]/i.test(c))||/[ʼ’]/.test(c))characters.add(c);
  SiteUI.keyboard(el('query'),['aw','al','af','ag','second','translation'].map(el),[...characters]);
  for(const id of controls)if(params.has(id)){const c=el(id);if(c.type==='checkbox')c.checked=params.get(id)==='1';else c.value=params.get(id);}
  if(params.has('fields'))for(const c of el('fields').querySelectorAll('input'))c.checked=params.get('fields').split(',').includes(c.value);
  if(params.has('embed'))document.body.classList.add('embed');
  if(entry){el('entry-filter').hidden=false;el('entry-filter').innerHTML='Примеры словарной статьи · <a href="index.html#'+encodeURIComponent(entry)+'">Открыть статью</a> · <a href="corpus.html">Весь корпус</a>';}
  el('site-header').addEventListener('input',schedule);document.querySelector('.panel').addEventListener('input',schedule);window.addEventListener('hashchange',run);run();
 }catch(e){error('Не удалось загрузить корпус: '+e.message);el('status').textContent='Корпус недоступен';}
})();
