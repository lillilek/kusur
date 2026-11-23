/* Run with PLAYWRIGHT_MODULE pointing at the installed playwright package. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),payload=JSON.parse(fs.readFileSync(path.join(root,'data/static-corpus.json'),'utf8'));
(async()=>{
 const server=http.createServer((req,res)=>{
  let relative;try{relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html';}catch{res.writeHead(400).end();return;}
  if(!/^(?:assets\/[^/]+\.(?:js|css)|data\/[^/]+\.(?:csv|json)|(?:index|texts|corpus|glossary)\.html)$/.test(relative)){res.writeHead(404).end();return;}
  fs.readFile(path.join(root,relative),(e,data)=>{res.writeHead(e?404:200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json'})[path.extname(relative)]||'text/plain; charset=utf-8'});res.end(e?'Not found':data);});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
  const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const settled=()=>page.waitForFunction(()=>document.getElementById('status')?.textContent.startsWith('Найдено'));
  for(const width of [1280,375]){
   await page.setViewportSize({width,height:950});
   for(const filename of ['corpus.html','index.html','texts.html','glossary.html']){
    await page.goto(origin+'/'+filename);await settled();
    assert.equal(await page.locator('nav a').count(),4);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),filename+' overflow '+width);
    if(filename==='corpus.html'){
     assert.equal(await page.locator('.corpus-example').count(),payload.stats.sentences);
     await page.screenshot({path:path.join(root,'.private','corpus-'+width+'.png'),fullPage:false});
    }
   }
  }
  await page.setViewportSize({width:1280,height:950});
  await page.goto(origin+'/corpus.html?query=AOR&fields=g&exact=1');await settled();
  assert(await page.locator('.morph-gloss mark').count()>0);
  const count=await page.locator('.corpus-example').count();assert(count>0&&count<payload.stats.sentences);
  const share=page.url();await page.reload();await settled();assert.equal(await page.locator('.corpus-example').count(),count);
  await page.getByText('Отображение и выгрузка',{exact:true}).click();
  await page.selectOption('#mode','kwic');await settled();await page.waitForSelector('.kwic-line');
  await page.selectOption('#mode','interlinear');await settled();
  await page.locator('[data-copy]').first().click();assert((await page.evaluate(()=>navigator.clipboard.readText())).includes('corpus.html#'));
  await page.locator('[data-save]').first().click();await page.check('#savedOnly');await settled();assert.equal(await page.locator('.corpus-example').count(),1);
  await page.reload();await settled();assert((await page.evaluate(()=>JSON.parse(localStorage.getItem('kusur-examples')))).length===1);
  await page.getByText('Отображение и выгрузка',{exact:true}).click();
  const download=page.waitForEvent('download');await page.click('#download');assert.equal((await download).suggestedFilename(),'kusur-examples.tsv');
  await page.locator('.sentence-heading a').nth(1).click();await settled();
  assert.equal(await page.inputValue('#query'),'');assert.equal(await page.inputValue('#ag'),'');
  assert(await page.locator('.corpus-example').count()>0);
  await page.goto(origin+'/corpus.html');await settled();
  await page.getByText('Клавиатура',{exact:true}).click();await page.fill('#query','ab');await page.locator('#query').evaluate(e=>e.setSelectionRange(1,1));
  const key=page.locator('#letter-panel button').filter({hasText:'ʕ'}).first();await key.click();assert.equal(await page.inputValue('#query'),'aʕb');
  await page.click('#clear');await settled();await page.check('#regex');await page.fill('#query','[');await page.waitForFunction(()=>!document.getElementById('error').hidden);assert((await page.locator('#error').innerText()).includes('Ошибка'));
  await page.click('#clear');await settled();assert.equal(await page.locator('.corpus-example').count(),16);
  const entry=Object.keys(payload.examples)[0];await page.goto(origin+'/index.html#'+entry);await settled();
  const row=page.locator('[id="'+entry+'"]');await row.locator('[data-examples]').click();const exampleRow=page.locator('[id="examples-'+entry+'"]');assert(await exampleRow.isVisible());assert.equal(await exampleRow.locator('td').getAttribute('colspan'),'5');
  await exampleRow.getByText('Все примеры статьи в корпусе').click();await settled();assert.equal(await page.locator('.corpus-example').count(),payload.examples[entry].length);
  const linked=page.locator('.word-details a[href*="'+entry+'"]').first();await linked.locator('..').locator('..').evaluate(e=>e.open=true);await linked.click();await settled();assert.equal(new URL(page.url()).hash,'#'+entry);
  await page.goto(origin+'/glossary.html');await settled();await page.fill('#query','AOR');await settled();await page.locator('#rows a').filter({hasText:/^AOR$/}).click();await settled();assert(await page.locator('.morph-gloss mark').count()>0);
  const long=structuredClone(payload);long.texts[0].sentences[0].w=Array.from({length:85},()=>structuredClone(payload.texts[0].sentences[0].w[0]));
  await page.route('**/data/static-corpus.json',r=>r.fulfill({json:long}));await page.goto(origin+'/corpus.html');await settled();
  await page.setViewportSize({width:375,height:950});await page.locator('.long-example summary').first().click();assert(await page.locator('.long-example').first().evaluate(e=>e.open));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.unroute('**/data/static-corpus.json');
  // Force a genuinely expensive regexp; ensure terminating a worker recovers the UI.
  const large=structuredClone(payload);large.texts[0].sentences[0].w[0].f='a'.repeat(36)+'!';
  await page.route('**/data/static-corpus.json',r=>r.fulfill({json:large}));
  await page.goto(origin+'/corpus.html');await settled();await page.check('#regex');await page.fill('#query','(a+)+$');
  await page.waitForFunction(()=>document.getElementById('error').textContent.includes('слишком долго'),{},{timeout:10000});
  await page.click('#clear');await settled();assert.equal(await page.locator('.corpus-example').count(),16);
  assert.deepEqual(errors,[]);
  console.log('PASS: 4 pages, desktop/mobile, highlights, URL, context, KWIC, clipboard, saved set, TSV, keyboard, dictionary links, glossary, invalid/slow regex recovery');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
