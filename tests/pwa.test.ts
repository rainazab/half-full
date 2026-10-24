import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const sw = readFileSync("public/sw.js","utf8");
test("manifest has installable icons with real matching PNG dimensions",()=>{
  const manifest=JSON.parse(readFileSync("public/manifest.webmanifest","utf8"));
  assert.equal(manifest.display,"standalone"); assert.equal(manifest.start_url,"/"); assert.equal(manifest.scope,"/");
  assert.ok(manifest.name && manifest.short_name && manifest.id);
  for(const icon of manifest.icons){const png=readFileSync(`public${icon.src}`);const [width,height]=icon.sizes.split('x').map(Number);assert.equal(png.readUInt32BE(16),width);assert.equal(png.readUInt32BE(20),height);}
  assert.ok(manifest.icons.some((icon:{purpose:string})=>icon.purpose==='maskable'));
});
function harness(fetcher:typeof fetch=fetch){
  const listeners:Record<string,(event:any)=>void>={};
  const cached:string[]=[];const removed:string[]=[];
  const context={URL,Response,AbortController,setTimeout,clearTimeout,fetch:fetcher,
    self:{location:{origin:'https://us.example'},addEventListener:(name:string,fn:(event:any)=>void)=>{listeners[name]=fn;},skipWaiting:async()=>{},clients:{claim:async()=>{}}},
    caches:{open:async()=>({addAll:async(items:string[])=>{cached.push(...items);}}),match:async()=>new Response('Offline fixed demo'),keys:async()=>['us-shell-old','another-app'],delete:async(name:string)=>{removed.push(name);}}
  };
  vm.runInNewContext(sw,context); return {listeners,cached,removed};
}
test("service worker excludes APIs, POST, credentials and external origins",()=>{
  const {listeners}=harness();let intercepted=false;
  for(const [url,method,headers] of [['https://us.example/api/today','GET',{}],['https://us.example/api/run','POST',{}],['https://other.example/demo-edition.json','GET',{}],['https://us.example/demo-edition.json','GET',{Authorization:'Bearer test'}]] as const){
    listeners.fetch({request:{url,method,headers:new Headers(headers),mode:'cors'},respondWith:()=>{intercepted=true;}});
  }
  assert.equal(intercepted,false);
});
test("offline navigation uses explicit fixed shell; install caches only safe local files",async()=>{
  const {listeners,cached,removed}=harness((async()=>{throw Error('offline');}) as typeof fetch);
  let pending:Promise<unknown>=Promise.resolve();
  listeners.install({waitUntil:(p:Promise<unknown>)=>{pending=p;}});await pending;
  assert.ok(cached.includes('/demo-edition.json'));assert.ok(cached.includes('/offline.html'));assert.ok(!cached.some((path)=>path.startsWith('/api')||path==='/'));
  listeners.activate({waitUntil:(p:Promise<unknown>)=>{pending=p;}});await pending;assert.deepEqual(removed,['us-shell-old']);
  let response:Promise<Response>|undefined;
  listeners.fetch({request:{url:'https://us.example/',method:'GET',headers:new Headers(),mode:'navigate'},respondWith:(p:Promise<Response>)=>{response=p;}});
  assert.equal(await (await response!).text(),'Offline fixed demo');
});
test("archived audio and puzzle are bundled; cached audio byte ranges work offline",async()=>{
  const demo=JSON.parse(readFileSync("public/demo-edition.json","utf8"));
  const listeners:Record<string,(event:any)=>void>={};let cachedPaths:string[]=[];
  vm.runInNewContext(sw,{URL,Response,AbortController,setTimeout,clearTimeout,fetch:async()=>{throw Error("offline");},self:{location:{origin:"https://us.example"},addEventListener:(name:string,fn:any)=>listeners[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}},caches:{open:async()=>({addAll:async(paths:string[])=>{cachedPaths=paths;}}),match:async()=>new Response(new Uint8Array(100))}});
  let install:Promise<unknown>=Promise.resolve();listeners.install({waitUntil:(p:Promise<unknown>)=>install=p});await install;
  assert.ok(cachedPaths.includes("/demo-puzzle.json"));assert.ok(cachedPaths.includes("/offline-puzzle.js"));
  for(const story of demo.edition.stories){assert.ok(cachedPaths.includes(story.narration.audioUrl));assert.ok(readFileSync(`public${story.narration.audioUrl}`).length>1000);}
  let result:Promise<Response>|undefined;listeners.fetch({request:{url:`https://us.example${demo.edition.stories[0].narration.audioUrl}`,method:"GET",mode:"cors",headers:new Headers({Range:"bytes=0-9"})},respondWith:(p:Promise<Response>)=>result=p});const response=await result!;assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,10);
});
