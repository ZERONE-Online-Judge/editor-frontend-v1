#!/usr/bin/env bash
# Deploy static UI without draining jobs or requiring an available judge agent.
set -euo pipefail
umask 077
event_sha=${1:?Full tested main commit SHA}
[[ $event_sha =~ ^[a-f0-9]{40}$ ]] || exit 2
root=/srv/zoj-editor
source_root=/srv/editor-source
env_file="$root/config/editor.env"
release_file="$root/config/release.env"
frontend="$source_root/editor_frontend_v1"
backend="$source_root/editor_backend_v1"
[[ -r "$env_file" && -r "$release_file" ]] || exit 1
exec 9>"$root/config/deploy.lock"
flock -w 2400 9
for part in frontend backend; do
    repo="$source_root/editor_${part}_v1"
    [[ $(git -C "$repo" remote get-url origin) == "https://github.com/ZERONE-Online-Judge/editor-$part-v1.git" ]] || exit 1
    [[ -z $(git -C "$repo" status --porcelain) ]] || { echo "Uncommitted server changes in $part; deployment stopped." >&2; exit 1; }
done
git -C "$frontend" fetch origin main
if [[ $(git -C "$frontend" rev-parse origin/main) != "$event_sha" ]]; then
    echo 'Skip a superseded frontend deployment.'
    exit 0
fi
backend_sha=$(sed -n 's/^EDITOR_API_IMAGE=zoj-editor-api://p' "$release_file")
old_image=$(sed -n 's/^EDITOR_FRONTEND_IMAGE=//p' "$release_file")
[[ $backend_sha =~ ^[a-f0-9]{40}$ && $old_image =~ ^zoj-editor-frontend:[a-f0-9]{40}$ ]] || exit 1
[[ $(git -C "$backend" rev-parse HEAD) == "$backend_sha" ]] || { echo 'Backend checkout differs from its healthy release; stop before changing containers.' >&2; exit 1; }
git -C "$frontend" checkout --detach "$event_sha"
cd "$backend/deploy"
compose=(docker compose --project-name zoj-editor --env-file "$env_file" --env-file "$release_file" -f compose.yaml)
"${compose[@]}" config --quiet
api_before=$("${compose[@]}" ps -q --status running api)
worker_before=$("${compose[@]}" ps -q --status running worker)
old_container=$("${compose[@]}" ps -q --status running frontend)
[[ -n "$api_before" && -n "$worker_before" && -n "$old_container" ]] || exit 1
[[ $(docker inspect --format '{{.Config.Image}}' "$old_container") == "$old_image" ]] || { echo 'Running frontend differs from its release; inspect before continuing.' >&2; exit 1; }
docker image inspect "$old_image" >/dev/null
new_image="zoj-editor-frontend:$event_sha"
docker build -t "$new_image" "$frontend"
export EDITOR_FRONTEND_IMAGE="$new_image"
rollback() {
    trap - ERR
    echo 'Frontend activation failed; restoring the previous frontend image.' >&2
    export EDITOR_FRONTEND_IMAGE="$old_image"
    "${compose[@]}" up -d --no-deps --no-build frontend || true
}
trap rollback ERR
"${compose[@]}" up -d --no-deps --no-build frontend
container=$("${compose[@]}" ps -q --status running frontend)
[[ -n "$container" ]]
[[ $(docker inspect --format '{{.Config.Image}}' "$container") == "$new_image" ]]
docker exec "$container" nginx -t
docker exec "$container" test -s /usr/share/nginx/html/index.html
[[ $("${compose[@]}" ps -q --status running api) == "$api_before" ]]
[[ $("${compose[@]}" ps -q --status running worker) == "$worker_before" ]]
python3 - "$release_file" "$new_image" <<'PY'
import os, sys, tempfile
from pathlib import Path
path, image = Path(sys.argv[1]), sys.argv[2]
lines = path.read_text().splitlines()
assert sum(line.startswith('EDITOR_FRONTEND_IMAGE=') for line in lines) == 1
contents = '\n'.join('EDITOR_FRONTEND_IMAGE=' + image if line.startswith('EDITOR_FRONTEND_IMAGE=') else line for line in lines) + '\n'
fd, temporary = tempfile.mkstemp(prefix='release.env.', dir=path.parent)
try:
    with os.fdopen(fd, 'w') as file:
        file.write(contents)
        file.flush()
        os.fsync(file.fileno())
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY
trap - ERR
echo "Editor frontend deployed: $event_sha; API and worker unchanged."
