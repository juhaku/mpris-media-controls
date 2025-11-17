# Run `just --list` to list available recipes
default:
  @just --list

# Start UI
start-ui:
    @while [[ "$(curl -s -w '%{http_code}' -o /dev/null http://localhost:4433/api/status)" -ne 200 ]]; do echo "waiting for service to start..."; sleep 0.5; done; \
        pushd ui; \
        pnpm dev

# Start API
start-service:
    @pushd service; \
        cargo run

# Run dev stack; start ui and background service
[parallel]
dev: start-service start-ui 

# bar:
#     #!/bin/bash
#     set -eou pipefail
#
#     cat <<EOF | watchmux -c -
#     processes:
#       - title: ui
#         cmd: just start-ui
#       - title: service
#         cmd: just start-service
#     EOF
