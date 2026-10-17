/* Shared CSV parser and Unicode-aware search. No displayed data is modified. */
(function(root){
'use strict';
function parseCSV(text){
 text=text.replace(/^\uFEFF/,''); const rows=[];let row=[],cell='',quoted=false,closed=false;
 const endCell=()=>{row.push(cell);cell='';closed=false;};
 const endRow=()=>{endCell();rows.push(row);row=[];};
 for(let i=0;i<text.length;i++) {const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
  if(c===','){endCell();continue;}
  if(c==='\r'||c==='\n'){endRow();if(c==='\r'&&text[i+1]==='\n')i++;continue;}
  if(closed)throw Error('Недопустимый символ после кавычки в CSV');
  if(c==='"'){if(cell)throw Error('Кавычка внутри неэкранированного поля');quoted=true;}else cell+=c;
 }
 if(quoted)throw Error('Незакрытая кавычка в CSV');
 if(cell||row.length||closed)endRow();
 const headers=rows.shift()||[];
 return rows.map((r,i)=>{if(r.length!==headers.length)throw Error(`Строка ${i+2}: неверное число полей`);return Object.fromEntries(headers.map((h,j)=>[h,r[j]]));});
}
const DICT_FIELDS = [
 {id:'cyrillic',label:'Кириллица',keys:['cyrillic orthography'],word:true,default:true},
 {id:'latin',label:'Латиница',keys:['latin orthography'],word:true,default:true},
 {id:'variant',label:'Варианты',keys:['variant'],word:true,default:true},
 {id:'russian',label:'Значения RU',keys:['meaning_1_rus','meaning_2_rus'],default:true,ru:true},
 {id:'english',label:'Значения EN',keys:['meaning_1_eng','meaning_2_eng'],default:true},
 {id:'grammar',label:'Грамматика',keys:['pos','glossing label']},
 {id:'forms',label:'Формы',keys:['forms']},
 {id:'examples',label:'Примеры',keys:['example_1_cyr','example_1_rus','example_2_cyr','example_2_rus']},
 {id:'comment',label:'Примечания',keys:['comment']},
 {id:'literary',label:'Литературный вариант',keys:['в лит.варианте']},
 {id:'origin',label:'Происхождение',keys:['происхождение']},
 {id:'sources',label:'Источники',keys:['sources']}
];
const CORPUS_FIELDS = [
 {id:'latin',label:'Латиница',keys:['latin'],default:true},
 {id:'cyrillic',label:'Кириллица',keys:['cyrillic'],default:true},
 {id:'translation',label:'Перевод',keys:['translation'],default:true,ru:true},
 {id:'comment',label:'Примечания',keys:['comment'],default:true}
];
const fields = mode => mode==='dictionary'?DICT_FIELDS:CORPUS_FIELDS;
// Keep й distinct from и even when other combining diacritics are ignored.
function withoutMarks(value){return value.normalize('NFC').replace(/[йЙ]|[^йЙ]+/gu,part=>/^[йЙ]$/u.test(part)?part:part.normalize('NFD').replace(/\p{M}/gu,'')).normalize('NFC');}
const withoutStress=value=>value.normalize('NFD').replace(/[\u0300\u0301\u0340\u0341]/gu,'').normalize('NFC');
function plain(value,group,ignoreMarks=false){
 let s=String(value??'').normalize('NFC').toLocaleLowerCase('ru');
 s=ignoreMarks?withoutMarks(s):withoutStress(s);
 if(group.ru)s=s.replace(/ё/g,'е');
 if(group.word)s=s.replace(/[1Ӏӏ]/gu,'ӏ').replace(/[\p{Pd}()\[\]{}'’‘ʼʹ′＇`´]/gu,'');
 else if(group.id==='cyrillic')s=s.replace(/[1Ӏӏ]/gu,'ӏ');
 return s;
}
function prepare(rows,mode='dictionary'){
 const spec=fields(mode);
 return rows.map((row,index)=>({index,row,fileId:row.fileId,values:spec.map(group=>({id:group.id,word:!!group.word,items:group.keys.map(k=>String(row[k]??'')).filter(v=>v.length).map(value=>({plain:[plain(value,group,false),plain(value,group,true)],regex:[value.normalize('NFC'),withoutMarks(value)]}))}))}));
}
function search(index,query,{mode='dictionary',selected=fields(mode).filter(f=>f.default).map(f=>f.id),ignoreMarks=false,regex=false,fileId='*'}={}){
 const allowed=new Set(selected),active=fields(mode).filter(f=>allowed.has(f.id));
 const pool=index.filter(x=>fileId==='*'||x.fileId===fileId);
 if(!active.length)return [];
 if(query==='')return pool.map(x=>x.index);
 const variant=ignoreMarks?1:0;
 if(regex){
  // Do not normalize regex syntax, escapes, groups or character classes.
  const re=new RegExp(query.normalize('NFC'),'iu');
  return pool.filter(x=>x.values.some(g=>allowed.has(g.id)&&g.items.some(v=>re.test(v.regex[variant])))).map(x=>x.index);
 }
 query=query.trim();if(!query)return pool.map(x=>x.index);
 const queries=Object.fromEntries(active.map(g=>[g.id,plain(query,g,ignoreMarks)]));
 const buckets=[[],[],[],[]];
 for(const item of pool){let rank=4;
  for(const group of item.values){const q=queries[group.id];if(!q)continue;
   for(const value of group.items){const s=value.plain[variant];if(!s.includes(q))continue;
    const score=mode==='dictionary'&&group.word?(s===q?0:s.startsWith(q)?1:2):3;
    rank=Math.min(rank,score);
   }
  }
  if(rank<4)buckets[rank].push(item.index);
 }
 return buckets.flat();
}
root.KusurSearch={parseCSV,fields,plain,withoutMarks,withoutStress,prepare,search};
if(typeof module!=='undefined')module.exports=root.KusurSearch;
})(globalThis);
