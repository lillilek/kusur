/* Static corpus search. Runs only in the worker (and Node unit tests).
 * Reuses KusurSearch normalization; offsets always refer to original NFC text.
 */
(function(root){
'use strict';
const fields=['w','s','l','f','g','p','r'];
function fold(text,field,o){
 if(o.regex)return o.marks?KusurSearch.withoutMarks(text):text.normalize('NFC');
 return KusurSearch.plain(text,{id:field,word:['w','s','l','f'].includes(field),ru:field==='r'},o.marks);
}
function mapped(raw,field,o){
 raw=raw.normalize('NFC');let text='',map=[];
 for(const m of raw.matchAll(/\P{M}\p{M}*|\p{M}/gu)){
  const piece=fold(m[0],field,o);text+=piece;
  for(let i=0;i<piece.length;i++)map.push([m.index,m.index+m[0].length]);
 }
 return {raw,text,map};
}
function spans(raw,field,query,o){
 if(!query)return null;
 const {text,map}=mapped(raw,field,o);let found=[],matched=false;
 const needle=fold(query,field,o);
 if(o.regex){
  const re=new RegExp(query.normalize('NFC'),'giu');
  for(const m of text.matchAll(re)){matched=true;if(m[0])found.push([m.index,m.index+m[0].length]);}
 }else if(needle){
  let from=0,at;
  while((at=text.indexOf(needle,from))!==-1){found.push([at,at+needle.length]);from=at+needle.length;matched=true;}
 }
 if(o.exact&&field==='g'){
  const start=text.match(/^[-=]*/)[0].length,end=text.length-text.match(/[-=]*$/)[0].length;
  found=found.filter(([a,b])=>a===start&&b===end);matched=found.length>0;
 }
 return matched?found.filter(([a,b])=>map[a]&&map[b-1]).map(([a,b])=>[map[a][0],map[b-1][1]]):null;
}
function alternatives(values,condition,field,o){
 if(!condition)return true;
 const opts={...o,regex:false};
 const terms=condition.split('|').map(s=>s.trim()).filter(Boolean), normalized=values.map(s=>fold(s,field,opts));
 const positive=terms.filter(s=>!s.startsWith('!')),negative=terms.filter(s=>s.startsWith('!')).map(s=>s.slice(1));
 return !negative.some(s=>normalized.includes(fold(s,field,opts)))&&(!positive.length||positive.some(s=>normalized.includes(fold(s,field,opts))));
}
function sequence(analysis,query,o){
 if(!query.trim())return true;
 const glosses=analysis.map(m=>m.g.replace(/^[-=]+|[-=]+$/g,''));
 let positions=new Set(Array.from({length:glosses.length+1},(_,i)=>i));
 for(const token of query.trim().split(/\s+/)){
  if(token==='*'){
   const min=Math.min(...positions);positions=new Set(Array.from({length:glosses.length+1},(_,i)=>i).filter(i=>i>=min));
  }else positions=new Set([...positions].filter(i=>i<glosses.length&&alternatives([glosses[i]],token,'g',o)).map(i=>i+1));
 }
 return positions.size>0;
}
function search(docs,o){
 const result=[],selected=new Set(o.fields||fields),a=o.advanced||{};
 if(o.regex&&o.q)new RegExp(o.q,'giu');
 const advanced=!!(a.aw||a.al||a.ap||a.af||a.ag||a.second);
 const low=Number(a.lo||0),high=Number(a.hi||0);
 if(!Number.isInteger(low)||!Number.isInteger(high)||low<0||high<low||high>10000)throw Error('Укажите целые расстояния: 0 ≤ от ≤ до ≤ 10000.');
 for(let i=0;i<docs.length;i++){
  const s=docs[i];if(o.text&&s.textId!==o.text)continue;
  if(o.entry&&!s.w.some(w=>w.a.some(an=>an.some(m=>m.entry===o.entry))))continue;
  const hits={};
  if(a.translation&&!fold(s.r,'r',{...o,regex:false}).includes(fold(a.translation,'r',{...o,regex:false})))continue;
  let accepted=[];
  if(advanced){
   const words=s.w.map((w,j)=>({w,j})).filter(x=>!x.w.punct);
   for(let x=0;x<words.length;x++){
    const {w,j}=words[x];
    if(!alternatives([w.f],a.aw,'w',o))continue;
    // All morphological constraints must hold in ONE alternative analysis.
    const sameAnalysis=an=>alternatives(w.p?[w.p]:an.map(m=>m.p||''),a.ap,'p',o)&&alternatives(an.map(m=>m.l),a.al,'l',o)&&alternatives(an.map(m=>m.f),a.af,'f',o)&&sequence(an,a.ag||'',o);
    if((a.ap||a.al||a.af||a.ag)&&!(w.a.length?w.a.some(sameAnalysis):sameAnalysis([])))continue;
    const other=a.second?words.filter(({w:v},y)=>y!==x&&(a.free||y>x)&&Math.abs(y-x)-1>=low&&Math.abs(y-x)-1<=high&&alternatives([v.f,...v.a.flat().map(m=>m.l)],a.second,'w',o)):[];
    if(a.second&&((a.role||'required')==='required'&&!other.length||a.role==='exclude'&&other.length))continue;
    accepted.push(j,...other.map(v=>v.j));
    if(a.al||a.af||a.ag){w.a.forEach((an,ai)=>{
     if(!sameAnalysis(an))return;
     an.forEach((m,mi)=>{for(const [field,condition] of [['l',a.al],['f',a.af],['g',a.ag]])if(condition)hits[field+j+'.'+ai+'.'+mi]=[[0,m[field].length]];});
    });}
   }
   if(!accepted.length)continue;
  }
  let simple=!o.q;
  function check(key,field,raw){
   if(!selected.has(field)||!o.q)return;
   const ranges=spans(raw,field,o.q,o);if(ranges!==null){hits[key]=ranges;simple=true;}
  }
  check('r','r',s.r);check('s','s',s.s);
  s.w.forEach((w,j)=>{
   check('w'+j,'w',w.f);check('p'+j,'p',w.p);
   w.a.forEach((an,ai)=>an.forEach((m,mi)=>{
    for(const field of ['f','g','l','p'])check(field+j+'.'+ai+'.'+mi,field,m[field]||'');
   }));
  });
  if(!selected.size||!simple)continue;
  for(const j of accepted)hits['w'+j]=[[0,s.w[j].f.length]];
  if(a.translation)hits.r=spans(s.r,'r',a.translation,{...o,regex:false})||[];
  if(o.entry)s.w.forEach((w,j)=>{if(w.a.some(an=>an.some(m=>m.entry===o.entry)))hits['w'+j]=[[0,w.f.length]];});
  result.push([i,hits]);
 }
 return result;
}
root.KusurCorpusSearch={search,spans,sequence,fold};
if(typeof module!=='undefined')module.exports=root.KusurCorpusSearch;
})(globalThis);
