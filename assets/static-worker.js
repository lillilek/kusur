'use strict';
importScripts('search.js','static-search.js');
onmessage=({data})=>{
 try{postMessage({result:KusurCorpusSearch.search(data.docs,data.options)});}
 catch(e){postMessage({error:e.message});}
};
