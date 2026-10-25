import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds,type RulesTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,serverTimestamp,runTransaction} from 'firebase/firestore';
import {applyProgress,cleanProgress} from '../../lib/profile-progress';
let env:RulesTestEnvironment;
test.before(async()=>{env=await initializeTestEnvironment({projectId:'demo-half-full',firestore:{rules:readFileSync('firestore.rules','utf8')}})});
test.after(async()=>{await env?.cleanup()});
test.beforeEach(async()=>{await env.clearFirestore()});
const data=()=>({displayName:'Test Reader',email:'reader@example.invalid',photoURL:'',days:['2026-10-24'],reactions:{story1:'Hopeful'},updatedAt:serverTimestamp()});
test('owners can save and retrieve their own profile; other users and guests cannot',async()=>{
 const alice=env.authenticatedContext('alice').firestore(), bob=env.authenticatedContext('bob').firestore(), guest=env.unauthenticatedContext().firestore();
 await assertSucceeds(setDoc(doc(alice,'users/alice'),data()));
 assert.equal((await assertSucceeds(getDoc(doc(alice,'users/alice')))).data()?.displayName,'Test Reader');
 for(const db of [bob,guest]){await assertFails(getDoc(doc(db,'users/alice')));await assertFails(setDoc(doc(db,'users/alice'),data()));}
 await assertFails(getDocs(collection(alice,'users')));
 await assertFails(setDoc(doc(alice,'editions/anything'),data()));
});
test('profile rules reject arbitrary fields, invalid reactions, oversized history, and client timestamps',async()=>{
 const db=env.authenticatedContext('alice').firestore();
 for(const patch of [{admin:true},{reactions:{story1:'invalid'}},{days:Array(367).fill('2026-10-24')},{updatedAt:new Date(0)}]) await assertFails(setDoc(doc(db,'users/alice'),{...data(),...patch}));
 await assertSucceeds(setDoc(doc(db,'users/alice'),{...data(),reactions:{story1:''}}));
});
test('transactional edits preserve another device’s reads and reactions',async()=>{
 const db=env.authenticatedContext('alice').firestore(), ref=doc(db,'users/alice');
 await setDoc(ref,data());
 const editA={days:['2026-10-23'],reactions:{story2:'Insightful'}},editB={days:['2026-10-22'],reactions:{story1:''}};
 await Promise.all([editA,editB].map(patch=>runTransaction(db,async transaction=>{
  const snapshot=await transaction.get(ref);
  transaction.set(ref,{...applyProgress(cleanProgress(snapshot.data()),patch),updatedAt:serverTimestamp()},{mergeFields:["days","reactions","updatedAt"]});
 })));
 const result=(await getDoc(ref)).data()!;
 assert.deepEqual(result.days,['2026-10-22','2026-10-23','2026-10-24']);
 assert.deepEqual(result.reactions,{story1:'',story2:'Insightful'});
});

test('bounded reaction maps replace expired keys instead of exceeding the account limit',async()=>{
 const db=env.authenticatedContext('alice').firestore(), ref=doc(db,'users/alice');
 await setDoc(ref,{...data(),reactions:Object.fromEntries(Array.from({length:1000},(_,i)=>[`story${i}`,'Hopeful']))});
 await runTransaction(db,async transaction=>{
  const snapshot=await transaction.get(ref);
  transaction.set(ref,{...applyProgress(cleanProgress(snapshot.data()),{days:[],reactions:{newest:'Interesting'}}),updatedAt:serverTimestamp()},{mergeFields:['days','reactions','updatedAt']});
 });
 const reactions=(await getDoc(ref)).data()!.reactions;
 assert.equal(Object.keys(reactions).length,1000);
 assert.equal(reactions.newest,'Interesting');assert.ok(!('story0' in reactions));
});
