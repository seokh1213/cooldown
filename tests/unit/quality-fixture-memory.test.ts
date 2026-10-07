import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureMemory } from '../../scripts/llm/quality/fixtureMemory';
test('reference-only evaluation seeds query current data without altering the frozen source', () => {
  const seed = { patch:'old', conditions:[], active:'stat', stat:{kind:'championStat',champions:['Lux'],field:'health',level:18} };
  const bound = fixtureMemory(seed,'current');
  assert.equal(bound.patch,'current'); assert.equal(seed.patch,'old'); assert.deepEqual(bound.stat,seed.stat);
});
test('answers, reviewed mechanics, context frames and conditional history retain their original patch', () => {
  for (const extra of [{lastReply:{text:'old answer'}},{mechanic:{sourceHash:'old'}},{contextFrames:[]},{conditions:[{status:'missing'}]}]) {
    const seed = {patch:'old',conditions:[],...extra}; assert.deepEqual(fixtureMemory(seed,'current'),seed);
  }
  const embedded = {patch:'old',conditions:[],stat:{kind:'championStat',answer:'old numeric fact'}};
  assert.deepEqual(fixtureMemory(embedded,'current'),embedded);
});
