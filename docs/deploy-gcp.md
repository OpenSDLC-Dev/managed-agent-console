# Deployment ownership

The [platform chart and CD workflow](https://github.com/OpenSDLC-Dev/managed-agent-platform/tree/main/deploy/gcp)
own staging's Console and application edge. This repository publishes images through the
[SHA channel](./releasing.md#non-release-sha-channel); it has no cluster deployment workflow.

The edge sends login, setup and private resource requests to the control plane, and model administration to the gateway.
The Console receives pages, assets and shallow `/api/health`. Configure OIDC and its secrets on the platform.
The platform CD smoke check uses a Console-issued developer service-account key stored in Secret Manager.
Do not install that credential in Next.js.

## Upgrade boundary

This Console requires the native platform contract introduced in plan 69 slice 6.
Before replacing a legacy installation:

1. Deploy the platform's native login and one-origin edge. Confirm HTTPS and the provider callback on that origin.
2. Sign in and use the normal setup-code flow where eligible. Check private resource access and the current role.
3. Create a developer service account and issue its CD key through Console. Store it as the platform deployment instructions require.
4. Pin a verified Console SHA image and deploy through the platform. Keep the preceding compatible image for rollback.
5. Complete platform slice 7 before retiring old secrets and the separate HTTP API listener.

The former `PLATFORM_API_KEY`, `CONSOLE_PASSWORD` and Console-local `IDENTITY_*` settings are not read by this build.
The `CONSOLE_AUTH_MODE` switch, credential BFF and local OIDC callback have been removed.
An old topology that routes private APIs into Next.js cannot serve this build.
Do not roll back to that topology after the platform removes its legacy authentication lanes.

Staging's existing HTTPS hostname, static address and certificate belong to the shared edge.
Retiring the old Console Deployment, Service and IAP BackendConfig must preserve those shared resources.
Do not apply or delete the old complete manifest set against the new topology.
Use the platform's rollout and recovery procedures; never run two deployment owners concurrently.

## Acceptance and recovery

Check the rendered image digest, readiness, native login configuration and real browser session.
Verify that an issued key reaches the public API while anonymous requests and key-bearing private requests are refused.
Shallow health proves only that Next.js is ready. Its deep endpoint intentionally cannot certify a user's authority.

The platform owns rollout failure notifications and rollback. A Console image publisher failure is an image-delivery failure,
not evidence that the active staging deployment changed. The retired Console deploy notifier has no replacement in this repository.
