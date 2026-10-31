# CSSO NFC Member ID System

Offline-first member identification, office time tracking, printing allowance management, and semester administration system for the **CSSO** organization.

Staff tap member NFC ID cards with an Android or iPhone to:
- Log office time in/out (`office_in`, `office_out`),
- Deduct the free ₱40 printing allowance (and log walk-in non-member guest printing),
- Manage semester membership renewals and data retention (`valid_until`),
- Issue and lock NFC stickers securely.

Data moves as **CSV** so it opens directly in Excel and Google Sheets, and syncs via a lightweight Google Apps Script receiver when online.

---

## Repository Layout

| Path | Purpose |
|---|---|
| `csso-mobile/` | **Active React Native (Expo) officer app** for Android and iOS. |
| `csso-offline/` | Earlier PWA version (single HTML file, Service Worker fallback). |
| `csso-offline/google_sheet_receiver.gs` | Google Apps Script receiver endpoint used for cloud reconciliation. |
| `tag_list_maker.html` | Offline tool to generate crypto tokens, member CSV, TagWriter CSV, and printable card sheets. |
| `AGENTS.md` | Comprehensive engineering guidance and data contract specifications. |

---

## Core Architecture & Hard Rules

1. **No personal data on the NFC sticker.** Stickers store only a secure URL containing a random token (`https://your-domain/t/<token>`). All names, student numbers, and balances live exclusively in the local database or member list.
2. **Crypto-secure random tokens.** Tokens are 16 characters generated via crypto random bytes (`[A-Za-z0-9_-]{8,64}`). Never sequential or derived from student numbers.
3. **Stickers are locked permanently** upon successful issue and verification so the URL prefix cannot be altered.
4. **Complete Offline Operation.** Taps, searches, balance checks, and admin edits require zero internet access. Unsynced logs are stored securely in local async storage and pushed when reconnected.
5. **Idempotent Sync.** Every log row has a unique UUID. The Apps Script receiver skips duplicate IDs automatically.
6. **Authentication & Roles:**
   - **`officer` / `encrypts` / `admin`**: Sign in by tapping their own NFC ID card at the lock screen.
   - **`admin`**: Unlocked by entering the single **Admin Master Key** for this deployment, which is stored securely as a salted SHA-256 hash in local settings with a 1-minute lockout after 5 incorrect attempts.
   - **`member`**: Refused at the lock screen (cannot operate the app; receives printing only).

---

## Installing & Running on a Phone (Android & iOS)

Because the app uses native NFC capabilities (`react-native-nfc-manager`), **Expo Go cannot be used**. You must build a **development build** or standalone APK/IPA.

### Prerequisites
- Node.js (LTS recommended)
- Android Studio (for Android builds/APK) or Xcode (for iOS builds — requires a paid Apple Developer account for NFC entitlements)
- EAS CLI (`npm install -g eas-cli`)

### Step 1: Clone and Install Dependencies
```bash
cd csso-mobile
npm install
```

### Step 2: Configure App Settings
Review `app.json` for app identifiers, permissions, and NFC plugin configuration.

### Step 3: Build & Install on Android

#### Option A: Local Android Development Build (Requires Android SDK & Emulator/Device via USB debugging)
```bash
npx expo run:android
```

#### Option B: Build an APK for Sideloading (Using EAS Build)
1. Log into your Expo account:
   ```bash
   eas login
   ```
2. Build the development or preview APK:
   ```bash
   eas build --profile development --platform android
   ```
3. Once the build finishes, download the APK file from the provided link and install it directly on your Android phone.

---

### Step 4: Build & Install on iOS
*Note: iOS NFC background/foreground reading requires a paid Apple Developer account and physical device.*

1. Configure your signing credentials in `app.json` or via EAS.
2. Run an iOS development build:
   ```bash
   eas build --profile development --platform ios
   ```
3. Install the resulting app build on your provisioned iPhone.

---

## Initial Setup & Usage

1. **First Launch**: On first launch, if no member list is loaded, enter the **Admin Master Key** at the lock screen to unlock Admin access.
2. **Import Members**: Use the **Data** tab (Admin unlocked) to import your initial member CSV (matching columns: `token`, `student_no`, `full_name`, `role`, `status`, `print_balance`, `valid_until`).
3. **Officer Sign-In**: Working officers or encrypts staff tap their own NFC ID card at the lock screen to begin their shift.
4. **Admin Actions**: Enter the Admin Master Key to manage member statuses, semester rollovers, data retention purges (`valid_until`), and issue new NFC IDs.
