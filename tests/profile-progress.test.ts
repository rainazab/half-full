import test from "node:test";
import assert from "node:assert/strict";
import {applyProgress,cleanProgress,emptyProgress,importGuest,pendingCacheKey,profileCacheKey,progressPatch,authMessage} from "../lib/profile-progress";
test("imports guest reads once and keeps cloud reactions, including cleared reactions",()=>{
 const cloud={days:["2026-10-23"],reactions:{one:"",two:"Hopeful"}};
 const guest={days:["2026-10-22","2026-10-23"],reactions:{one:"Stressed",three:"Insightful"}};
 const merged=importGuest(cloud,guest);
 assert.deepEqual(merged.days,["2026-10-22","2026-10-23"]);
 assert.deepEqual(merged.reactions,{one:"",three:"Insightful",two:"Hopeful"});
 assert.deepEqual(importGuest(merged,guest),merged);
});
test("local edits merge into the latest cloud copy without overwriting other-device changes",()=>{
 const before={days:["2026-10-22"],reactions:{one:"Hopeful"}};
 const patch=progressPatch(before,{days:[...before.days,"2026-10-24"],reactions:{one:"",two:"Insightful"}});
 const remote={days:["2026-10-22","2026-10-23"],reactions:{one:"Hopeful",three:"Interesting"}};
 const merged=applyProgress(remote,patch);
 assert.deepEqual(merged.days,["2026-10-22","2026-10-23","2026-10-24"]);
 assert.deepEqual(merged.reactions,{one:"",three:"Interesting",two:"Insightful"});
 assert.deepEqual(applyProgress(merged,patch),merged);
});
test("profile data is bounded and malformed stored values cannot become progress",()=>{
 const bad=cleanProgress({days:["not-a-day","2026-02-30","2026-10-24",null],reactions:{good:"Hopeful",bad:"injected",["x".repeat(151)]:"Stressed"}});
 assert.deepEqual(bad,{days:["2026-10-24"],reactions:{good:"Hopeful"}});
 assert.deepEqual(cleanProgress(null),emptyProgress());
 const many=cleanProgress({days:[],reactions:Object.fromEntries(Array.from({length:1100},(_,i)=>[`id${i}`,"Interesting"]))});
 assert.equal(Object.keys(many.reactions).length,1000);
});
test("guest, account caches and offline queues use separate identities",()=>{
 assert.notEqual(profileCacheKey(),profileCacheKey("alice"));
 assert.notEqual(profileCacheKey("alice"),profileCacheKey("bob"));
 assert.notEqual(pendingCacheKey("alice"),pendingCacheKey("bob"));
 assert.notEqual(pendingCacheKey("alice"),profileCacheKey("alice"));
 assert.ok(!authMessage("secret provider body").includes("secret"));
});
