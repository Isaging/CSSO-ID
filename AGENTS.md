# AGENTS.md

Guidance for AI coding agents working on the **CSSO NFC member ID system**. Read this before changing anything.

## What this project is

Members of the CSSO organization get an ID card with an NFC sticker. Officers tap the card with an Android phone to:

- log office time in/out,
- deduct the free ₱40 printing allowance,
- (planned) check members into events, award KomsayQuest points, and redeem points for merch.

The system must work **offline** and **ship data when internet returns**. Data moves as **CSV** so it opens in Excel and Google Sheets.

## Current direction

The active app is the **React Native (Expo) officer app in `csso-mobile/`**, one codebase for **Android and iOS**. The offline PWA in `csso-offline/` and the Supabase files are earlier designs kept as fallback or alternative. Do not mix them without being asked. Business rules, CSV contracts, and the Apps Script receiver are shared by all versions.

## Repository layout

| Path | Purpose |
|---|---|
| `csso-mobile/App.js` | UI: Office, Printing, and Data tabs. Active. |
| `csso-mobile/src/core.js` | All logic: storage, tap rules, CSV import/export, Google Sheet sync. No UI code. |
| `csso-mobile/src/nfc.js` | NFC reading via `react-native-nfc-manager`. |
| `csso-mobile/app.json` | Expo config including the NFC config plugin. |
| `csso-offline/` | Earlier PWA version (single HTML file, service worker). Fallback. |
| `csso-offline/google_sheet_receiver.gs` | Google Apps Script receiver used by all app versions. |
| `tag_list_maker.html` | Offline tool: generates tokens, member CSV, TagWriter CSV, card sheet. |
| `csso_schema.sql`, `csso_officer_functions.sql`, `verify.html`, `officer.html` | Earlier Supabase design. Alternative only. |

## Architecture in one paragraph

An NFC sticker stores **only a URL containing a random token**. Officer phones hold the member list locally (imported from CSV), look the token up, and append a **log row** for every action. Logs are saved on the phone first, then sent to a Google Sheet (via the Apps Script receiver) whenever the phone is online, or exported as CSV by hand. The Sheet is the source of truth for reconciliation.

## Hard rules (do not break these)

1. **No personal data on the sticker.** Only the link prefix and the random token. No names, student numbers, balances, or points. All of that lives in the member list or database.
2. **Tokens are random and never regenerated for existing members.** Format: 16 characters from `abcdefghjkmnpqrstuvwxyz23456789`, created with `crypto.getRandomValues`. Never derive tokens from student numbers or use sequential values. The accepted token pattern everywhere is `[A-Za-z0-9_-]{8,64}`; keep all parsers consistent with it.
3. **Stickers are locked after writing, so the link prefix is permanent.** Never hardcode a domain that the organization might not keep for 4 years. Do not change URL structure (`?t=<token>` and `/t/<token>`) without a migration plan.
4. **Never rewrite stickers to change state.** Status, expiry, points, and balance change in data, not on tags.
5. **Offline must keep working.** No feature may require network access to complete a tap. Network is only for syncing.
6. **Sync is idempotent.** Every log row has a unique `id` (UUID). A row is marked `synced` only after the server returns `{ok:true, ids:[...]}` containing that id. The receiver must skip ids it already has.
7. **Never commit secrets.** The Apps Script `SECRET` and any Supabase service-role key stay out of the repo. The Supabase anon key is public by design but still belongs in config, not scattered through code.
8. **Escape output.** Use `textContent`, never `innerHTML`, for member-supplied strings. CSV exports must neutralize formula injection (values starting with `=`, `+`, `-`, `@` get a leading `'`).

## Data contracts

**Member CSV (import and export).** Columns, matched by header name, case-insensitive:

`token` (required), `student_no`, `full_name`, `status` (`active` or `inactive`, default `active`), `points` (default `0`), `print_balance` (default `40`), `valid_until` (`YYYY-MM-DD`, optional).

The card matching sheet from `tag_list_maker.html` (`order,student_no,full_name,token,url`) must remain importable as is.

**Log row (app export and Apps Script columns, in this exact order):**

`id, time, officer, student_no, name, action, amount, balance_after, note`

`action` is one of `office_in`, `office_out`, `print`. Planned: `event_checkin`, `points_award`, `points_redeem`. If you change this order or add a column, update **both** `index.html` and `google_sheet_receiver.gs`, and the docs, in the same change.

## Behavior rules to preserve

- **Office toggle:** alternates in/out per member. Ignores a repeat tap within 10 seconds. If the last "in" is older than 16 hours, the next tap is a new "in".
- **Printing:** refuses inactive or expired members and insufficient balance. Amount must be greater than 0 and at most 1000. Round money to 2 decimals. Currency is Philippine pesos (₱). Display times in `Asia/Manila` style local time.
- **Same-token tap within 3 seconds is ignored** at the UI level to avoid double handling.
- **NFC reading** goes through `react-native-nfc-manager` and works on Android and iOS, one tag per scan. iOS shows a system scan sheet each time and needs the NFC entitlement. The older PWA used Web NFC (Chrome on Android only).

## Working on the code (`csso-mobile/`)

- **Expo (managed workflow with development builds), JavaScript, minimal dependencies.** `react-native-nfc-manager` is a native module, so **Expo Go does not work**; use a development build. Add packages with `npx expo install <pkg>` so versions match the Expo SDK.
- Keep business logic in `src/core.js` and UI in `App.js`. Do not put tap, balance, or sync rules inside components.
- Storage is AsyncStorage key `csso_db_v1` (`{members, logs, settings}`). The phone keeps all unsynced logs plus the last 500 synced ones; the Sheet holds full history. If you change the shape, add a migration so phones do not lose unsent logs.
- File APIs use the newer `expo-file-system` `File` and `Paths` classes. If the project is on an older Expo SDK, adapt `exportCSV` and `pickAndImport` accordingly.
- Use `textContent`-style safety: render member strings only through `<Text>`, and keep CSV formula-injection protection in `cell()`.
- Visible text uses ’ for apostrophes. Keep UI strings short.

## Running and testing

Setup:

1. `npx create-expo-app@latest csso-officer --template blank`, then copy `App.js`, `app.json`, and `src/` over the generated files.
2. `npx expo install @react-native-async-storage/async-storage @react-native-community/netinfo expo-document-picker expo-file-system expo-sharing react-native-safe-area-context`, then `npm install react-native-nfc-manager`.
3. Build a development client: `eas build --profile development --platform android` (and `ios`), or run locally with `npx expo run:android`. **iOS NFC requires a paid Apple Developer account** and a real device; simulators have no NFC.

There is no automated test suite. Test manually on real phones:

1. Import a small member CSV (3 to 5 rows, including one inactive and one expired).
2. First scan logs "in", second scan after 10+ seconds logs "out", a rapid double scan is ignored.
3. Printing: normal deduct, insufficient balance refused, inactive member refused.
4. **Airplane-mode round trip:** do several scans offline, reconnect, confirm rows reach the Sheet exactly once, and resending creates no duplicates.
5. Export new, recent, and members CSVs and open them in Excel or Sheets. Names with commas, quotes, and a leading `=` must display correctly and safely.
6. Kill and reopen the app and confirm data persists.
7. Test on both Android and iOS before calling a change done.

## Known limitations (be honest about these in docs and UI)

- **Balances can drift between phones** if two officers deduct for the same member while offline. Mitigation: one printing-station phone, and reconcile from the Sheet using the balance formula noted in `google_sheet_receiver.gs`.
- **No officer login in the offline app.** Anyone holding an unlocked officer phone can use it. A PIN lock is a planned addition.
- **Standard NTAG stickers can be cloned.** Mitigated by visual name and photo checks. Optional upgrade: NTAG 424 DNA with signed rolling codes, which requires server-side signature verification and different tag programming tools.
- Unsent logs live only in the app’s local storage. Uninstalling the app or clearing its data loses them, so encourage regular sync or export.

## Planned work (not yet built)

- Event check-in with automatic KomsayQuest points.
- Merch discount redemption from points.
- Optional device PIN.
- `valid_until` handling in the Supabase schema (the offline app already supports it).
- Members-balance refresh flow from the Sheet back to officer phones.

## Before you finish a change

- Did the sticker still stay token-only?
- Does it still work with no internet?
- Are the CSV column contracts unchanged, or updated everywhere?
- If you touched `csso-offline/`, did you bump the service worker version?
- Did you run the airplane-mode test if you touched logging or sync?
