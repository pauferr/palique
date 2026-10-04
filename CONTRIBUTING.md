# Contributing

## Commit messages

All commit messages are written in **English** and follow [Conventional Commits](https://www.conventionalcommits.org).

```
type(scope): description
```

- **type**: one of the types below.
- **scope**: the area of the codebase affected (see suggested scopes).
- **description**: imperative mood, lowercase, no trailing period. Example: `add buzz animation`, not `Added buzz animation.`

### Types

| Type | Use for |
|------|---------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `style` | Formatting, whitespace; no logic changes |
| `refactor` | Code restructuring with no behaviour change |
| `perf` | Performance improvements |
| `test` | Adding or updating tests |
| `build` | Dependencies, build system, packaging |
| `ci` | Continuous integration configuration |
| `chore` | Maintenance tasks that don't fit elsewhere |

### Suggested scopes

`chat`, `roster`, `presence`, `buzz`, `winks`, `auth`, `history`, `sound`, `theme`, `ui`, `xmpp`, `electron`, `server`, `planning`

New scopes can be added when needed; keep them short and lowercase.

### Examples

```
feat(buzz): shake chat window on incoming buzz
fix(roster): keep contact order after reconnect
docs(planning): add character cast
build(electron): update to latest minor version
```

### Breaking changes

Add `!` after the scope and explain in the body:

```
feat(xmpp)!: switch winks to custom stanza format

BREAKING CHANGE: older clients will not display winks.
```
