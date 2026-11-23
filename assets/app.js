'use strict';
(()=>{
const {$,esc,field,mount,bindSearch,load,loadError}=KusurUI;
mount('dictionary');
let rows=[],results=[],shown=0,corpus=null;
const examples=id=>corpus?.examples[id]||[];
function entryHTML(r){
 const id=r.entry_id,ids=examples(id),html=rowHTML(r);
 return html.replace('<tr>',`<tr id="${esc(id)}">`).replace('</td>',`${ids.length?`<button class="dict-example-button" data-examples="${esc(id)}" aria-expanded="false">Корпусные примеры (${ids.length})</button>`:''}</td>`)+
 (ids.length?`<tr class="dictionary-examples" id="examples-${esc(id)}" hidden><td colspan="5"><div class="example-content"></div><a href="corpus.html?entry=${encodeURIComponent(id)}">Все примеры статьи в корпусе</a></td></tr>`:'');
}
function rowHTML(r){const cells=[];cells.push(field(r['cyrillic orthography'],'','lemma')+field(r['latin orthography'],'','latin')+field(r.variant,'Варианты'));cells.push(field(r.pos,'Часть речи')+field(r['glossing label'],'Глосса')+field(r.forms,'Формы'));cells.push([1,2].map(n=>(r[`meaning_${n}_rus`]||r[`meaning_${n}_eng`])?`<div class="group"><span class="number">${n}.</span>${field(r[`meaning_${n}_rus`])}${field(r[`meaning_${n}_eng`],'','translation')}</div>`:'').join(''));cells.push([1,2].map(n=>(r[`example_${n}_cyr`]||r[`example_${n}_rus`])?`<div class="group">${field(r[`example_${n}_cyr`])}${field(r[`example_${n}_rus`],'','translation')}</div>`:'').join(''));cells.push(field(r.comment,'Комментарий')+field(r['в лит.варианте'],'Литературный вариант')+field(r['происхождение'],'Происхождение')+field(r.sources,'Источники'));return '<tr>'+cells.map((v,i)=>`<td data-label="${['Слово','Грамматика','Значения','Примеры','Примечания и источники'][i]}">${v}</td>`).join('')+'</tr>';}
function append(){
 const batch=results.slice(shown,shown+150);$('rows').insertAdjacentHTML('beforeend',batch.map(id=>entryHTML(rows[id])).join(''));shown+=batch.length;
 $('more').hidden=shown>=results.length;$('shown').textContent=results.length?`Показано ${shown} из ${results.length}. Поиск охватывает весь словарь.`:'';
}
function anchor(){let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}if(!id)return;while(!$(id)&&shown<results.length)append();$(id)?.scrollIntoView({block:'center'});}
function render(ids){results=ids;shown=0;$('rows').innerHTML='';$('status').textContent=`Найдено ${ids.length} из ${rows.length} записей`;$('empty').hidden=ids.length!==0;append();anchor();}
$('more').onclick=append;
$('rows').addEventListener('click',e=>{const button=e.target.closest('[data-examples]');if(!button)return;const id=button.dataset.examples,row=$('examples-'+id);row.hidden=!row.hidden;button.setAttribute('aria-expanded',String(!row.hidden));if(!row.hidden&&!row.querySelector('.corpus-example')){const ids=new Set(examples(id).slice(0,3));row.querySelector('.example-content').innerHTML=corpus.texts.flatMap(t=>t.sentences.filter(s=>ids.has(s.id)).map(s=>CorpusRender.article({...s,textId:t.id,title:t.title},{},{actions:false,idPrefix:id+'-'}))).join('');}});
window.addEventListener('hashchange',()=>{if($('query').value){$('query').value='';$('query').dispatchEvent(new Event('input'));}else anchor();});
Promise.all([load('data/Kusur_dict.csv'),load('data/static-corpus.json','json').catch(()=>null)]).then(([text,data])=>{
 corpus=data;
 rows=KusurSearch.parseCSV(text);
 if(!rows.length||!('cyrillic orthography' in rows[0]))throw Error('Не найдены ожидаемые столбцы CSV');
 $('data-summary').textContent=`${rows.length} записей · исходные написания и примеры`;
 bindSearch(rows,'dictionary',render);
 const chars=new Set(['Ӏ','ӏ','\u0301']);for(const r of rows)for(const c of ((r['latin orthography']||'')+(r['cyrillic orthography']||'')).normalize('NFC'))if(/\p{L}/u.test(c)&&!/[a-zа-яё]/i.test(c))chars.add(c);SiteUI.keyboard($('query'),[],[...chars]);
}).catch(loadError);
})();
