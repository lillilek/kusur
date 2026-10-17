'use strict';
importScripts('search.js?v=20261017');
let index=[];
onmessage=({data})=>{
 if(data.type==='init'){
  try{index=KusurSearch.prepare(data.rows,data.mode);postMessage({type:'ready'});}
  catch(e){postMessage({type:'initError',error:e.message});}
  return;
 }
 if(data.type==='search'){
  try{postMessage({type:'result',id:data.id,ids:KusurSearch.search(index,data.query,data.options)});}
  catch(e){postMessage({type:'result',id:data.id,error:e.message});}
 }
};
