'use strict';
(function(root){
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const field=(value,label='',cls='')=>value?`<div class="field ${cls}">${label?`<span class="label">${label}</span>`:''}${esc(value)}</div>`:'';
function mount(mode){
 const spec=KusurSearch.fields(mode);
 $('site-header').innerHTML=`<div class="header-inner">
 <div class="brand-row"><div><p class="eyebrow">Аварский язык · словарь и корпус</p><h1>Кусурский диалект</h1></div><nav aria-label="Разделы сайта"><a href="index.html" ${mode==='dictionary'?'aria-current="page"':''}>Словарь</a><a href="texts.html" ${mode==='corpus'?'aria-current="page"':''}>Тексты</a><a href="corpus.html">Корпус</a></nav></div>
 <div class="search-row"><label class="sr-only" for="query">Поиск по выбранным столбцам</label><input id="query" type="search" autocomplete="off" spellcheck="false" placeholder="Поиск слова или значения — кириллицей, латиницей, по-русски или по-английски"><button id="clear" type="button">Очистить</button></div>
 <div class="filter-row"><span class="filter-title" id="field-label">Искать в:</span><div class="field-options" role="group" aria-labelledby="field-label">${spec.map(f=>`<label><input class="search-field" type="checkbox" value="${f.id}" ${f.default?'checked':''}> ${f.label}</label>`).join('')}</div><button class="small" id="select-all" type="button">Все</button><button class="small" id="select-none" type="button">Снять все</button></div>
 <div class="settings-row"><div class="settings"><label title="á = a, š = s; й и и остаются разными. Отображаемый текст не меняется."><input id="ignore-marks" type="checkbox"> Не учитывать диакритику</label><label><input id="regex" type="checkbox"> Регулярное выражение</label><button class="help-button" id="open-help" type="button" aria-haspopup="dialog" aria-label="Подсказки по поиску и регулярным выражениям">?</button></div><label class="scope"><span class="sr-only">Фильтр по тексту</span><select id="file-filter" ${mode==='dictionary'?'disabled aria-label="Область словаря"':''}><option value="*">${mode==='dictionary'?'Все записи словаря':'Все тексты'}</option></select></label></div>
 <div class="status-row"><span id="status" role="status" aria-live="polite">Загрузка…</span><a id="download" href="${mode==='dictionary'?'data/Kusur_dict.csv':'data/corpus.json'}" download>Скачать ${mode==='dictionary'?'CSV':'корпус'}</a></div></div>`;
 $('search-help').innerHTML=`<div class="dialog-heading"><h2>Поиск и регулярные выражения</h2><button id="close-help" type="button" aria-label="Закрыть подсказки">Закрыть</button></div>
 <p>Отмечайте столбцы, в которых нужно искать. Чтобы искать только в одном, нажмите «Снять все» и отметьте нужный. Если выбрано несколько, достаточно совпадения в любом из них. Снятие галочки не скрывает столбец в таблице.</p>
 <p>В обычном поиске регистр и ударения не учитываются. В русских значениях и переводе <b>ё = е</b>. В заголовках словаря также игнорируются дефисы, скобки и апострофы, <b>1 = Ӏ = ӏ</b>; буквы <b>ь, ъ, й</b> сохраняются.</p>
 <p>«Не учитывать диакритику» дополнительно приравнивает, например, <b>š / s</b> и <b>č / c</b>. Буквы <b>й / и</b> и специальные символы вроде <b>ʕ, ħ</b> остаются разными.</p>
 <h3>Как пользоваться регулярками</h3><p>Включите «Регулярное выражение» и вводите шаблон <b>без внешних /…/</b>. Регистр не учитывается. Шаблон применяется отдельно к каждой ячейке; в словаре результаты идут в исходном порядке.</p>
 <table class="help-table"><thead><tr><th>Шаблон</th><th>Что ищет</th></tr></thead><tbody>
 <tr><td><code>^б</code></td><td>Начало ячейки на б</td></tr><tr><td><code>зе$</code></td><td>Конец ячейки на зе</td></tr><tr><td><code>^дом$</code></td><td>Ячейку целиком: дом</td></tr><tr><td><code>б.*зе</code></td><td>б, затем любые символы и зе</td></tr><tr><td><code>(дом|house)</code></td><td>дом или house</td></tr><tr><td><code>[аоу]</code></td><td>Любую из букв а, о, у</td></tr><tr><td><code>[1Ӏӏ]</code></td><td>Цифру 1 или палочку</td></tr><tr><td><code>\\p{L}+</code></td><td>Одну или несколько букв любого алфавита</td></tr><tr><td><code>\\.</code></td><td>Буквальную точку</td></tr><tr><td><code>\\s+</code></td><td>Один или несколько пробельных символов</td></tr></tbody></table>
 <p>В режиме регулярных выражений дефисы, скобки, апострофы, ударения и палочка сохраняются. Если включено игнорирование диакритики, знаки снимаются <b>только с текста</b>: вводите шаблон без них (например, <code>s</code> для <code>š</code>). Сам шаблон не изменяется, чтобы сохранялся смысл скобок и других операторов.</p>
 <p><code>^</code> и <code>$</code> обозначают границы всей ячейки; <code>.</code> не включает перенос строки (для любых символов используйте <code>[\\s\\S]</code>). <code>\\b</code> ненадёжно для кириллицы: для отдельного слова можно использовать <code>(?&lt;!\\p{L})дом(?!\\p{L})</code>. Слишком долгий поиск автоматически останавливается.</p>`;
 $('open-help').onclick=()=>$('search-help').showModal();$('close-help').onclick=()=>$('search-help').close();
 $('search-help').addEventListener('click',e=>{if(e.target===$('search-help')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
 const resize=()=>document.documentElement.style.setProperty('--header-height',`${$('site-header').getBoundingClientRect().height}px`);
 if('ResizeObserver' in root)new ResizeObserver(resize).observe($('site-header'));else root.addEventListener('resize',resize);resize();
 return spec;
}
// Regex runs off the main thread. The worker is terminated on timeout or cancellation.
class SearchClient{
 constructor(rows,mode){this.rows=rows;this.mode=mode;this.serial=0;this.worker=null;this.pending=null;}
 cancel(){this.serial++;clearTimeout(this.timer);if(this.pending){this.pending.resolve(null);this.pending=null;this.worker?.terminate();this.worker=null;}}
 submit(query,options){
  this.cancel();const id=this.serial;
  return new Promise((resolve,reject)=>{
   this.pending={id,resolve,reject,query,options};
   if(!this.worker){
    this.ready=false;this.worker=new Worker('assets/search-worker.js?v=20261017');
    this.worker.onmessage=({data})=>{
     if(data.type==='ready'){this.ready=true;this.dispatch();return;}
     if(data.type==='initError'){this.fail(new Error(data.error));return;}
     if(!this.pending||data.id!==this.pending.id)return;
     clearTimeout(this.timer);const job=this.pending;this.pending=null;
     data.error?job.reject(new Error(data.error)):job.resolve(data.ids);
    };
    this.worker.onerror=()=>this.fail(new Error('Не удалось запустить поиск. Проверьте наличие assets/search-worker.js и assets/search.js.'));
    this.worker.postMessage({type:'init',rows:this.rows,mode:this.mode});
   }else if(this.ready)this.dispatch();
   this.timer=setTimeout(()=>this.fail(new Error('Поиск остановлен: обработка заняла слишком много времени. Упростите регулярное выражение или очистите запрос.')),2500);
  });
 }
 dispatch(){if(this.pending)this.worker.postMessage({type:'search',id:this.pending.id,query:this.pending.query,options:this.pending.options});}
 fail(error){clearTimeout(this.timer);this.worker?.terminate();this.worker=null;const job=this.pending;this.pending=null;job?.reject(error);}
}
function bindSearch(rows,mode,onResults){
 const client=new SearchClient(rows,mode);let timer,generation=0;
 const getOptions=()=>({mode,selected:[...document.querySelectorAll('.search-field:checked')].map(e=>e.value),ignoreMarks:$('ignore-marks').checked,regex:$('regex').checked,fileId:$('file-filter').value});
 const error=message=>{$('error').textContent=message;$('error').hidden=!message;$('query').setAttribute('aria-invalid',message?'true':'false');};
 async function run(){const mine=++generation;error('');const options=getOptions();$('status').textContent='Поиск…';try{const ids=await client.submit($('query').value,options);if(ids===null||mine!==generation)return;onResults(ids,options);if(!options.selected.length){$('status').textContent='Выберите хотя бы один столбец поиска.';}}catch(e){if(mine!==generation)return;onResults([],options);$('empty').hidden=true;error(e.message);$('status').textContent='Поиск не выполнен';}}
 const schedule=()=>{generation++;client.cancel();clearTimeout(timer);$('status').textContent='Поиск…';timer=setTimeout(run,150);};
 const immediate=()=>{clearTimeout(timer);run();};
 const clear=()=>{$('query').value='';immediate();$('query').focus();};
 $('query').addEventListener('input',schedule);$('clear').onclick=clear;$('reset').onclick=clear;
 document.querySelectorAll('.search-field').forEach(x=>x.addEventListener('change',immediate));
 ['ignore-marks','regex','file-filter'].forEach(id=>$(id).addEventListener('change',immediate));
 $('select-all').onclick=()=>{document.querySelectorAll('.search-field').forEach(x=>x.checked=true);immediate();};
 $('select-none').onclick=()=>{document.querySelectorAll('.search-field').forEach(x=>x.checked=false);immediate();};
 immediate();return client;
}
async function load(url,type='text'){
 const response=await fetch(url,{cache:'no-cache'});if(!response.ok)throw Error(`HTTP ${response.status}: ${url}`);return type==='json'?response.json():response.text();
}
function loadError(e){$('status').textContent='Не удалось загрузить данные';$('error').hidden=false;$('error').textContent=`${e.message}. Проверьте, что все файлы обновления загружены. Для просмотра на компьютере используйте локальный HTTP-сервер (см. README-UPDATE.md).`;}
root.KusurUI={$,esc,field,mount,bindSearch,load,loadError,SearchClient};
})(globalThis);
