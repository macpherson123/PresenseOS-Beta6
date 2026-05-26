# PresenceOS Beta 6

You can install this and pair with eachother via nfc  (or QR but dev mode only) tap and video call eachother.

A distraction-free Android experience.

NOTE: THIS IS BROKEN. I DO NOT OWN YOUR DEVICE.
feedback apporediacted.lsfnewefn typo

But here is a snippet in time of the source code so we are all heeby geeby

i run the servers myself. calling via aws rn due to lack of external ip but webrtc relay is local. all through cloudlfared tunnels n whatnots

https://signup.presenceos.qzz.io/

^survey

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
