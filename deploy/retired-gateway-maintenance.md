# One retired Editor gateway worker

This manual workflow is a one-time operational workaround for the exact
retired public gateway worker observed on November 13, 2026. It is separate
from normal product deployment. Local guard tests do not invoke production.

**It is not an SSE-only drain.** Existing process metadata cannot prove that
all connections held by this retired worker are SSE. Applying the operation
can interrupt an old HTTP request still attached to that worker, including
an upload. Session EventSource clients reconnect without revoking their login;
this does not guarantee that every other interrupted request is retried.

The default workflow action is `inspect`. It validates the actual restricted
Docker/PID namespace and pidfd access in a short-lived helper without sending
any signal. Apply repeats this namespace inspection before termination. The
apply action requires the exact
confirmation `terminate-retired-editor-gateway-worker-408`. Root must review
this remaining HTTP-request risk before dispatching apply.

The helper holds the same deployment/backup lock and refuses concurrent work
or an unresolved recovery marker. It requires the public API to serve
`0e2f678fcbc02d3c56570229743150de6f8f53bc` and UI to serve
`21d0ffe651ded2f28f780baa026a0d9174ba907a`, corroborated by private release
metadata and active service image references. All Editor container identities,
process IDs, images and health state must be unchanged afterward.

The only possible signal target is the pinned retired worker:

| Identity | Exact value |
| --- | --- |
| Gateway container | `76a3a69e6ab595f50e8c41834ac9ae857e43828bdb5a43801cef066f6cb2a414` |
| Host PID / container PID | `3698868` / `408` |
| Start ticks | `243953669` |
| Master host PID / container PID | `3602572` / `1` |
| Master start ticks | `225755805` |
| Current host workers | `3960785`, `3960786`, `3960787`, `3960788`, `3960789`, `3960791` |
| Current container workers | `7008` through `7013`, in the same order |
| Current worker start ticks | `244908369` for the first five; `244908370` for `3960791` |

All worker titles, parents, namespace mappings, start ticks and host cgroups
are checked. The exact retired title must remain `nginx: worker process is
shutting down`. The first observed retirement must be over 1,900 seconds old.
That observation was `2026-11-13T15:19:45.346143Z`; apply remains refused until
after `2026-11-13T15:51:25.346143Z`. Process age is not used as a substitute for
this observed retirement grace.

For namespace inspection and apply, a stopped Python maintenance container is
created with pulls disabled. Optional `ImageManifestDescriptor.digest` metadata
is read through safe map indices. Local manifest, repository digest, config
digest and release-tag references are inspected to find the serving API's exact
image bytes; no image is pulled. Before starting, the helper's actual image ID
must equal the selected pinned runtime ID. Its exact reference, PID namespace,
marker, stopped state and container ID must also match. A retag between image
lookup and container creation therefore refuses before any process starts.

If the serving image no longer has a resolvable local reference, only this
operator-reviewed alternative is permitted:

| Runtime provenance | Exact value |
| --- | --- |
| Reviewed frontend deployment run | `43456015638`, source `1f2007ef211a0df932d50f1f3d81fb110285c028` |
| API source rebuilt by that run | `0e2f678fcbc02d3c56570229743150de6f8f53bc` |
| Server build completion | `2026-11-13T15:49:38Z` |
| Pinned runtime config image | `sha256:8592e9058b033fd5ba7989ec3549bc474a0a9da6036df23c4255af4364b6847f` |
| Platform manifest | `sha256:3715375e62683a666605eb54fc0633b52553977222d058e4ef9085778c3bd340` |
| Image index | `sha256:410ab8c98914a6453122fb31f0712995a1de7eb8eed4ac021a981dd6a2dd32b1` |

The release operator reviewed those config/manifest/index digests in the
cancelled deployment's server build output before approving this alternative.
The serving API still has to pass the original release/health/container guards;
it is never replaced. This alternative is used only as a Python stdlib runtime,
with the exact reviewed config digest checked both during local resolution and
again on the stopped helper. Any different available image is refused. Results
explicitly state whether the runtime matches the serving API, with the active
image/manifest, selected image, created helper image and provenance. Failed
resolution reports only whitelisted image hashes, build times and SHA labels.
This is an explicit fixed alternative, not automatic approval of a mutable tag.

The helper shares only the gateway's PID
namespace, has no network, environment injection or mounts, runs on a read-only
filesystem, drops all capabilities except `KILL`, and runs no application
entrypoint. It opens a pidfd for PID 408, validates identities again, and sends
SIGTERM through that descriptor only. A reused numeric PID can never redirect
the signal to its replacement. It waits up to ten seconds, with no SIGKILL
fallback. It neither restarts any gateway nor signals a job/API/DB process.

The pinned API image is used only as an already-installed Python runtime;
the maintenance process does not import application code or have credentials.
No connection payloads, session tokens, environment values or user logs are
read. Results contain only fixed identity checks, health and refusal codes.
Docker's optional health map is read with `index`, so containers without a
healthcheck report `none`. Failed Docker commands report a fixed operation
stage and error category; raw stderr and command arguments are never echoed.
Inner namespace guard refusals propagate only through a fixed code allowlist.
If this exact credential-free namespace command fails before producing its
JSON response, its bounded stdout/stderr is saved with mode 0600 and uploaded
as a private workflow artifact retained for one day. Logs contain only the
exit code, byte counts and fixed error class. This diagnostic never reads
connection contents, environment values or unrelated application logs.

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
release. The new Editor API already limits new session-event streams to 120
seconds. This does not retroactively end an existing stream held by the legacy
9b57 generation. This exact legacy profile is a one-time bootstrap operation;
the normal connection-drain guard remains enabled for all releases.
