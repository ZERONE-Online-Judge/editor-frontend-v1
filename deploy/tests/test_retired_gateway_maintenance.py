import copy
import fcntl
import importlib.util
import itertools
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).parents[1] / "retired-gateway-maintenance.py"
spec = importlib.util.spec_from_file_location("retired_gateway", SCRIPT)
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)


def processes(namespace=False):
    entries = {}
    master = 1 if namespace else tool.MASTER_HOST

    def row(host, ns, kind, start):
        return {"pid": ns if namespace else host, "ppid": master,
                "kind": kind, "start_ticks": start,
                "nspid": [ns] if namespace else [host, ns],
                "expected_container": True}

    entries[master] = row(tool.MASTER_HOST, 1, "master", tool.MASTER_START)
    target = tool.TARGET_NS if namespace else tool.TARGET_HOST
    entries[target] = row(tool.TARGET_HOST, tool.TARGET_NS, "retired", tool.TARGET_START)
    for host, ns in zip(tool.CURRENT_HOST, tool.CURRENT_NS):
        entries[ns if namespace else host] = row(host, ns, "current", tool.CURRENT_START)
    return entries


def release():
    return {"EDITOR_DEPLOY_MODE": "blue-green", "EDITOR_ACTIVE_SLOT": "green",
            "EDITOR_WORKER_SERVICE": "worker-green",
            "EDITOR_API_IMAGE": "zoj-editor-api:" + tool.API_SHA,
            "EDITOR_FRONTEND_IMAGE": "zoj-editor-frontend:" + tool.UI_SHA}


def containers():
    entries = {}
    for index, service in enumerate(["frontend", "internal-gateway", "db", "worker-green",
                                     "api-green", "frontend-green", "api-blue"]):
        entries[service] = {"id": str(index) * 64, "pid": 1000 + index,
                            "image_reference": "unused", "image_id": "sha256:" + "b" * 64,
                            "running": True, "status": "running", "health": "healthy",
                            "project": tool.PROJECT, "service": service}
    entries["frontend"].update(id=tool.CONTAINER, pid=tool.MASTER_HOST)
    entries["api-green"]["image_reference"] = "zoj-editor-api:" + tool.API_SHA
    entries["frontend-green"]["image_reference"] = "zoj-editor-frontend:" + tool.UI_SHA
    return entries


class IdentityTests(unittest.TestCase):
    def test_exact_host_and_namespace_identities_are_accepted(self):
        for namespace in [False, True]:
            rows = processes(namespace)
            self.assertTrue(tool.validate_processes(rows.get, namespace=namespace))

    def test_pinned_process_field_mismatches_refuse(self):
        cases = [
            (tool.TARGET_HOST, "start_ticks", tool.TARGET_START + 1),
            (tool.TARGET_HOST, "kind", "current"),
            (tool.TARGET_HOST, "ppid", 999),
            (tool.TARGET_HOST, "nspid", [tool.TARGET_HOST, 345]),
            (tool.TARGET_HOST, "expected_container", False),
            (tool.MASTER_HOST, "kind", "current"),
            (tool.MASTER_HOST, "start_ticks", tool.MASTER_START + 1),
            (tool.MASTER_HOST, "nspid", [tool.MASTER_HOST, 2]),
            (tool.MASTER_HOST, "expected_container", False),
            (tool.CURRENT_HOST[0], "kind", "retired"),
            (tool.CURRENT_HOST[0], "start_ticks", tool.CURRENT_START + 1),
            (tool.CURRENT_HOST[0], "ppid", 999),
            (tool.CURRENT_HOST[0], "nspid", [tool.CURRENT_HOST[0], 999]),
            (tool.CURRENT_HOST[0], "expected_container", False),
        ]
        for pid, key, value in cases:
            with self.subTest(pid=pid, key=key):
                rows = processes()
                rows[pid][key] = value
                with self.assertRaises(tool.Refused):
                    tool.validate_processes(rows.get)

    def test_missing_master_or_current_worker_refuses(self):
        for pid in [tool.MASTER_HOST, *tool.CURRENT_HOST]:
            with self.subTest(pid=pid):
                rows = processes()
                del rows[pid]
                with self.assertRaises(tool.Refused):
                    tool.validate_processes(rows.get)

    def test_already_gone_target_does_not_refuse_healthy_generation(self):
        rows = processes()
        del rows[tool.TARGET_HOST]
        self.assertFalse(tool.validate_processes(rows.get))

    def test_process_parser_handles_spaces_and_parentheses_in_comm(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory) / str(tool.TARGET_HOST)
            p.mkdir()
            tail = ["S", str(tool.MASTER_HOST)] + ["0"] * 18
            tail[19] = str(tool.TARGET_START)
            (p / "stat").write_text(f"{tool.TARGET_HOST} (nginx (worker)) " + " ".join(tail))
            (p / "cmdline").write_bytes(b"nginx: worker process is shutting down\0\0")
            (p / "status").write_text(f"NSpid:\t{tool.TARGET_HOST}\t{tool.TARGET_NS}\n")
            (p / "cgroup").write_text("0::/system.slice/docker-" + tool.CONTAINER + ".scope\n")
            row = tool.process(tool.TARGET_HOST, Path(directory))
            self.assertEqual(row["kind"], "retired")
            self.assertEqual(row["start_ticks"], tool.TARGET_START)
            self.assertEqual(row["ppid"], tool.MASTER_HOST)


class SignalTests(unittest.TestCase):
    def execute(self, rows, *, open_override=None, send_override=None, clock=None):
        opened, sent, closed = [], [], []

        def open_fd(pid, flags):
            opened.append((pid, flags))
            if open_override:
                open_override()
            return 77

        def send_fd(fd, sig, info, flags):
            sent.append((fd, sig, info, flags))
            if send_override:
                send_override()
            else:
                rows.pop(tool.TARGET_NS, None)

        with patch.object(tool.os, "getuid", return_value=0):
            result = tool.namespace_action(
                read=rows.get, open_pidfd=open_fd, send=send_fd,
                close=closed.append, sleep=lambda _: None,
                monotonic=clock or (lambda: 0),
            )
        return result, opened, sent, closed

    def test_apply_signals_only_the_open_pidfd(self):
        rows = processes(True)
        protected = {key: copy.deepcopy(value) for key, value in rows.items() if key != tool.TARGET_NS}
        result, opened, sent, closed = self.execute(rows)
        self.assertEqual(opened, [(tool.TARGET_NS, 0)])
        self.assertEqual(sent, [(77, signal.SIGTERM, None, 0)])
        self.assertEqual(closed, [77])
        self.assertEqual(result["outcome"], "retired_worker_terminated")
        self.assertEqual(rows, protected)

    def test_target_reused_between_first_check_and_pidfd_open_is_never_signalled(self):
        rows = processes(True)

        def reuse():
            rows[tool.TARGET_NS]["start_ticks"] += 1

        sends, closes = [], []
        with patch.object(tool.os, "getuid", return_value=0):
            def open_fd(pid, flags):
                reuse()
                return 77
            with self.assertRaisesRegex(tool.Refused, "retired_worker_identity_changed"):
                tool.namespace_action(read=rows.get, open_pidfd=open_fd,
                                      send=lambda *args: sends.append(args), close=closes.append)
        self.assertEqual(sends, [])
        self.assertEqual(closes, [77])

    def test_target_disappears_after_pidfd_open_no_signal(self):
        rows = processes(True)
        result, opened, sent, closed = self.execute(
            rows, open_override=lambda: rows.pop(tool.TARGET_NS),
        )
        self.assertEqual(result["outcome"], "already_gone")
        self.assertEqual(sent, [])
        self.assertEqual(closed, [77])

    def test_already_gone_target_never_opens_pidfd(self):
        rows = processes(True)
        rows.pop(tool.TARGET_NS)
        result, opened, sent, closed = self.execute(rows)
        self.assertFalse(result["signal_sent"])
        self.assertEqual((opened, sent, closed), ([], [], []))

    def test_changed_master_refuses_before_any_pidfd_or_signal(self):
        rows = processes(True)
        rows[1]["start_ticks"] += 1
        opens, sends = [], []
        with patch.object(tool.os, "getuid", return_value=0):
            with self.assertRaises(tool.Refused):
                tool.namespace_action(read=rows.get,
                                      open_pidfd=lambda *a: opens.append(a),
                                      send=lambda *a: sends.append(a))
        self.assertEqual((opens, sends), ([], []))

    def test_signal_not_delivered_fails_without_kill_fallback(self):
        rows = processes(True)
        ticks = itertools.count(step=5)
        with self.assertRaisesRegex(tool.Refused, "retired_worker_did_not_exit"):
            self.execute(rows, send_override=lambda: None, clock=lambda: next(ticks))
        self.assertIn(tool.TARGET_NS, rows)

    def test_insufficient_namespace_permissions_refuse(self):
        with patch.object(tool.os, "getuid", return_value=999):
            with self.assertRaisesRegex(tool.Refused, "namespace_helper_not_root"):
                tool.namespace_action()

    @unittest.skipUnless(hasattr(os, "pidfd_open"), "Linux pidfd required")
    def test_real_pidfd_terminates_only_our_isolated_child(self):
        target = subprocess.Popen([sys.executable, "-c", "import time;time.sleep(30)"])
        protected = subprocess.Popen([sys.executable, "-c", "import time;time.sleep(30)"])
        rows = processes(True)

        def read(pid):
            if pid == tool.TARGET_NS and target.poll() is not None:
                return None
            return rows.get(pid)

        try:
            with patch.object(tool.os, "getuid", return_value=0):
                result = tool.namespace_action(
                    read=read,
                    open_pidfd=lambda _pid, flags: os.pidfd_open(target.pid, flags),
                )
            self.assertTrue(result["signal_sent"])
            self.assertEqual(target.wait(timeout=2), -signal.SIGTERM)
            self.assertIsNone(protected.poll())
        finally:
            for child in [target, protected]:
                if child.poll() is None:
                    child.terminate()
                child.wait(timeout=2)


class ReleaseTests(unittest.TestCase):
    def test_exact_release_accepts_only_immutable_api_image(self):
        self.assertEqual(tool.validate_release(release(), containers()), "sha256:" + "b" * 64)

    def test_changed_metadata_or_container_refuses(self):
        for key, value in [
            ("EDITOR_DEPLOY_MODE", "legacy"), ("EDITOR_ACTIVE_SLOT", "other"),
            ("EDITOR_WORKER_SERVICE", "worker"), ("EDITOR_API_IMAGE", "changed"),
            ("EDITOR_FRONTEND_IMAGE", "changed"),
        ]:
            with self.subTest(key=key):
                values = release()
                values[key] = value
                with self.assertRaises(tool.Refused):
                    tool.validate_release(values, containers())
        for service, key, value in [
            ("frontend", "id", "x" * 64), ("frontend", "pid", 999),
            ("frontend", "running", False), ("worker-green", "health", "unhealthy"),
            ("api-green", "image_id", "zoj-editor-api:mutable"),
            ("api-green", "image_reference", "changed"),
            ("frontend-green", "image_reference", "changed"),
        ]:
            with self.subTest(service=service, key=key):
                rows = containers()
                rows[service][key] = value
                with self.assertRaises(tool.Refused):
                    tool.validate_release(release(), rows)

    def test_non_front_id_or_health_change_is_reported(self):
        before, after = containers(), containers()
        tool.check_unchanged(before, after)
        after["worker-green"]["id"] = "f" * 64
        with self.assertRaisesRegex(tool.Refused, "editor_container_state_changed"):
            tool.check_unchanged(before, after)

    def test_helper_has_no_network_host_pid_namespace_mounts_or_application_entrypoint(self):
        command = tool.helper_command("sha256:" + "c" * 64)
        self.assertEqual(command[command.index("--network") + 1], "none")
        self.assertEqual(command[command.index("--pid") + 1], "container:" + tool.CONTAINER)
        self.assertEqual(command[command.index("--cap-drop") + 1], "ALL")
        self.assertEqual(command[command.index("--cap-add") + 1], "KILL")
        self.assertEqual(command[command.index("--entrypoint") + 1], "python")
        self.assertEqual(command[command.index("--pull") + 1], "never")
        self.assertNotIn("--privileged", command)
        for forbidden in ["-v", "--mount", "--env", "-e", "--env-file"]:
            self.assertNotIn(forbidden, command)
        self.assertIn("--read-only", command)
        self.assertIn("no-new-privileges=true", command)

    def test_mutable_helper_image_refuses(self):
        with self.assertRaises(tool.Refused):
            tool.helper_command("zoj-editor-api:latest")

    def test_default_inspect_uses_only_no_signal_namespace_check(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "deploy.lock").touch()
            with patch.object(tool, "CONFIG", root), \
                    patch.object(tool.socket, "gethostname", return_value="zoj-editor"), \
                    patch.object(tool, "read_release", side_effect=release), \
                    patch.object(tool, "snapshot", side_effect=containers), \
                    patch.object(tool, "public_health", return_value={"ok": True}), \
                    patch.object(tool, "validate_processes", return_value=True), \
                    patch.object(tool, "namespace_check", return_value={"outcome": "namespace_inspect_passed", "signal_sent": False}) as namespace, \
                    patch.object(tool, "run") as command:
                result = tool.maintenance()
            self.assertEqual(result["outcome"], "inspect_only")
            self.assertFalse(result["signal_sent"])
            namespace.assert_called_once_with("sha256:" + "b" * 64)
            command.assert_not_called()


class CommandDiagnosticsTests(unittest.TestCase):
    def test_canonical_tag_helper_is_not_started_until_image_and_namespace_match(self):
        image = 'sha256:' + 'a' * 64
        helper = 'b' * 64
        row = {'id': helper, 'image_id': image, 'image_reference': 'zoj-editor-api:' + tool.API_SHA,
               'running': False, 'pid': 0, 'pid_mode': 'container:' + tool.CONTAINER,
               'marker': tool.CONTAINER}
        with patch.object(tool, 'run', side_effect=['', helper, json.dumps(row),
                json.dumps({'outcome': 'namespace_inspect_passed', 'signal_sent': False}), '']) as run:
            result = tool.namespace_check(image)
        self.assertTrue(result['runtime_image_matches_active_api'])
        self.assertEqual([x.kwargs['stage'] for x in run.call_args_list],
            ['helper_duplicate_check', 'namespace_helper_create', 'created_helper_identity',
             'retired_worker_namespace_inspect', 'namespace_helper_remove'])
        self.assertEqual(run.call_args_list[1].args[0][1], 'create')
        self.assertEqual(run.call_args_list[3].args[0][:4], ['docker', 'start', '-a', '-i'])

    def test_retagged_image_or_started_helper_is_removed_without_start(self):
        image, helper = 'sha256:' + 'a' * 64, 'b' * 64
        valid = {'id': helper, 'image_id': image, 'image_reference': 'zoj-editor-api:' + tool.API_SHA,
                 'running': False, 'pid': 0, 'pid_mode': 'container:' + tool.CONTAINER,
                 'marker': tool.CONTAINER}
        for key, value in [('image_id', 'sha256:' + 'c' * 64), ('running', True),
                           ('pid_mode', 'host'), ('marker', 'other'), ('id', 'c' * 64),
                           ('image_reference', 'other'), ('pid', 23)]:
            with self.subTest(key=key):
                row = {**valid, key: value}
                with patch.object(tool, 'run', side_effect=['', helper, json.dumps(row), '']) as run:
                    with self.assertRaises(tool.Refused):
                        tool.namespace_check(image)
                self.assertNotIn('retired_worker_namespace_inspect',
                    [x.kwargs['stage'] for x in run.call_args_list])
                self.assertEqual(run.call_args_list[-1].args[0], ['docker', 'rm', '-f', helper])

    def test_namespace_stderr_is_private_and_logs_only_static_summary(self):
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.CompletedProcess(['docker'], 1, 'scoped-output',
                'AttributeError: scoped-private-details')
            with patch.dict(os.environ, {'RUNNER_TEMP': directory}), \
                    patch.object(tool.subprocess, 'run', return_value=result):
                with self.assertRaises(tool.Refused) as error:
                    tool.run(['docker'], stage='retired_worker_namespace_inspect')
            self.assertEqual(str(error.exception), 'namespace_python_attribute_error')
            self.assertEqual(error.exception.diagnostic['docker_exit_code'], 1)
            self.assertNotIn('scoped-private-details', str(error.exception.diagnostic))
            path = Path(directory) / 'retired-gateway-namespace-diagnostic.json'
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(json.loads(path.read_text())['stderr'], result.stderr)

    def test_namespace_inspection_command_cannot_select_apply(self):
        self.assertEqual(tool.helper_command('sha256:' + 'a' * 64)[-1], '--namespace-inspect')
        self.assertEqual(tool.helper_command('sha256:' + 'a' * 64, apply=True)[-1], '--namespace-apply')

    def test_only_whitelisted_inner_refusal_codes_propagate(self):
        for code, expected in [('master_namespace_changed', 'master_namespace_changed'),
                               ('private-secret-value', 'docker_command_failed')]:
            result = subprocess.CompletedProcess(['docker'], 1,
                json.dumps({'outcome': 'refused', 'code': code}), 'private-stderr')
            with patch.object(tool.subprocess, 'run', return_value=result):
                with self.assertRaises(tool.Refused) as error:
                    tool.run(['docker'], stage='retired_worker_namespace_inspect')
            self.assertEqual(str(error.exception), expected)

    def test_real_namespace_inspect_opens_and_closes_pidfd_without_sending_signal(self):
        rows = processes(True)
        opened, closed = [], []
        with patch.object(tool.os, 'getuid', return_value=0):
            result = tool.namespace_inspect(read=rows.get,
                open_pidfd=lambda pid, flags: opened.append((pid, flags)) or 77,
                close=closed.append)
        self.assertEqual(opened, [(tool.TARGET_NS, 0)])
        self.assertEqual(closed, [77])
        self.assertFalse(result['signal_sent'])
        self.assertEqual(result['outcome'], 'namespace_inspect_passed')

    def test_inspection_template_uses_optional_health_map_index(self):
        self.assertNotIn(".State.Health", tool.INSPECT_FORMAT)
        self.assertIn('with (index .State "Health")', tool.INSPECT_FORMAT)

    def test_static_error_class_and_stage_without_raw_stderr(self):
        cases = [
            ('template parsing error: map has no entry for key "Health"', 'docker_template_error'),
            ('permission denied: private-secret-value', 'docker_permission_denied'),
            ('Cannot connect to the Docker daemon: private-secret-value', 'docker_daemon_unavailable'),
            ('No such object: private-secret-value', 'docker_container_missing'),
            ('unspecified failure private-secret-value', 'docker_command_failed'),
        ]
        for stderr, expected in cases:
            with self.subTest(expected=expected):
                result = subprocess.CompletedProcess(['docker'], 1, 'private-output', stderr)
                with patch.object(tool.subprocess, 'run', return_value=result):
                    with self.assertRaises(tool.Refused) as error:
                        tool.run(['docker'], stage='container_inspect')
                self.assertEqual(str(error.exception), expected)
                self.assertEqual(error.exception.stage, 'container_inspect')
                self.assertNotIn('private', str(error.exception))

    def test_container_snapshot_passes_the_inspection_stage(self):
        rows = containers()
        outputs = [' '.join(row['id'] for row in rows.values()),
                   '\n'.join(json.dumps(row) for row in rows.values())]
        with patch.object(tool, 'run', side_effect=outputs) as run:
            self.assertEqual(tool.snapshot(), rows)
        self.assertEqual(run.call_args_list[0].kwargs['stage'], 'container_list')
        self.assertEqual(run.call_args_list[1].kwargs['stage'], 'container_inspect')

    def test_timeout_reports_static_stage_without_command_arguments(self):
        with patch.object(tool.subprocess, 'run', side_effect=subprocess.TimeoutExpired('private-command', 1)):
            with self.assertRaises(tool.Refused) as error:
                tool.run(['docker'], stage='retired_worker_namespace_helper')
        self.assertEqual(str(error.exception), 'command_timed_out')
        self.assertEqual(error.exception.stage, 'retired_worker_namespace_helper')


class ReleasePreflightTests(unittest.TestCase):
    def test_apply_requires_exact_confirmation_before_lock_or_docker(self):
        with patch.object(tool.socket, "gethostname", return_value="zoj-editor"), \
                patch.object(tool, "run") as command:
            with self.assertRaisesRegex(tool.Refused, "explicit_confirmation_required"):
                tool.maintenance(True, "yes")
            command.assert_not_called()

    def test_active_deployment_lock_refuses_without_docker_or_signals(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with (root / "deploy.lock").open("w+") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                with patch.object(tool, "CONFIG", root), \
                        patch.object(tool.socket, "gethostname", return_value="zoj-editor"), \
                        patch.object(tool, "run") as command:
                    with self.assertRaisesRegex(tool.Refused, "deployment_or_backup_in_progress"):
                        tool.maintenance()
                command.assert_not_called()

    def test_pending_recovery_marker_refuses(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "recovery-required").touch()
            with patch.object(tool, "CONFIG", root):
                with self.assertRaisesRegex(tool.Refused, "recovery_required"):
                    tool.read_release()

    def test_before_minimum_retirement_grace_no_operation_is_allowed(self):
        with patch.object(tool.socket, "gethostname", return_value="zoj-editor"), \
                patch.object(tool.time, "time", return_value=tool.FIRST_RETIRED_OBSERVATION + 10), \
                patch.object(tool, "run") as command:
            with self.assertRaisesRegex(tool.Refused, "minimum_retirement_grace_not_elapsed"):
                tool.maintenance(True, tool.CONFIRMATION)
            command.assert_not_called()


if __name__ == "__main__":
    unittest.main()
