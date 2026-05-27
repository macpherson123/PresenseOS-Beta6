# PresenceOS Beta 6

> **This is a very tentative first public release, shared to gather early feedback. Expect rough edges — bug reports and suggestions are welcome.**

A distraction-free Android experience. Install it, pair with someone via NFC (or QR code in dev mode), and video call each other.

I run the servers myself — calling via AWS due to lack of external IP, WebRTC relay is local, all through Cloudflare tunnels.

[Sign up / feedback survey](https://signup.presenceos.qzz.io/)

## Screenshots

<p align="center">
  <img src="assets/screenshots/rotary.png" width="180" alt="Rotary Launcher"/>
  <img src="assets/screenshots/chat.png" width="180" alt="PresenceChat"/>
  <img src="assets/screenshots/themes.png" width="180" alt="Themes"/>
  <img src="assets/screenshots/settings.png" width="180" alt="Settings"/>
  <img src="assets/screenshots/relay-server.png" width="180" alt="Relay Server"/>
  <img src="assets/screenshots/about.png" width="180" alt="About"/>
</p>

## Best Results

For the cleanest experience, use the [Debloater Magisk module](https://github.com/sunilpaulmathew/De-Bloater) to remove `SystemUI.apk` before or after installing PresenceOS.

## What Works

- Wi-Fi
- Hotspot
- Bluetooth
- 4G/5G Mobile Data
- Cellular calls and SMS
- PresenceChat voice and video calls (device-to-device, requires relay server online)

## Requirements

- Android device running a GSI or AOSP build targeting **SDK 36**
- [Magisk](https://github.com/topjohnwu/Magisk) installed

## Installation

1. Download the latest release zip from the [Releases](../../releases) page.
2. Open Magisk → **Modules** → **Install from storage**.
3. Select the downloaded zip and flash it.
4. Reboot.
5. When prompted, grant all root and normal permissions PresenceOS requests.
