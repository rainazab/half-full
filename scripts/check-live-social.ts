import { readFile, writeFile } from "node:fs/promises";
import { parseEdition } from "../lib/edition-schema";
import { getEditorConfig } from "../lib/config";
import { judgeSocial } from "../lib/social-review";
async function main() { const result=parseEdition(JSON.parse(await readFile("generated/upgrade-edition.json","utf8")));const posts=[...new Map(result.edition.stories.flatMap((s)=>s.socialContext?.posts??[]).map((p)=>[p.id,p])).values()];const allowed=await judgeSocial(result.edition.stories,posts,getEditorConfig(),15000);const matches=result.edition.stories.map((s)=>({story:s.headline,posts:s.socialContext?.posts.filter((p)=>allowed.has(`${s.id}/${p.id}`)).map((p)=>p.title)??[]}));await writeFile("generated/social-relevance-check.json",JSON.stringify(matches,null,2));console.log(JSON.stringify(matches,null,2)); }
main().catch(()=>{console.error("Optional social relevance check did not finish; no social links would be published.");process.exitCode=1;});
