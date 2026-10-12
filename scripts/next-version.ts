// The next release's version, from the commits since the last one (Conventional Commits):
// breaking change → major (minor while still 0.x), feat → minor, anything else → patch.
// The stage in package.json ("alpha", "beta", "" when stable) goes on as a suffix.
// Used by the release workflow; run it to see what the next release would be:
//   node scripts/next-version.ts
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const FIRST = '0.3.0' // when there are no version tags yet

type Version = [major: number, minor: number, patch: number]

// "v1.2.3" or "v1.2.3-alpha" → [1, 2, 3]; anything else → undefined.
export function parse(tag: string): Version | undefined {
  const m = tag.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined
}

// `last`: the latest version tag, if any. `commits`: full messages since it.
export function nextVersion({
  last,
  commits,
  stage
}: {
  last?: string
  commits: string[]
  stage: string
}): string {
  const suffix = stage ? `-${stage}` : ''
  if (!last) return FIRST + suffix
  const base = parse(last)
  if (!base) throw new Error(`not a version: ${last}`)
  if (!commits.length) throw new Error(`no changes since ${last}`)

  const header = (message: string): RegExpMatchArray | null =>
    message.match(/^(\w+)(?:\([^)]*\))?(!)?:/)
  const breaking = commits.some((m) => header(m)?.[2] === '!' || /^BREAKING[ -]CHANGE:/m.test(m))
  const feature = commits.some((m) => header(m)?.[1] === 'feat')

  let [major, minor, patch] = base
  if (breaking && major > 0) [major, minor, patch] = [major + 1, 0, 0]
  else if (breaking || feature) [minor, patch] = [minor + 1, 0]
  else patch++
  return `${major}.${minor}.${patch}${suffix}`
}

// The highest version tag; a stable one wins over a pre-release of the same number.
export function latest(tags: string[]): string | undefined {
  const rank = (tag: string): number[] => [...parse(tag)!, tag.includes('-') ? 0 : 1]
  return tags
    .filter((tag) => parse(tag))
    .sort((a, b) => {
      const [x, y] = [rank(a), rank(b)]
      return x.map((n, i) => n - y[i]).find((d) => d !== 0) ?? 0
    })
    .at(-1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const git = (...args: string[]): string => execFileSync('git', args, { encoding: 'utf8' })
  const last = latest(git('tag', '--list', 'v*').split('\n').filter(Boolean))
  // Commits separated by a NUL byte (messages have newlines of their own).
  const commits = last
    ? git('log', `${last}..HEAD`, '--format=%B%x00')
        .split('\0')
        .map((m) => m.trim())
        .filter(Boolean)
    : []
  const { stage = '' } = JSON.parse(readFileSync('package.json', 'utf8'))
  try {
    console.log(nextVersion({ last, commits, stage }))
  } catch (e) {
    console.error((e as Error).message)
    process.exit(1)
  }
}
