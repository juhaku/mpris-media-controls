# MPRIS Media Controls

Simple PWA app implementing MPRIS Media Controls for remote controlling media with style.

# Develop

## Pre-requisites

Create `.env` file in the root of `ui` folder with correct server address for the backend.

```bash
VITE_SERVER_ADDRESS=http://wwww
```

## Run

Run dev with following command:

```bash
just dev
```

Run preview version of the app

> [!NOTE]
> Preview mode needs `.env.preview` file with correct `VITE_SERVER_ADDRESS` pointing to correct server.

```bash
just preview
```

## Build and install release app

> [!NOTE]
> Production mode needs `.env.production` file with correct `VITE_SERVER_ADDRESS` pointing to correct server.

Build production app and install it as user systemd service.

```bash
just build produciton
just install
```

# Screenshots

<div style="display: flex;">
    <div style="padding-right: 1rem;">

        ![Play video](./ui/screenshots/1.png)

    </div>
    <div>

        ![Seek video](./ui/screenshots/2.png)

    </div>

</div>

# Tour vidoe

<video src="./ui/screenshots/tour_short.mp4" controls></video>
