import test from 'node:test'
import assert from 'node:assert/strict'
import { scoreJob, makeSearchPlan, getAliases, clean, uniq } from './index.mjs'

test('getAliases normalizes roles properly', () => {
  const aliases = getAliases('frontend developer')
  assert.ok(aliases.includes('react developer'))
  assert.ok(aliases.includes('frontend engineer'))
})

test('clean removes extra whitespace', () => {
  assert.equal(clean('  Hello   World  \n \t'), 'Hello World')
})

test('uniq removes duplicates and empty strings', () => {
  assert.deepEqual(uniq(['a', 'b', 'a', '', 'c']), ['a', 'b', 'c'])
})

test('makeSearchPlan drops empty fields instead of guessing', () => {
  const profile = { roles: [], skills: ['React', 'Node'], location: '' }
  const plan = makeSearchPlan(profile)
  assert.equal(plan.titles.length, 0)
  assert.equal(plan.locations.length, 0)
  assert.equal(plan.queries[0], 'React Node') // Falls back to skill search
})

test('makeSearchPlan combines roles and locations', () => {
  const profile = { roles: ['Frontend'], skills: [], location: 'India' }
  const plan = makeSearchPlan(profile, { remoteOnly: false })
  assert.equal(plan.titles[0], 'Frontend')
  assert.equal(plan.locations[0], 'India')
  assert.equal(plan.queries[0], 'Frontend India')
})

const defaultRules = {
  filtering: { role: 'strict', location: 'strict', skills: 'minimum_one_match', remoteOverridesLocation: true },
  ranking: { weights: { role: 40, skills: 30, location: 20, experience: 10 }, minimumScore: 60 }
}

test('scoreJob strict filtering rejects completely unrelated roles', () => {
  const profile = { roles: ['Frontend Developer'], skills: ['React'], location: 'Remote' }
  const job = { title: 'Backend Java Engineer', description: 'Java Spring', tags: [], location: 'Remote' }
  const result = scoreJob(job, profile, { remoteOnly: true }, defaultRules)
  assert.equal(result.status, 'Rejected')
  assert.ok(result.reasons[0].includes('Role mismatch'))
})

test('scoreJob strict filtering rejects missing skills', () => {
  const profile = { roles: ['Frontend Developer'], skills: ['React', 'TypeScript'], location: 'Remote' }
  const job = { title: 'Frontend Developer', description: 'Vue.js and Vuex', tags: [], location: 'Remote' }
  const result = scoreJob(job, profile, { remoteOnly: true }, defaultRules)
  assert.equal(result.status, 'Rejected')
  assert.ok(result.reasons[0].includes('Skills overlap: 0/2'))
})

test('scoreJob calculates weighted score correctly', () => {
  const profile = { roles: ['Frontend Developer'], skills: ['React', 'TypeScript'], location: 'Remote' }
  const job = { title: 'Frontend Engineer', description: 'React', tags: ['TypeScript'], location: 'Remote' }
  const result = scoreJob(job, profile, { remoteOnly: true }, defaultRules)
  
  assert.equal(result.status, 'Accepted')
  // Role: 100 (40)
  // Skills: 100 (30)
  // Location: 100 (20)
  // Experience: 75 (10)
  // Total: 40 + 30 + 20 + 7.5 = 97.5 (rounds to 98)
  assert.equal(result.matchScore, 98)
})
