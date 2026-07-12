# Versioning & Releases

Metabolic uses [Release Please](https://github.com/googleapis/release-please) to manage
versions, the changelog, Git tags, and GitHub Releases automatically from
[Conventional Commit](https://www.conventionalcommits.org/) messages. Versioning starts at
**0.1.0**.

- **Config:** [`release-please-config.json`](../release-please-config.json) — single Node
  package at the repo root, package name `metabolic`, tags prefixed with `v`, changelog and
  GitHub Releases enabled.
- **Manifest:** [`.release-please-manifest.json`](../.release-please-manifest.json) — tracks
  the current version (`0.1.0`).
- **Workflow:** [`.github/workflows/release-please.yml`](../.github/workflows/release-please.yml)
  — runs on every push to `main`.

## One-time GitHub settings (repository owner must verify)

Release Please opens and updates pull requests on your behalf, which requires two settings.
In the GitHub repository:

**Settings → Actions → General → Workflow permissions:**

1. Select **Read and write permissions**.
2. Check **Allow GitHub Actions to create and approve pull requests**.

Without these, the workflow runs but cannot create the release pull request.

> These are account/repo settings that can only be changed in the GitHub UI — they are not
> something a workflow file can grant.

## Normal release flow

1. A feature or fix pull request is merged into `main` (using a Conventional Commit title,
   squash-merged so the commit message matches the title).
2. Release Please opens — or updates — a **release pull request** titled like
   `chore(main): release metabolic 0.2.0`.
3. As more `feat:` / `fix:` PRs land, changes **accumulate** in that release PR and its
   proposed version and changelog update automatically.
4. When you're ready to ship, **merge the release pull request**. Release Please then:
   - bumps the `version` in the root `package.json`,
   - finalizes the `CHANGELOG.md` entry,
   - creates the Git tag (e.g. `v0.2.0`),
   - publishes the corresponding **GitHub Release**.

Nothing is published to npm.

### How commits map to versions (starting from 0.1.0)

| Merged change | New version |
| ------------- | ----------- |
| `fix: ...`    | `0.1.0` → `0.1.1` |
| `feat: ...`   | `0.1.0` → `0.2.0` |
| `feat!: ...` (or a `BREAKING CHANGE:` footer) | `0.1.0` → `1.0.0` |

`chore:`, `docs:`, `refactor:`, and `test:` commits do not by themselves trigger a release.

## About the monorepo package manifests

This is an npm **workspaces** monorepo with three manifests:

- `package.json` (root) — **the single source of the application version**; Release Please
  manages this one.
- `client/package.json` and `server/package.json` — **private, unpublished** workspace
  packages. They are not the application version and are intentionally **not** synchronized
  by Release Please. Their `version` fields are internal and can be left as-is.

If a future need arises to stamp the same version into the workspace manifests (e.g. for a
build artifact), they can be added to the Release Please config as additional packages or
`extra-files`. That is deliberately out of scope for the initial setup to keep a single,
unambiguous version source.

## Do not edit versions by hand

Application versions, tags, the changelog, and releases are owned by Release Please. See
[`CONTRIBUTING.md`](../CONTRIBUTING.md) for commit conventions.
