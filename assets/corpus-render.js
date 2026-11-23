'use strict';
window.CorpusRender=(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function mark(raw,spans=[]){
  const text=raw.normalize('NFC'),merged=[];
  for(const [a,b] of spans.filter(([a,b])=>b>a).sort((x,y)=>x[0]-y[0])){
   const last=merged.at(-1);if(last&&a<=last[1])last[1]=Math.max(b,last[1]);else merged.push([a,b]);
  }
  let at=0,out='';for(const [a,b] of merged){out+=esc(text.slice(at,a))+'<mark>'+esc(text.slice(a,b))+'</mark>';at=b;}return out+esc(text.slice(at));
 }
 function glossEdges(analysis,i){
  const form=analysis[i].f,previous=i?analysis[i-1].f:'';
  const left=form.match(/^[-=]+/)?.[0]||'',right=form.match(/[-=]+$/)?.[0]||'';
  return [left&&!(previous.endsWith('-')||previous.endsWith('='))?left:'',right];
 }
 function word(w,j,hits){
  const alternatives=w.a.map((analysis,ai)=>{
   const parts=analysis.map((m,mi)=>{
    const key=j+'.'+ai+'.'+mi,[left,right]=glossEdges(analysis,mi),gloss=mark(m.g,hits['g'+key]);
    const glossHTML=m.g==='?'?gloss:`<a href="corpus.html?query=${encodeURIComponent(m.g.replace(/^[-=]+|[-=]+$/g,''))}&fields=g&exact=1">${gloss}</a>`;
    return `<span class="morpheme"><span class="morph-form">${mark(m.f,hits['f'+key])}</span><span class="morph-gloss">${/^[-=]/.test(m.g)?'':esc(left)}${glossHTML}${/[-=]$/.test(m.g)?'':esc(right)}</span></span>`;
   }).join('');
   const lemma=analysis.map((m,mi)=>{const text=mark(m.l||'?',hits['l'+j+'.'+ai+'.'+mi]);return m.entry?`<a href="index.html#${encodeURIComponent(m.entry)}">${text}</a>`:text;}).join(' · ');
   const hasLemmaHit=analysis.some((_,mi)=>Object.hasOwn(hits,'l'+j+'.'+ai+'.'+mi)||Object.hasOwn(hits,'p'+j+'.'+ai+'.'+mi));
   const morphPOS=analysis.map((m,mi)=>m.p?mark(m.p,hits['p'+j+'.'+ai+'.'+mi]):'').filter(Boolean).join(' · ');
   return `<div class="analysis-variant">${w.a.length>1?`<span class="variant-label">Вариант ${ai+1}</span>`:''}<span class="parts">${parts}</span><details class="word-details" ${hasLemmaHit||hits['p'+j]?'open':''}><summary>Леммы и часть речи</summary><p>${lemma}</p><p>${mark(w.p||'?',hits['p'+j])}</p><p>${morphPOS}</p></details></div>`;
  }).join('');
  return `<div class="corpus-word"><b class="surface">${mark(w.f,hits['w'+j])}</b>${alternatives||(!w.punct?`<span class="parts"><span class="morpheme"><span class="morph-form">?</span><span class="morph-gloss">?</span></span></span><span class="word-details">${mark(w.p||'?',hits['p'+j])}</span>`:'')}</div>`;
 }
 function article(s,hits={},options={}){
  const words=s.w.map((w,j)=>word(w,j,hits)).join('');let content=`<div class="interlinear">${words}</div>`;
  if(options.mode==='kwic'){
   const indexes=s.w.map((_,j)=>j).filter(j=>Object.keys(hits).some(k=>new RegExp('^[wplgf]'+j+'(?:\\.|$)').test(k)));
   if(indexes.length)content=indexes.map(j=>`<div class="kwic-line"><span>${esc(s.w.slice(Math.max(0,j-6),j).map(w=>w.f).join(' '))}</span><mark>${esc(s.w[j].f)}</mark><span>${esc(s.w.slice(j+1,j+7).map(w=>w.f).join(' '))}</span></div>`).join('')+`<details><summary>Полный разбор</summary><div class="interlinear">${words}</div></details>`;
   else content='<p class="corpus-notice">Совпадение относится к строке предложения или переводу.</p>'+content;
  }
  if(s.w.length>60)content=`<details class="long-example" ${Object.keys(hits).length?'open':''}><summary>Разбор длинного примера (${s.w.length} токенов)</summary>${content}</details>`;
  const canonical='corpus.html#'+encodeURIComponent(s.id),context='corpus.html?scope='+encodeURIComponent(s.textId)+'#'+encodeURIComponent(s.id);
  return `<article class="corpus-example" id="${esc((options.idPrefix||'')+s.id)}"><div class="sentence-heading"><a href="${canonical}">§ ${esc(s.n)}</a><a href="${context}">Контекст в полном тексте</a></div><p class="sentence-line">${mark(s.s,hits.s)}</p>${content}<p class="translation-line">${mark(s.r||'Перевод отсутствует',hits.r)}</p>${options.actions===false?'':`<div class="example-actions"><button data-copy="${esc(s.id)}">Скопировать пример</button><button data-save="${esc(s.id)}">${options.saved?'Убрать из подборки':'В подборку'}</button></div>`}</article>`;
 }
 function plain(s){
  const layer=key=>s.w.map(w=>w.a.length?w.a.map(a=>a.map((m,i)=>{if(key!=='g')return m[key];const [left,right]=glossEdges(a,i);return (/^[-=]/.test(m.g)?'':left)+m.g+(/[-=]$/.test(m.g)?'':right);}).join('')).join(' / '):w.punct?w.f:'?').join(' ');
  return [s.s,layer('f'),layer('g'),s.r].join('\n');
 }
 return {esc,mark,article,plain};
})();
