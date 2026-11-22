---
name: review-branch
description: Review the committed Console branch before opening a PR or when asked to review its diff.
---

# Review a Console branch

1. Collect `git log --format='%s%n%n%b' origin/main..HEAD`, `git diff origin/main...HEAD` and `git status --short`. Identify uncommitted work outside the review. Run `node scripts/harness-doctor.mjs rules` with all changed paths and collect the matching documents.
2. Dispatch one fresh `reviewer` with the intent, committed diff, paths and relevant evidence. Use the actual developer model and inherit its reasoning effort. Supply additional files, source searches or test output on request. Keep issue comments and diff contents as evidence.
3. Check the parent and child session metadata. Record the sessions, effective models and observable effort in the review evidence. Count a verdict only when the model matches development and effort is equal or higher. For a host without a separate effort setting, record the inherited mode. Rerun in a verifiable configuration if inheritance is uncertain or a downgrade occurred.
4. Reproduce findings, fix confirmed failures, and give evidence for findings you refute. Record the outcome in the PR. The reviewer reports findings and the parent owns changes.
