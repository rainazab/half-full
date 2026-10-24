import assert from "node:assert/strict";
import test from "node:test";
import { boundedRetry } from "../lib/retry";
test("transient failures retry once within the original deadline", async () => {
  let time=0, attempts=0;
  const remaining:number[]=[];
  const result=await boundedRetry(async (budget) => { remaining.push(budget); if(++attempts===1) throw Error("transient"); return "ok"; },{budgetMs:2000,retryable:()=>true,now:()=>time,sleep:async(ms)=>{time+=ms;}});
  assert.equal(result,"ok");assert.deepEqual(remaining,[2000,1500]);
});
test("timeouts, permanent failures and exhausted budgets do not spin",async()=>{
  for(const [budget,retryable,expected] of [[2000,true,2],[100,true,1],[2000,false,1]] as const){
    let calls=0;
    await assert.rejects(boundedRetry(async()=>{calls++;throw Error("failed");},{budgetMs:budget,retryable:()=>retryable,sleep:async()=>{}}),/failed/);
    assert.equal(calls,expected);
  }
});
