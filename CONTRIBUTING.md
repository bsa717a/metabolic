# Contributing to Metabolic

## Commit & pull request conventions

This repository uses **automated semantic versioning** via
[Release Please](https://github.com/googleapis/release-please). Versions, the changelog,
Git tags, and GitHub Releases are generated from your commit messages, so the format of
those messages matters.

Write commits and pull request titles as
[Conventional Commits](https://www.conventionalcommits.org/):

```
type(optional-scope): short description
```

### Commit types

| Prefix           | Use for                                                        | Version effect |
| ---------------- | -------------------------------------------------------------- | -------------- |
| `feat:`          | New user-facing functionality                                  | Minor bump     |
| `fix:`           | Bug fixes                                                      | Patch bump     |
| `refactor:`      | Internal restructuring with no user-facing behavior change     | No release     |
| `docs:`          | Documentation changes                                          | No release     |
| `chore:`         | Maintenance tasks (deps, config, tooling)                      | No release     |
| `test:`          | Test-only changes                                             | No release     |
| `feat!:`         | Breaking change that adds/changes functionality                | Major bump     |
| `fix!:`          | Breaking bug fix                                               | Major bump     |
| `BREAKING CHANGE:` | Footer line describing a breaking change (any type)         | Major bump     |

Scopes are optional and free-form, e.g. `feat(ios): add Capacitor shell` or
`fix(sms): correct water logging`. Append `!` for a breaking change, e.g.
`feat!: replace authentication flow`. A breaking change can also be described in the commit
body with a `BREAKING CHANGE:` footer.

### Pull request workflow

- **PR titles must use Conventional Commit format.** A lightweight check
  (`.github/workflows/pr-title.yml`) validates this on every pull request.
- **Squash and merge** when practical, so one PR becomes one clean commit on `main`.
- **The final squash commit message should match the PR title** — Release Please reads the
  commit that lands on `main`, so the PR title is effectively the release note.
- **Never edit application versions by hand.** Release Please owns:
  - the `version` field in the root `package.json`
  - `CHANGELOG.md`
  - Git tags (e.g. `v0.2.0`)
  - GitHub Releases

For the full release flow and the one-time repository settings required, see
[`docs/versioning.md`](docs/versioning.md).
