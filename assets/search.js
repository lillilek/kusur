/* CSV state machine: quoted commas, escaped quotes, embedded CR/LF, BOM. */
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
const accent=s=>String(s??'').normalize('NFD').replace(/[\u0300\u0301\u0340\u0341]/gu,'').normalize('NFC').toLocaleLowerCase('ru');
const word=s=>accent(s).replace(/[1Ӏӏ]/gu,'ӏ').replace(/[\p{Pd}()\[\]{}'’‘ʼʹ′＇`´]/gu,'');
const meaning=s=>accent(s).replace(/ё/g,'е');
const wordFields=['cyrillic orthography','latin orthography','variant'];
const meaningFields=['meaning_1_rus','meaning_1_eng','meaning_2_rus','meaning_2_eng'];
const prepare=rows=>rows.map((row,index)=>({row,index,words:wordFields.map(k=>word(row[k])).filter(Boolean),meanings:meaningFields.map(k=>meaning(row[k])).filter(Boolean)}));
function search(index,query){query=query.trim();if(!query)return index;const w=word(query),m=meaning(query),groups=[[],[],[],[]];for(const item of index){let rank=-1;if(w){if(item.words.some(x=>x===w))rank=0;else if(item.words.some(x=>x.startsWith(w)))rank=1;else if(item.words.some(x=>x.includes(w)))rank=2;}if(rank<0&&m&&item.meanings.some(x=>x.includes(m)))rank=3;if(rank>=0)groups[rank].push(item);}return groups.flat();}
root.KusurSearch={parseCSV,word,meaning,prepare,search};
if(typeof module!=='undefined')module.exports=root.KusurSearch;
})(globalThis);
