# One retired Editor gateway worker

This manual workflow is a one-time operational workaround for the exact
retired public gateway worker observed on November 13, 2026. It is separate
from normal product deployment. No push, dispatch or production invocation
has been performed while preparing this change.

**It is not an SSE-only drain.** Existing process metadata cannot prove that
all connections held by this retired worker are SSE. Applying the operation
can interrupt an old HTTP request still attached to that worker, including
an upload. Session EventSource clients reconnect without revoking their login;
this does not guarantee that every other interrupted request is retried.

The default workflow action is `inspect`. The apply action requires the exact
confirmation `terminate-retired-editor-gateway-worker-344`. Root must review
this remaining HTTP-request risk before dispatching apply.

The helper holds the same deployment/backup lock and refuses concurrent work
or an unresolved recovery marker. It requires the public API to serve
`9b57b66da43f6dd95c162df989c843e69f8c231a` and UI to serve
`c7881c73fe27fa9faafb21a7865c3f2699a17bf1`, corroborated by private release
metadata and active service image references. All Editor container identities,
process IDs, images and health state must be unchanged afterward.

The only possible signal target is the pinned retired worker:

| Identity | Exact value |
| --- | --- |
| Gateway container | `76a3a69e6ab595f50e8c41834ac9ae857e43828bdb5a43801cef066f6cb2a414` |
| Host PID / container PID | `3620554` / `344` |
| Start ticks | `225793692` |
| Master host PID / container PID | `3602572` / `1` |
| Master start ticks | `225755805` |
| Current host workers | `3698865` through `3698870` |
| Current container workers | `405` through `410` |
| Current worker start ticks | `243953669` |

All worker titles, parents, namespace mappings, start ticks and host cgroups
are checked. The exact retired title must remain `nginx: worker process is
shutting down`. The first observed retirement must be over 1,900 seconds old.

For apply, a short-lived Python maintenance container uses the immutable image
ID of the exact healthy API release. It shares only the pinned gateway's PID
namespace, has no network, environment injection or mounts, runs on a read-only
filesystem, drops all capabilities except `KILL`, and runs no application
entrypoint. It opens a pidfd for PID 344, validates identities again, and sends
SIGTERM through that descriptor only. A reused numeric PID can never redirect
the signal to its replacement. It waits up to ten seconds, with no SIGKILL
fallback. It neither restarts any gateway nor signals a job/API/DB process.

The immutable API image is used only as an already-installed Python runtime;
the maintenance process does not import application code or have credentials.
No connection payloads, session tokens, environment values or user logs are
read. Results contain only fixed identity checks, health and refusal codes.

Local guard tests:

```sh
python3 -m unittest discover -s deploy/tests -p 'test_retired_gateway_maintenance.py'
```

The maintenance-only registration commit uses `[skip ci]` in its body, avoiding
an automatic frontend deployment before maintenance can acquire the lock. The
manual workflow still runs its isolated guard-test job before inspection or
apply. After inspection and risk review, the apply dispatch needs the exact
confirmation above. Registration, dispatch and normal release retry are
separate operations.

After a successful apply, normal frontend deployment may be retried with its
existing gateway drain guard intact. This helper does not retry or deploy any
release. A separately reviewed bounded SSE lifetime is still needed to prevent
this class of blocker in future deployments.
