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
        RUST_LOG='debug' cargo run

# Run dev stack; start ui and background service
[parallel]
dev: start-service start-ui 

# Build the bundled app from service and UI.
build:
  @pushd ui; \
    IS_PROD=true pnpm build; \
    if [ -d ../service/assets/ ]; then rm -r ../service/assets; fi; \
    cp -r dist ../service/assets;
  @pushd service; \
    cargo build --features embed-ui --release

# Build and run the release binary app
preview: build
  @pushd service; RUST_LOG='info' ./target/release/service

# Install the service locally
install:
  #!/usr/bin/env bash
  set -eu o pipefail

  binary=service/target/release/service
  echo "Insall app binary to {{BLUE}}~/.local/bin/{{NORMAL}}"
  mkdir -p ~/.local/bin
  cp "$binary" ~/.local/bin/
  mv ~/.local/bin/service ~/.local/bin/media-controls 
  chmod +x ~/.local/bin/media-controls

  # Create data directory
  # mkdir -p ~/.local/share/media-controls

  echo "Insall app service file to {{BLUE}}~/.config/systemd/user/{{NORMAL}}"
  mkdir -p ~/.config/systemd/user
  cp media-controls.service ~/.config/systemd/user/

  echo "Enable service"
  systemctl --user daemon-reload
  systemctl --user enable media-controls.service

  echo "MPRIS Media Controls service {{GREEN}}installed successfully{{NORMAL}}"
  echo "Start with: {{BLUE}}systemctl --user start media-controls.service{{NORMAL}}"

# Uninstall already installed app
uninstall:
  #!/usr/bin/env bash
  set -eu o pipefail

  echo "Disable service {{BLUE}}~/.config/systemd/user/media-controls.service{{NORMAL}}"
  systemctl --user disable media-controls.service

  echo "Remove service file from {{BLUE}}~/.config/systemd/user/media-controls.service{{NORMAL}}"
  rm ~/.config/systemd/user/media-controls.service

  echo "Remove app binary from {{BLUE}}~/.config/bin/media-controls{{NORMAL}}"
  rm ~/.local/bin/media-controls

  echo "{{GREEN}}Done{{NORMAL}}"
