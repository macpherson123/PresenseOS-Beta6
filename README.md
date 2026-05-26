# PresenceOS

A distraction-free Android launcher built with React Native and Expo.

## Stack

- **Framework**: Expo Router + React Native (New Architecture)
- **Language**: TypeScript + Kotlin (native modules)
- **Build**: EAS Build (development profile → APK)

## Local Development

```bash
# Install dependencies
bun install

# Start dev server
bun run start

# Start with tunnel (for physical device)
bun run start-tunnel
```

## Building

```bash
eas build -p android --profile development
```

## Project Structure

```
app/          Expo Router screens
components/   Shared UI components
contexts/     React context providers (Music, User, Settings, Contacts)
hooks/        Custom hooks
constants/    Theme colours, app list, philosophy strings
android/      Native Android project (Kotlin modules for system access)
```

## Owner

`@macpherson123` on EAS — project ID `3c01794d-1075-4fcf-a474-ad2b51d492f9`


