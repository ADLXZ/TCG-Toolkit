import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const raw=await readFile(new URL('../src/tcg_toolkit/static/proxy-settings.js',import.meta.url),'utf8');
const source=raw.replace("import {apiRequest, isLocalFrontend, setDirectSearch} from './api.js';",'const apiRequest=(...args)=>globalThis.proxyTest.request(...args), isLocalFrontend=()=>globalThis.proxyTest.local, setDirectSearch=v=>globalThis.proxyTest.direct=v;');
const {createProxySettings}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
function setup(local,available) {
 const nodes={}; globalThis.document={getElementById:id=>nodes[id]??=( {addEventListener(k,f){this[k]=f;}, setAttribute(k,v){this[k]=v;}} )};
 globalThis.proxyTest={local,direct:false,request:async()=>({ok:true,json:async()=>({available})})};
 return {settings:createProxySettings(),nodes};
}
test('online frontend and disabled backend never expose the switch',async()=>{
 for(const [local,available] of [[false,true],[true,false]]) {
  const {settings,nodes}=setup(local,available); await settings.activate();
  assert.equal(nodes['proxy-settings'].hidden,true);assert.equal(proxyTest.direct,false);
 }
});
test('local switch button controls direct mode and resets on logout',async()=>{
 const {settings,nodes}=setup(true,true); await settings.activate();
 assert.equal(nodes['proxy-settings'].hidden,false);
 assert.equal(nodes['proxy-enabled']['aria-checked'],'true');
 nodes['proxy-enabled'].click();assert.equal(proxyTest.direct,true);assert.equal(nodes['proxy-enabled']['aria-checked'],'false');
 nodes['proxy-enabled'].click();assert.equal(proxyTest.direct,false);assert.equal(nodes['proxy-enabled']['aria-checked'],'true');
 nodes['proxy-enabled'].click();
 settings.clear();assert.equal(proxyTest.direct,false);assert.equal(nodes['proxy-settings'].hidden,true);assert.equal(nodes['proxy-enabled']['aria-checked'],'true');
});
test('old capability response cannot reveal controls after logout',async()=>{
 const {settings,nodes}=setup(true,true);let resolve;
 proxyTest.request=()=>new Promise(r=>resolve=r);
 const pending=settings.activate();settings.clear();resolve({ok:true,json:async()=>({available:true})});await pending;
 assert.equal(nodes['proxy-settings'].hidden,true);
});
