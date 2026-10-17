'use strict';
(()=>{
const {$,esc,field,mount,bindSearch,load,loadError}=KusurUI;
mount('dictionary');
let rows=[],results=[],shown=0;
function rowHTML(r){const cells=[];cells.push(field(r['cyrillic orthography'],'','lemma')+field(r['latin orthography'],'','latin')+field(r.variant,'Варианты'));cells.push(field(r.pos,'Часть речи')+field(r['glossing label'],'Глосса')+field(r.forms,'Формы'));cells.push([1,2].map(n=>(r[`meaning_${n}_rus`]||r[`meaning_${n}_eng`])?`<div class="group"><span class="number">${n}.</span>${field(r[`meaning_${n}_rus`])}${field(r[`meaning_${n}_eng`],'','translation')}</div>`:'').join(''));cells.push([1,2].map(n=>(r[`example_${n}_cyr`]||r[`example_${n}_rus`])?`<div class="group">${field(r[`example_${n}_cyr`])}${field(r[`example_${n}_rus`],'','translation')}</div>`:'').join(''));cells.push(field(r.comment,'Комментарий')+field(r['в лит.варианте'],'Литературный вариант')+field(r['происхождение'],'Происхождение')+field(r.sources,'Источники'));return '<tr>'+cells.map((v,i)=>`<td data-label="${['Слово','Грамматика','Значения','Примеры','Примечания и источники'][i]}">${v}</td>`).join('')+'</tr>';}
function append(){
 const batch=results.slice(shown,shown+150);$('rows').insertAdjacentHTML('beforeend',batch.map(id=>rowHTML(rows[id])).join(''));shown+=batch.length;
 $('more').hidden=shown>=results.length;$('shown').textContent=results.length?`Показано ${shown} из ${results.length}. Поиск охватывает весь словарь.`:'';
}
function render(ids){results=ids;shown=0;$('rows').innerHTML='';$('status').textContent=`Найдено ${ids.length} из ${rows.length} записей`;$('empty').hidden=ids.length!==0;append();}
$('more').onclick=append;
load('data/Kusur_dict.csv').then(text=>{
 rows=KusurSearch.parseCSV(text);
 if(!rows.length||!('cyrillic orthography' in rows[0]))throw Error('Не найдены ожидаемые столбцы CSV');
 $('data-summary').textContent=`${rows.length} записей · исходные написания и примеры`;
 bindSearch(rows,'dictionary',render);
}).catch(loadError);
})();
