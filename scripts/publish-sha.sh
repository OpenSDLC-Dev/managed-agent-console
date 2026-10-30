#!/usr/bin/env bash
# Non-release receiver channel. The workflow owns CI/scan ordering; keep the
# event/source checks here too so a hand-run step cannot broaden admission.
set -euo pipefail
[[ "$GITHUB_EVENT_NAME" == push && "$GITHUB_REF" == refs/heads/main ]] || exit 1
[[ "$GITHUB_REPOSITORY" == OpenSDLC-Dev/managed-agent-console ]] || exit 1
[[ ${#SOURCE_SHA} == 40 && "$SOURCE_SHA" != *[!a-f0-9]* ]] || exit 1
[[ "$(git rev-parse HEAD)" == "$SOURCE_SHA" ]] || exit 1
[[ "$GITHUB_RUN_ID" != *[!0-9]* && -n "$GITHUB_RUN_ID" ]] || exit 1
[[ "$GITHUB_RUN_ATTEMPT" != *[!0-9]* && -n "$GITHUB_RUN_ATTEMPT" ]] || exit 1
VERSION="sha-${SOURCE_SHA}"
STAGING="$IMAGE:staging-${SOURCE_SHA}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
case "${1:-}" in
  build|push)
    [[ "$ARCH" == amd64 || "$ARCH" == arm64 ]] || exit 1
    if [[ "$1" == build ]]; then
      docker build --platform "linux/$ARCH" --build-arg VERSION="$VERSION" \
        --build-arg REVISION="$SOURCE_SHA" -t "$STAGING-$ARCH" .
    else
      printf '%s' "$PUBLISH_TOKEN" | docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin
      docker push "$STAGING-$ARCH"
    fi
    ;;
  manifest)
    printf '%s' "$PUBLISH_TOKEN" | docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin
    amd64="$(docker buildx imagetools inspect "$STAGING-amd64" --format '{{.Manifest.Digest}}')"
    arm64="$(docker buildx imagetools inspect "$STAGING-arm64" --format '{{.Manifest.Digest}}')"
    for digest in "$amd64" "$arm64"; do
      [[ "$digest" == sha256:* && ${#digest} == 71 && "${digest#sha256:}" != *[!a-f0-9]* ]] || exit 1
    done
    docker buildx imagetools create -t "$IMAGE:$VERSION" "$IMAGE@$amd64" "$IMAGE@$arm64"
    digest="$(docker buildx imagetools inspect "$IMAGE:$VERSION" --format '{{.Manifest.Digest}}')"
    echo "digest=$digest" >> "$GITHUB_OUTPUT"
    ;;
  *) exit 2 ;;
esac
