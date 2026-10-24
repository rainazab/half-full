import assert from "node:assert/strict";
import test from "node:test";
import { reviewWithOpenAI } from "../lib/openai";
import { PipelineError } from "../lib/errors";
const config={provider:'openai',label:'OpenAI',model:'test-model',keyEnv:'OPENAI_API_KEY',modelEnv:'OPENAI_MODEL',modelUsesDefault:false,apiKey:'test-secret'};
test("OpenAI incomplete, refused and malformed JSON responses fail closed",async(t)=>{
  const message=(content:unknown[])=>({id:'msg_test',type:'message',status:'completed',role:'assistant',content});
  for(const [response,code] of [
    [{status:'incomplete',output:[]},'OPENAI_INCOMPLETE'],
    [{status:'completed',output:[message([{type:'refusal',refusal:'No'}])]},'OPENAI_REFUSAL'],
    [{status:'completed',output:[message([{type:'output_text',text:'invalid json',annotations:[]}])]},'OPENAI_INVALID_JSON'],
  ] as const){
    t.mock.method(globalThis,'fetch',async()=>Response.json(response));
    await assert.rejects(reviewWithOpenAI(config,[]),(error:unknown)=>error instanceof PipelineError && error.code===code);
    t.mock.restoreAll();
  }
});
test("OpenAI HTTP failures are sanitized and rate limits retry only once",async(t)=>{
  for(const status of [401,429]){
    let attempts=0;
    t.mock.method(globalThis,'fetch',async()=>{attempts++;return Response.json({error:{message:'secret provider payload',type:'api_error'}},{status});});
    await assert.rejects(reviewWithOpenAI(config,[]),(error:unknown)=>error instanceof PipelineError && error.code==='OPENAI_API_ERROR' && !error.message.includes('secret provider payload'));
    assert.equal(attempts,status===429?2:1);t.mock.restoreAll();
  }
});
