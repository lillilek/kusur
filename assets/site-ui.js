/* Shared site identity and keyboard, adapted from lillilek/itelmen SiteUI. */
'use strict';
window.SiteUI=(()=>{
 const pages=[['dictionary','index.html','Словарь'],['texts','texts.html','Тексты'],['static-corpus','corpus.html','Корпус'],['glossary','glossary.html','Глоссы']];
 const brand=mode=>'<div class="brand-row"><div><p class="eyebrow">Аварский язык · словарь и корпус</p><h1>Кусурский диалект</h1></div><nav aria-label="Разделы сайта">'+pages.map(([id,url,title])=>`<a href="${url}" ${mode===id?'aria-current="page"':''}>${title}</a>`).join('')+'</nav></div>';
 function footer(){document.querySelector('footer').innerHTML='Кусурский диалект аварского языка · '+pages.map(([,url,title])=>`<a href="${url}">${title}</a>`).join(' · ');}
 function observe(){const header=document.getElementById('site-header');new ResizeObserver(()=>document.documentElement.style.setProperty('--header-height',header.offsetHeight+'px')).observe(header);}
 function keyboard(input,extra=[],characters=[]){
  const row=input.closest('.search-row'),toggle=document.createElement('button'),panel=document.createElement('div');
  toggle.type='button';toggle.textContent='Клавиатура';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','letter-panel');
  panel.id='letter-panel';panel.className='letter-panel';panel.hidden=true;row.append(toggle);row.after(panel);
  let target=input;
  for(const el of [input,...extra])el.addEventListener('focus',()=>{target=el;});
  // Symbols witnessed in current corpus/dictionary; stress is a combining mark.
  for(const letter of [...new Set(characters)].sort()){
   const button=document.createElement('button');button.type='button';button.textContent=/^\p{M}$/u.test(letter)?'◌'+letter:letter;
   button.setAttribute('aria-label','Вставить '+button.textContent);
   button.onmousedown=e=>e.preventDefault();button.onclick=()=>{target.focus();target.setRangeText(letter,target.selectionStart,target.selectionEnd,'end');target.dispatchEvent(new Event('input',{bubbles:true}));};panel.append(button);
  }
  toggle.onclick=()=>{panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));};
 }
 return {brand,footer,observe,keyboard};
})();
