#!/usr/bin/env python3
"""One-time, default-inspect cleanup of one pinned retired Nginx worker.

This is an operational workaround, not an SSE-only drain. The retired worker
can still own HTTP connections; this tool cannot prove they are all SSE.
It never revokes a login, restarts a gateway, or signals an application worker.
"""

import argparse
import datetime
import fcntl
import json
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import sys
import time
import urllib.request

CONTAINER = "76a3a69e6ab595f50e8c41834ac9ae857e43828bdb5a43801cef066f6cb2a414"
API_SHA = "0e2f678fcbc02d3c56570229743150de6f8f53bc"
UI_SHA = "21d0ffe651ded2f28f780baa026a0d9174ba907a"
# Explicitly reviewed by the release operator: run 43458320468 rebuilt this
# same API source at 2026-11-13T16:03:30Z. Read-only inspect 43458996796 proved
# this containerd store exposes the index digest as image .Id, rather than
# the config blob digest. The stopped helper must prove the same .Image.
# This is only a stdlib tool runtime, never an application replacement.
REVIEWED_RUNTIME_CONFIG = "sha256:8592e9058b033fd5ba7989ec3549bc474a0a9da6036df23c4255af4364b6847f"
REVIEWED_RUNTIME_IMAGE = "sha256:b6f0e4499504c44e8b01b919c7467b5304d9a146da2908d38cf35245e76bdb13"
REVIEWED_RUNTIME_MANIFEST = "sha256:3715375e62683a666605eb54fc0633b52553977222d058e4ef9085778c3bd340"
REVIEWED_RUNTIME_INDEX = "sha256:b6f0e4499504c44e8b01b919c7467b5304d9a146da2908d38cf35245e76bdb13"
RUNTIME_PROVENANCE = {"workflow_run": 43458320468, "backend_sha": API_SHA,
                      "build_completed_at": "2026-11-13T16:03:30Z",
                      "frontend_sha": "50de9ac1fdf4be3390ac0264a245b83d6c0a918d",
                      "config_digest": REVIEWED_RUNTIME_CONFIG,
                      "identity_verified_by_inspect_run": 43458996796}
CONFIRMATION = "terminate-retired-editor-gateway-worker-408"
FIRST_RETIRED_OBSERVATION = 1794583185.346143  # 2026-11-13T15:19:45.346143Z
MINIMUM_RETIRED_SECONDS = 1900
HELPER_NAME = "editor-retired-gateway-408-20261114"
PROJECT = "zoj-editor"
MASTER_HOST = 3602572
MASTER_START = 225755805
TARGET_HOST = 3698868
TARGET_NS = 408
TARGET_START = 243953669
CURRENT_HOST = (3960785, 3960786, 3960787, 3960788, 3960789, 3960791)
CURRENT_NS = (7008, 7009, 7010, 7011, 7012, 7013)
CURRENT_START_BY_HOST = {
    3960785: 244908369, 3960786: 244908369, 3960787: 244908369,
    3960788: 244908369, 3960789: 244908369, 3960791: 244908370,
}
CONFIG = Path("/srv/zoj-editor/config")
NAMESPACE_REFUSALS = frozenset({
    "process_metadata_unavailable", "master_missing", "master_identity_changed",
    "master_namespace_changed", "current_worker_missing", "current_worker_identity_changed",
    "current_worker_namespace_changed", "retired_worker_identity_changed",
    "retired_worker_namespace_changed", "worker_generation_order_changed",
    "namespace_helper_not_root", "pidfd_open_permission_denied", "pidfd_open_failed",
    "pidfd_signal_permission_denied", "pidfd_signal_failed", "retired_worker_did_not_exit",
    "unexpected_namespace_error",
})


class Refused(Exception):
    """Only constant, non-sensitive refusal codes reach logs."""

    def __init__(self, code, *, stage="guard", diagnostic=None):
        super().__init__(code)
        self.stage = stage
        self.diagnostic = diagnostic


def require(condition, code):
    if not condition:
        raise Refused(code)


def command_error(stderr):
    text = stderr.lower()
    if "template parsing error" in text or "map has no entry for key" in text:
        return "docker_template_error"
    if "permission denied" in text:
        return "docker_permission_denied"
    if "cannot connect to the docker daemon" in text:
        return "docker_daemon_unavailable"
    if "no such object" in text or "no such container" in text:
        return "docker_container_missing"
    if "no such image" in text:
        return "docker_image_missing"
    if "operation not permitted" in text:
        return "docker_operation_not_permitted"
    if "apparmor" in text:
        return "docker_apparmor_error"
    if "seccomp" in text:
        return "docker_seccomp_error"
    if "executable file not found" in text:
        return "docker_executable_missing"
    if "oci runtime" in text or "failed to create task" in text:
        return "docker_oci_runtime_failed"
    if "out of memory" in text:
        return "docker_memory_error"
    for exception, code in [
        ("AttributeError:", "namespace_python_attribute_error"),
        ("ModuleNotFoundError:", "namespace_python_module_missing"),
        ("ImportError:", "namespace_python_import_error"),
        ("SyntaxError:", "namespace_python_syntax_error"),
        ("PermissionError:", "namespace_python_permission_error"),
        ("TypeError:", "namespace_python_type_error"),
    ]:
        if exception in stderr:
            return code
    return "docker_command_failed"


def private_namespace_diagnostic(result, stage):
    """Persist only this fixed, credential-free helper's failure privately."""
    summary = {"docker_exit_code": result.returncode,
               "stdout_bytes": len(result.stdout.encode()),
               "stderr_bytes": len(result.stderr.encode())}
    root = os.environ.get("RUNNER_TEMP")
    if root:
        path = Path(root) / "retired-gateway-namespace-diagnostic.json"
        data = {"stage": stage, **summary,
                "stdout": result.stdout[-16384:], "stderr": result.stderr[-16384:]}
        try:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, "w") as stream:
                json.dump(data, stream)
            summary["private_diagnostic_saved"] = True
        except OSError:
            summary["private_diagnostic_saved"] = False
    return summary


def run(args, *, input=None, timeout=30, stage="docker_operation"):
    try:
        result = subprocess.run(
            args, input=input, text=True, capture_output=True, timeout=timeout,
        )
    except OSError:
        raise Refused("command_unavailable", stage=stage) from None
    except subprocess.TimeoutExpired:
        raise Refused("command_timed_out", stage=stage) from None
    if result.returncode != 0:
        diagnostic = None
        if stage in {"retired_worker_namespace_helper", "retired_worker_namespace_inspect"}:
            diagnostic = private_namespace_diagnostic(result, stage)
            try:
                inner = json.loads(result.stdout)
            except (ValueError, TypeError):
                inner = {}
            if isinstance(inner, dict) and inner.get("outcome") == "refused" and inner.get("code") in NAMESPACE_REFUSALS:
                raise Refused(inner["code"], stage=stage, diagnostic=diagnostic)
        code = "docker_process_killed" if result.returncode == 137 else command_error(result.stderr)
        raise Refused(code, stage=stage, diagnostic=diagnostic)
    return result.stdout


def process(pid, root=Path("/proc")):
    path = root / str(pid)
    try:
        raw = (path / "stat").read_text()
        tail = raw[raw.rfind(")") + 2:].split()
        cmd = (path / "cmdline").read_bytes().replace(b"\0", b" ").strip()
        status = (path / "status").read_text().splitlines()
        ns = next(row.split(":", 1)[1].split() for row in status if row.startswith("NSpid:"))
        cgroup = (path / "cgroup").read_text()
    except FileNotFoundError:
        return None
    except (PermissionError, StopIteration, ValueError, IndexError):
        raise Refused("process_metadata_unavailable") from None
    kind = "unexpected"
    if cmd == b"nginx: worker process is shutting down":
        kind = "retired"
    elif cmd == b"nginx: worker process":
        kind = "current"
    elif cmd.startswith(b"nginx: master process "):
        kind = "master"
    return {
        "pid": pid, "ppid": int(tail[1]), "start_ticks": int(tail[19]),
        "nspid": [int(value) for value in ns], "kind": kind,
        "expected_container": "docker-" + CONTAINER + ".scope" in cgroup,
    }


def validate_processes(read=process, *, namespace=False):
    master_id = 1 if namespace else MASTER_HOST
    target_id = TARGET_NS if namespace else TARGET_HOST
    master = read(master_id)
    require(master is not None, "master_missing")
    require(master["kind"] == "master" and master["start_ticks"] == MASTER_START,
            "master_identity_changed")
    require(master["nspid"] == ([1] if namespace else [MASTER_HOST, 1]),
            "master_namespace_changed")
    if not namespace:
        require(master["expected_container"], "master_container_changed")
    for host_pid, ns_pid in zip(CURRENT_HOST, CURRENT_NS):
        row = read(ns_pid if namespace else host_pid)
        require(row is not None, "current_worker_missing")
        require(row["kind"] == "current" and row["ppid"] == master_id
                and row["start_ticks"] == CURRENT_START_BY_HOST[host_pid],
                "current_worker_identity_changed")
        require(row["nspid"] == ([ns_pid] if namespace else [host_pid, ns_pid]),
                "current_worker_namespace_changed")
        if not namespace:
            require(row["expected_container"], "current_worker_container_changed")
    target = read(target_id)
    if target is None:
        return False
    require(target["kind"] == "retired" and target["ppid"] == master_id
            and target["start_ticks"] == TARGET_START,
            "retired_worker_identity_changed")
    require(target["nspid"] == ([TARGET_NS] if namespace else [TARGET_HOST, TARGET_NS]),
            "retired_worker_namespace_changed")
    if not namespace:
        require(target["expected_container"], "retired_worker_container_changed")
    require(TARGET_START < min(CURRENT_START_BY_HOST.values()), "worker_generation_order_changed")
    return True


def namespace_action(*, read=process, open_pidfd=os.pidfd_open,
                     send=signal.pidfd_send_signal, close=os.close,
                     monotonic=time.monotonic, sleep=time.sleep):
    """pidfd binds the signal to this process, never a reused numeric PID."""
    require(os.getuid() == 0, "namespace_helper_not_root")
    if not validate_processes(read, namespace=True):
        return {"outcome": "already_gone", "signal_sent": False}
    try:
        fd = open_pidfd(TARGET_NS, 0)
    except ProcessLookupError:
        return {"outcome": "already_gone", "signal_sent": False}
    except PermissionError:
        raise Refused("pidfd_open_permission_denied") from None
    except OSError:
        raise Refused("pidfd_open_failed") from None
    try:
        # Validate again after pidfd_open. A different/reused /proc PID refuses;
        # an exited original pidfd cannot ever point at its replacement.
        if not validate_processes(read, namespace=True):
            return {"outcome": "already_gone", "signal_sent": False}
        try:
            send(fd, signal.SIGTERM, None, 0)
        except ProcessLookupError:
            return {"outcome": "already_gone", "signal_sent": False}
        except PermissionError:
            raise Refused("pidfd_signal_permission_denied") from None
        except OSError:
            raise Refused("pidfd_signal_failed") from None
        deadline = monotonic() + 10
        while read(TARGET_NS) is not None:
            require(monotonic() < deadline, "retired_worker_did_not_exit")
            sleep(0.1)
        validate_processes(read, namespace=True)
        return {"outcome": "retired_worker_terminated", "signal_sent": True,
                "target_namespace_pid": TARGET_NS, "signal": "SIGTERM"}
    finally:
        close(fd)


def namespace_inspect(*, read=process, open_pidfd=os.pidfd_open, close=os.close):
    """Check the real restricted namespace profile; never send a signal."""
    require(os.getuid() == 0, "namespace_helper_not_root")
    if not validate_processes(read, namespace=True):
        return {"outcome": "already_gone", "signal_sent": False}
    try:
        fd = open_pidfd(TARGET_NS, 0)
    except ProcessLookupError:
        return {"outcome": "already_gone", "signal_sent": False}
    except PermissionError:
        raise Refused("pidfd_open_permission_denied") from None
    except OSError:
        raise Refused("pidfd_open_failed") from None
    try:
        validate_processes(read, namespace=True)
        return {"outcome": "namespace_inspect_passed", "signal_sent": False,
                "pidfd_open_passed": True}
    finally:
        close(fd)


INSPECT_FORMAT = (
    '{"id":{{json .Id}},"image_reference":{{json .Config.Image}},'
    '"image_id":{{json .Image}},"pid":{{json .State.Pid}},'
    '"image_manifest_digest":{{with (index . "ImageManifestDescriptor")}}{{json (index . "digest")}}{{else}}null{{end}},'
    '"running":{{json .State.Running}},"status":{{json .State.Status}},'
    '"health":{{with (index .State "Health")}}{{json (index . "Status")}}{{else}}"none"{{end}},'
    '"project":{{json (index .Config.Labels "com.docker.compose.project")}},'
    '"service":{{json (index .Config.Labels "com.docker.compose.service")}}}'
)


def snapshot():
    ids = run(["docker", "ps", "-a", "-q", "--no-trunc", "--filter",
               "label=com.docker.compose.project=" + PROJECT],
              stage="container_list").split()
    require(bool(ids), "editor_containers_missing")
    rows = [json.loads(line) for line in run(
        ["docker", "inspect", "--format", INSPECT_FORMAT, *ids],
        stage="container_inspect",
    ).splitlines()]
    require(len(rows) == len(ids), "container_snapshot_incomplete")
    require(all(row["project"] == PROJECT for row in rows), "unexpected_project")
    require(len({row["service"] for row in rows}) == len(rows), "duplicate_service")
    return {row["service"]: row for row in rows}


def read_release():
    require(not (CONFIG / "recovery-required").exists(), "recovery_required")
    values = {}
    for line in (CONFIG / "release.env").read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        require(bool(separator) and key not in values, "invalid_release_metadata")
        values[key] = value
    return values


def validate_release(values, rows):
    require(values.get("EDITOR_DEPLOY_MODE") == "blue-green", "deployment_mode_changed")
    slot = values.get("EDITOR_ACTIVE_SLOT")
    worker = values.get("EDITOR_WORKER_SERVICE")
    require(slot in {"blue", "green"}, "active_slot_invalid")
    require(worker in {"worker-blue", "worker-green"}, "worker_slot_invalid")
    require(values.get("EDITOR_API_IMAGE") == "zoj-editor-api:" + API_SHA,
            "api_release_changed")
    require(values.get("EDITOR_FRONTEND_IMAGE") == "zoj-editor-frontend:" + UI_SHA,
            "frontend_release_changed")
    expected = {"frontend", "internal-gateway", "db", worker,
                "api-" + slot, "frontend-" + slot}
    require(expected <= rows.keys(), "required_service_missing")
    gateway = rows["frontend"]
    require(gateway["id"] == CONTAINER and gateway["pid"] == MASTER_HOST
            and gateway["running"], "gateway_container_changed")
    for name in expected:
        require(rows[name]["running"], "required_service_not_running")
        require(rows[name]["health"] in {"healthy", "none"}, "required_service_unhealthy")
    api = rows["api-" + slot]
    require(api["image_reference"] == "zoj-editor-api:" + API_SHA,
            "active_api_image_changed")
    require(rows["frontend-" + slot]["image_reference"] == "zoj-editor-frontend:" + UI_SHA,
            "active_frontend_image_changed")
    require(bool(re.fullmatch(r"sha256:[a-f0-9]{64}", api["image_id"])),
            "api_image_id_invalid")
    return api["image_id"]


def check_unchanged(before, after):
    require(before == after, "editor_container_state_changed")


def public_health():
    query = "?retired-worker-check=" + str(time.time_ns())
    values = {}
    for path in ["/api/health", "/release.txt"]:
        req = urllib.request.Request(
            "https://editor.zoj.kr" + path + query,
            headers={"Connection": "close", "Cache-Control": "no-cache"},
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            body = response.read(4096)
        values[path] = json.loads(body) if path == "/api/health" else body.decode().strip()
    require(values["/api/health"].get("status") == "ok"
            and values["/api/health"].get("release") == API_SHA,
            "public_api_health_changed")
    require(values["/release.txt"] == UI_SHA, "public_frontend_release_changed")
    return {"api_status": "ok", "api_release": API_SHA, "frontend_release": UI_SHA}


def resolve_helper_reference(image, manifest_digest=None, *, index_digest=None):
    """Resolve only locally installed bytes equal to the serving API image."""
    require(bool(re.fullmatch(r"sha256:[a-f0-9]{64}", image)), "helper_image_invalid")
    require(manifest_digest is None or isinstance(manifest_digest, str)
            and bool(re.fullmatch(r"sha256:[a-f0-9]{64}", manifest_digest)),
            "active_api_manifest_invalid")
    require(index_digest is None or isinstance(index_digest, str)
            and bool(re.fullmatch(r"sha256:[a-f0-9]{64}", index_digest)),
            "reviewed_index_digest_invalid")
    candidates = []
    if manifest_digest:
        candidates += [("manifest", manifest_digest),
                       ("repository_manifest", "zoj-editor-api@" + manifest_digest)]
    if index_digest:
        candidates.append(("reviewed_index", index_digest))
    candidates += [("config_digest", image), ("release_tag", "zoj-editor-api:" + API_SHA)]
    observed = []
    for kind, reference in candidates:
        try:
            raw = run(["docker", "image", "inspect", "--format", IMAGE_FORMAT, reference],
                      stage="helper_image_resolution")
        except Refused as error:
            if str(error) != "docker_image_missing":
                raise
            observed.append({"kind": kind, "available": False})
            continue
        value = json.loads(raw)
        resolved = value.get("id") if isinstance(value, dict) else None
        require(isinstance(resolved, str) and bool(re.fullmatch(r"sha256:[a-f0-9]{64}", resolved)),
                "resolved_helper_image_invalid")
        metadata = {"kind": kind, "available": True, "image_id": resolved}
        created = value.get("created_at")
        revision = value.get("oci_revision")
        if isinstance(created, str) and re.fullmatch(r"[0-9T:.Z+-]{20,40}", created):
            metadata["created_at"] = created
        if isinstance(revision, str) and re.fullmatch(r"[a-f0-9]{40}", revision):
            metadata["oci_revision"] = revision
        observed.append(metadata)
        if resolved == image:
            return reference
    raise Refused("active_api_runtime_unavailable", stage="helper_image_resolution",
                  diagnostic={"expected_image_id": image, "active_manifest_digest": manifest_digest,
                              "candidates": observed})


IMAGE_FORMAT = (
    '{"id":{{json .Id}},"created_at":{{json .Created}},'
    '"oci_revision":{{json (index .Config.Labels "org.opencontainers.image.revision")}}}'
)


def resolve_helper_runtime(image, manifest_digest=None):
    try:
        reference = resolve_helper_reference(image, manifest_digest)
        return {"image_id": image, "reference": reference, "active_image_id": image,
                "active_manifest_digest": manifest_digest, "matches_active_api": True,
                "provenance": "serving_api_image"}
    except Refused as error:
        if str(error) != "active_api_runtime_unavailable":
            raise
        active_lookup = error.diagnostic
    # An operator reviewed these exact build bytes before adding this fallback.
    # An arbitrary replacement under the release tag never satisfies the pin.
    try:
        reference = resolve_helper_reference(REVIEWED_RUNTIME_IMAGE, REVIEWED_RUNTIME_MANIFEST,
                                             index_digest=REVIEWED_RUNTIME_INDEX)
    except Refused as error:
        if str(error) != "active_api_runtime_unavailable":
            raise
        raise Refused("reviewed_tool_runtime_unavailable", stage="helper_image_resolution",
                      diagnostic={"active_lookup": active_lookup,
                                  "reviewed_image_id": REVIEWED_RUNTIME_IMAGE,
                                  "reviewed_index_digest": REVIEWED_RUNTIME_INDEX,
                                  "reviewed_lookup": error.diagnostic,
                                  "provenance": RUNTIME_PROVENANCE}) from None
    return {"image_id": REVIEWED_RUNTIME_IMAGE, "reference": reference,
            "active_image_id": image, "active_manifest_digest": manifest_digest,
            "matches_active_api": False, "active_lookup": active_lookup,
            "reviewed_index_digest": REVIEWED_RUNTIME_INDEX,
            "provenance": RUNTIME_PROVENANCE}


def helper_command(image, *, reference=None, apply=False):
    require(bool(re.fullmatch(r"sha256:[a-f0-9]{64}", image)), "helper_image_invalid")
    reference = reference or "zoj-editor-api:" + API_SHA
    require(reference == "zoj-editor-api:" + API_SHA
            or bool(re.fullmatch(r"(?:zoj-editor-api@)?sha256:[a-f0-9]{64}", reference)),
            "helper_reference_invalid")
    return [
        "docker", "create", "-i", "--pull", "never", "--name", HELPER_NAME,
        "--label", "zoj.maintenance.retired-gateway=" + CONTAINER,
        "--network", "none", "--pid", "container:" + CONTAINER,
        "--read-only", "--cap-drop", "ALL", "--cap-add", "KILL",
        "--security-opt", "no-new-privileges=true", "--user", "0:0",
        "--memory", "64m", "--cpus", "0.25", "--pids-limit", "16",
        # The local reference was resolved against the serving image. Recheck
        # the created container's .Image before permitting any process start.
        "--entrypoint", "python", reference, "-",
        "--namespace-apply" if apply else "--namespace-inspect",
    ]


CREATED_HELPER_FORMAT = (
    '{"id":{{json .Id}},"image_id":{{json .Image}},'
    '"image_reference":{{json .Config.Image}},"running":{{json .State.Running}},'
    '"pid":{{json .State.Pid}},"pid_mode":{{json .HostConfig.PidMode}},'
    '"marker":{{json (index .Config.Labels "zoj.maintenance.retired-gateway")}}}'
)


def validate_created_helper(row, helper_id, image, reference=None, active_image=None):
    require(row.get("id") == helper_id, "created_helper_id_changed")
    if row.get("image_id") != image:
        actual = row.get("image_id")
        raise Refused("helper_runtime_image_mismatch", stage="created_helper_identity",
                      diagnostic={"expected_image_id": image, "active_image_id": active_image or image,
                                  "created_helper_image_id": actual if isinstance(actual, str)
                                  and re.fullmatch(r"sha256:[a-f0-9]{64}", actual) else None,
                                  "reviewed_runtime_provenance": RUNTIME_PROVENANCE})
    require(row.get("image_reference") == (reference or "zoj-editor-api:" + API_SHA),
            "helper_runtime_reference_changed")
    require(row.get("running") is False and row.get("pid") == 0,
            "helper_started_before_validation")
    require(row.get("pid_mode") == "container:" + CONTAINER,
            "helper_pid_namespace_changed")
    require(row.get("marker") == CONTAINER, "helper_marker_changed")


def namespace_check(image, *, reference=None, active_image=None, apply=False):
    require(not run(["docker", "ps", "-a", "-q", "--filter",
                     "name=^/" + HELPER_NAME + "$"],
                    stage="helper_duplicate_check").strip(),
            "maintenance_helper_already_exists")
    helper_id = run(helper_command(image, reference=reference, apply=apply), stage="namespace_helper_create").strip()
    require(bool(re.fullmatch(r"[a-f0-9]{64}", helper_id)), "created_helper_id_invalid")
    def remove():
        run(["docker", "rm", "-f", helper_id], stage="namespace_helper_remove")
    try:
        row = json.loads(run(["docker", "inspect", "--format", CREATED_HELPER_FORMAT, helper_id],
                             stage="created_helper_identity"))
        validate_created_helper(row, helper_id, image, reference, active_image)
        raw = run(["docker", "start", "-a", "-i", helper_id],
                  input=Path(__file__).read_text(), timeout=45,
                  stage="retired_worker_namespace_helper" if apply else "retired_worker_namespace_inspect")
        result = json.loads(raw)
        exit_state = json.loads(run(["docker", "inspect", "--format",
            '{"running":{{json .State.Running}},"exit_code":{{json .State.ExitCode}}}', helper_id],
            stage="namespace_helper_exit_state"))
        if result.get("outcome") == "refused" and result.get("code") in NAMESPACE_REFUSALS:
            raise Refused(result["code"],
                stage="retired_worker_namespace_helper" if apply else "retired_worker_namespace_inspect",
                diagnostic={"container_exit_code": exit_state.get("exit_code")})
        require(exit_state.get("running") is False and exit_state.get("exit_code") == 0,
                "namespace_helper_exit_failed")
        allowed = {"already_gone", "retired_worker_terminated"} if apply else {"already_gone", "namespace_inspect_passed"}
        require(result.get("outcome") in allowed, "namespace_helper_refused")
        require(apply or result.get("signal_sent") is False, "namespace_inspect_reported_signal")
    except BaseException:
        try:
            remove()
        except Refused:
            pass
        raise
    remove()
    result["runtime_image_matches_reviewed_runtime"] = True
    result["runtime_image_matches_active_api"] = image == (active_image or image)
    result["created_helper_image_id"] = row["image_id"]
    return result


def maintenance(apply=False, confirmation=""):
    require(socket.gethostname() == "zoj-editor", "unexpected_host")
    require(time.time() - FIRST_RETIRED_OBSERVATION > MINIMUM_RETIRED_SECONDS,
            "minimum_retirement_grace_not_elapsed")
    require(not apply or confirmation == CONFIRMATION, "explicit_confirmation_required")
    with (CONFIG / "deploy.lock").open("r+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Refused("deployment_or_backup_in_progress") from None
        release = read_release()
        before = snapshot()
        image = validate_release(release, before)
        health_before = public_health()
        target_present = validate_processes()
        report = {
            "mode": "apply" if apply else "inspect",
            "checked_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "gateway_container": CONTAINER, "target_host_pid": TARGET_HOST,
            "target_namespace_pid": TARGET_NS, "target_start_ticks": TARGET_START,
            "retired_target_present": target_present,
            "health_before": health_before, "signal_sent": False,
            "risk": "Retired worker connections are not proven to be SSE-only.",
        }
        if target_present:
            api = before["api-" + release["EDITOR_ACTIVE_SLOT"]]
            runtime = resolve_helper_runtime(image, api.get("image_manifest_digest"))
            report["tool_runtime"] = runtime
            report["namespace_inspection"] = namespace_check(runtime["image_id"],
                reference=runtime["reference"], active_image=image)
        if apply and target_present:
            # Recheck all containers, routes and identities immediately before
            # creating a short-lived helper in this gateway's PID namespace.
            check_unchanged(before, snapshot())
            require(read_release() == release, "release_metadata_changed")
            public_health()
            validate_processes()
            result = namespace_check(runtime["image_id"], reference=runtime["reference"],
                                     active_image=image, apply=True)
            report.update(result)
        else:
            report["outcome"] = "inspect_only" if target_present else "already_gone"
        check_unchanged(before, snapshot())
        require(read_release() == release, "release_metadata_changed")
        report["health_after"] = public_health()
        report["all_editor_containers_unchanged"] = True
        report["non_front_container_ids"] = sorted(
            row["id"] for service, row in before.items() if service != "frontend"
        )
        return report


def main():
    if sys.argv[1:] in (["--namespace-apply"], ["--namespace-inspect"]):
        # No environment, application imports, network, mounts or user data.
        try:
            result = namespace_action() if sys.argv[1:] == ["--namespace-apply"] else namespace_inspect()
        except Refused:
            raise
        except Exception:
            raise Refused("unexpected_namespace_error") from None
        print(json.dumps(result, sort_keys=True))
        return
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirmation", default="")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = maintenance(args.apply, args.confirmation)
    if args.output:
        with args.output.open("w") as stream:
            os.chmod(args.output, 0o600)
            json.dump(result, stream, indent=2)
            stream.write("\n")
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except Refused as exc:
        result = {"outcome": "refused", "stage": exc.stage, "code": str(exc)}
        if exc.diagnostic is not None:
            result["diagnostic"] = exc.diagnostic
        print(json.dumps(result))
        sys.exit(1)
    except Exception:
        # Never echo Docker stderr, environment values or private file contents.
        print(json.dumps({"outcome": "refused", "code": "unexpected_maintenance_error"}))
        sys.exit(1)
