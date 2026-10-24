import assert from "node:assert/strict";
import test from "node:test";
import { generateEdition, pipelineDependencies } from "../lib/pipeline";
import { retrieveNews } from "../lib/apify";
import { createRun, finishRun, getLatestEdition, getRun } from "../lib/store";
import { PipelineError } from "../lib/errors";
import { parseEdition } from "../lib/edition-schema";
import { readFileSync } from "node:fs";
import type { AppConfig } from "../lib/config";
import type { RunRecord } from "../lib/types";
import { GET as health } from "../app/api/health/route";
import { POST } from "../app/api/run/route";
import { GET as today } from "../app/api/today/route";
import { GET as previousRun } from "../app/api/run/[id]/route";
const config:AppConfig={editor:{provider:'openai',label:'OpenAI',model:'test-model',keyEnv:'OPENAI_API_KEY',modelEnv:'OPENAI_MODEL',modelUsesDefault:false,apiKey:'synthetic-secret'},apifyToken:'synthetic-token',actorId:'test~actor',actorInput:{}};
const items=[{title:'Test article',url:'https://example.org/story',text:'Synthetic evidence only. '.repeat(20),publishedAt:new Date().toISOString()}];
const record=():RunRecord=>({id:'test-run',status:'running',createdAt:new Date().toISOString(),runLog:[]});

test("pipeline audits every candidate after provider failure, sanitizes errors and finishes failed run",async()=>{
  const run=record();let finished=false;const progress:string[]=[];
  await assert.rejects(generateEdition(run,(entry)=>progress.push(entry.step),{...pipelineDependencies,getConfig:()=>config,retrieveNews:async()=>items,reviewCandidates:async()=>{throw Error('Bearer synthetic-secret');},finishRun:()=>{finished=true;}}),/could not be generated/);
  assert.ok(finished);assert.equal(run.rejectedStories?.length,1);assert.equal(run.stats?.rejected,1);assert.equal(run.runLog.at(-1)?.status,'failed');assert.ok(progress.includes('openai.review'));assert.ok(!JSON.stringify(run).includes('synthetic-secret'));
});
test("no candidates and malformed model JSON produce controlled failure logs",async()=>{
  for(const [data,response,code] of [[[],{},'NO_USABLE_CANDIDATES'],[items,{unexpected:true},'EDITOR_VALIDATION_FAILED']] as const){
    const run=record();
    await assert.rejects(generateEdition(run,undefined,{...pipelineDependencies,getConfig:()=>config,retrieveNews:async()=>[...data],reviewCandidates:async()=>response,finishRun:()=>{}}),(error:unknown)=>error instanceof PipelineError && error.code===code);
    assert.equal(run.runLog.at(-1)?.status,'failed');
  }
});
test("store rejects concurrent runs and preserves last successful edition after failure",()=>{
  const result=parseEdition(JSON.parse(readFileSync('public/demo-edition.json','utf8')));
  const first=createRun();assert.throws(()=>createRun(),(e:unknown)=>e instanceof PipelineError && e.status===409);finishRun(first,result);
  const second=createRun();finishRun(second);assert.equal(getLatestEdition(),result);assert.equal(getRun(second.id)?.status,'failed');
});
test("Apify empty, failed and malformed responses are explicit; Actor POST is never retried",async(t)=>{
  for(const scenario of ['empty','failed','malformed','timeout','rate-limit'] as const){
    let calls=0;
    t.mock.method(globalThis,'fetch',async()=>{
      calls++;
      if(scenario==='timeout') throw new DOMException('Timed out','TimeoutError');
      if(scenario==='rate-limit') return Response.json({}, {status:429});
      if(scenario==='malformed') return new Response('not json');
      if(calls===1)return Response.json({data:{id:'testRun',defaultDatasetId:'testDataset',status:scenario==='failed'?'FAILED':'SUCCEEDED'}});
      return Response.json([]);
    });
    await assert.rejects(retrieveNews(config,()=>{},()=>{}),(error:unknown)=>error instanceof PipelineError && ({empty:'APIFY_EMPTY_DATASET',failed:'APIFY_ACTOR_FAILED',malformed:'APIFY_INVALID_RESPONSE',timeout:'APIFY_UNREACHABLE','rate-limit':'APIFY_API_ERROR'}[scenario]===error.code));
    assert.equal(calls,scenario==='empty'?2:1);t.mock.restoreAll();
  }
});
test("all four route contracts, cross-origin rejection and missing-configuration streaming errors",async()=>{
  const names=['OPENAI_API_KEY','ANTHROPIC_API_KEY','APIFY_API_TOKEN','APIFY_ACTOR_ID','LLM_PROVIDER'];
  const saved=Object.fromEntries(names.map((name)=>[name,process.env[name]]));
  try{
    for(const name of names)delete process.env[name];
    const status=await health().json();assert.equal(status.ready,false);assert.equal(status.server,'running');assert.ok(!JSON.stringify(status).includes('synthetic-secret'));
    const rejected=await POST(new Request('http://localhost/api/run',{method:'POST',headers:{Origin:'https://wrong.example',Host:'localhost'}}));assert.equal(rejected.status,403);
    const failed=await POST(new Request('http://localhost/api/run',{method:'POST'}));assert.equal(failed.status,503);const failure=await failed.json();assert.equal(failure.error.code,'MISSING_CONFIGURATION');
    const prior=await previousRun(new Request('http://localhost'),{params:Promise.resolve({id:failure.runId})});assert.equal((await prior.json()).status,'failed');
    const missing=await previousRun(new Request('http://localhost'),{params:Promise.resolve({id:'not-a-run'})});assert.equal(missing.status,404);
    assert.equal(today().headers.get('Cache-Control'),'no-store');
    const streamed=await POST(new Request('http://localhost/api/run',{method:'POST',headers:{Accept:'application/x-ndjson'}}));
    const events=(await streamed.text()).trim().split('\n').map((line)=>JSON.parse(line));assert.equal(events[0].type,'run');assert.equal(events.at(-1).type,'error');assert.equal(events.at(-1).failure.error.code,'MISSING_CONFIGURATION');
  } finally { for(const name of names){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];} }
});

test("successful pipeline publishes ordered 3-story edition; partial approvals stay fully audited",async()=>{
  const inputs=Array.from({length:3},(_,i)=>({title:`Synthetic story ${i}`,url:`https://example.org/article-${i}`,text:`Synthetic report number ${i}. `+"Additional synthetic article evidence. ".repeat(20),publishedAt:new Date().toISOString()}));
  for(const approvedCount of [3,2,0]){
    const run=record();let published=false;
    const deps={...pipelineDependencies,getConfig:()=>config,retrieveNews:async()=>inputs,
      reviewCandidates:async(_config:unknown,candidates:import('../lib/types').CandidateStory[])=>({decisions:[...candidates].reverse().map((candidate,index)=>({
        candidateId:candidate.id,verificationStatus:index<approvedCount?'verified':'uncertain',centralClaim:'A synthetic test report was published.',adequatelySupported:true,sensationalized:false,confidence:0.85,hypeScore:0.1,reason:'The supplied test material supports the limited claim.',headline:candidate.title,summary:'A synthetic report was published.',whyItMatters:'Understanding limitations can inform reading.',action:'Read the source limitations.',category:'Test',sourceIds:[candidate.id],evidence:[{sourceId:candidate.id,passageId:'p1'}],
        contentEvidence:Object.fromEntries(['headline','summary','whyItMatters','action'].map((field)=>[field,[{sourceId:candidate.id,passageId:'p1'}]])),sourceAssessments:[{sourceId:candidate.id,kind:'reporting',independenceGroup:'test',explanation:'Synthetic reporting only.'}],conflictingSourceIds:[],contradictionReason:'',
      }))}),finishRun:(_record:RunRecord,result?:import('../lib/types').EditionResult)=>{published=!!result;}};
    if(approvedCount===3){const result=await generateEdition(run,undefined,deps);parseEdition(result);assert.deepEqual(result.edition.stories.map((story)=>story.headline),inputs.map((input)=>input.title).reverse());assert.equal(result.runLog.at(-1)?.step,'edition');assert.ok(published);}
    else{await assert.rejects(generateEdition(run,undefined,deps),(e:unknown)=>e instanceof PipelineError && e.status===422);assert.equal(published,false);assert.equal(run.stats?.approved,0);assert.equal(run.rejectedStories?.length,3);}
  }
});
