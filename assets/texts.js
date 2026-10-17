'use strict';
(()=>{
const {$,esc,mount,bindSearch,load,loadError}=KusurUI;
mount('corpus');
let rows=[],files=[],results=[],shown=0,lastFile=null,counts={};
function rowHTML(s){
 const info=`<div class="segment-info">${s.number} · ${esc(s.startLabel)}–${esc(s.endLabel)}</div>`;
 const note=s.review?'<div class="review" title="Границы перевода или примечания не полностью совпали с транскрипцией">Границы требуют проверки</div>':'';
 const kind=s.kind==='annotation'?'<div class="annotation-label">Примечание вне транскрипции</div>':'';
 return `<tr class="${s.kind==='annotation'?'annotation-row':''}">`+['latin','cyrillic','translation','comment'].map((key,i)=>`<td data-label="${['Латиница','Кириллица','Перевод','Примечания'][i]}">${i===0?info+kind:''}${s[key]?`<div class="corpus-value">${esc(s[key])}</div>`:s.latinMissing&&i===0?'<span class="missing">Нет в латинском источнике</span>':''}${i===3?note:''}</td>`).join('')+'</tr>';
}
function append(){
 let html='';const batch=results.slice(shown,shown+150);
 for(const id of batch){const s=rows[id];if(s.fileId!==lastFile){const f=files.find(f=>f.id===s.fileId);html+=`<tr class="file-heading"><td colspan="4">${esc(f.name)}<span>${counts[f.id]} из ${f.segments.length} строк</span></td></tr>`;lastFile=s.fileId;}html+=rowHTML(s);}
 $('rows').insertAdjacentHTML('beforeend',html);shown+=batch.length;$('more').hidden=shown>=results.length;$('shown').textContent=results.length?`Показано ${shown} из ${results.length} строк. Поиск охватывает все тексты.`:'';
}
function render(ids){results=ids;shown=0;lastFile=null;counts={};for(const id of ids)counts[rows[id].fileId]=(counts[rows[id].fileId]||0)+1;$('rows').innerHTML='';$('status').textContent=`Найдено ${ids.length} из ${rows.length} строк · текстов ${Object.keys(counts).length} из ${files.length}`;$('empty').hidden=ids.length!==0;append();}
$('more').onclick=append;
load('data/corpus.json','json').then(data=>{
 files=data.files;rows=files.flatMap(f=>f.segments.map(s=>({...s,fileId:f.id})));
 $('file-filter').innerHTML='<option value="*">Все тексты</option>'+files.map(f=>`<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('');
 $('data-summary').textContent=`${files.length} текстов · ${data.stats.transcribedSegments} сегмента · ${data.stats.annotationOnly} отдельных примечания`;
 bindSearch(rows,'corpus',render);
}).catch(loadError);
})();
