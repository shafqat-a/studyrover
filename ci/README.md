# CI

`github-workflow-ci.yml` is the GitHub Actions workflow for StudyRover (Go
backend checks, frontend typecheck/lint/build, and the Playwright e2e against a
real backend + Postgres service). It lives here as a plain file because the
`gh` OAuth token on the dev host lacks the `workflow` scope needed to push
anything under `.github/workflows/`.

To activate it:

```sh
gh auth refresh -h github.com -s workflow      # one-time, interactive
mkdir -p .github/workflows
cp ci/github-workflow-ci.yml .github/workflows/ci.yml
git add .github && git commit -m "ci: enable GitHub Actions workflow" && git push
```

Locally the same checks are `make test`, `make lint-frontend`, and `make e2e`.
