# AGENTS.md

Guidance for AI coding agents working on the **CSSO NFC member ID system**. Read this before changing anything.

## What this project is

Members of the CSSO organization get an ID card with an NFC sticker. Staff tap the card with a phone (Android or iPhone) to:

- log office time in/out,
- deduct the free ₱40 printing allowance (and log walk-in non-member printing),
- manage semester membership renewals and student data retention,
- (planned) check members into events.

**Out of scope:** KomsayQuest (the points and rewards system) and merch point redemption. That is a separate system. Do not add points, rewards, or discount logic here.

The system must work **offline** and **ship data when internet returns**. Data moves as **CSV** so it opens in Excel and Google Sheets.

## Current direction

The active app is the **React Native (Expo) officer app in `csso-mobile/`**, one codebase for **Android and iOS**. The offline PWA in `csso-offline/` and the Supabase files are earlier designs kept as fallback or alternative. Do not mix them without being asked. Business rules, CSV contracts, and the Apps Script receiver are shared by all versions.

## Repository layout

| Path | Purpose |
|---|---|
| `csso-mobile/App.js` | UI: Lock/Sign-in screen, Office, Printing, Members (Admin), Issue ID, and Data tabs. Active. |
| `csso-mobile/src/core.js` | All logic: storage, auth/permissions, tap rules, log editing/voiding, member status/purge, CSV import/export, Google Sheet sync. No UI code. |
| `csso-mobile/src/nfc.js` | NFC reading, sticker writing, and locking via `react-native-nfc-manager`. |
| `csso-mobile/app.json` | Expo config including the NFC config plugin. |
| `csso-offline/` | Earlier PWA version (single HTML file, service worker). Fallback. |
| `csso-offline/google_sheet_receiver.gs` | Google Apps Script receiver used by all app versions. |
| `tag_list_maker.html` | Offline tool: generates tokens, member CSV, TagWriter CSV, card sheet. |
| `csso_schema.sql`, `csso_officer_functions.sql`, `verify.html`, `officer.html` | Earlier Supabase design. Alternative only. |

## Architecture in one paragraph

An NFC sticker stores **only a URL containing a random token**. Officer phones hold the member list locally (imported from CSV), look the token up, and append a **log row** for every action. Logs are saved on the phone first, then sent to a Google Sheet (via the Apps Script receiver) whenever the phone is online, or exported as CSV by hand. The Sheet is the source of truth for reconciliation.

## Hard rules (do not break these)

1. **No personal data on the sticker.** Only the link prefix and the random token. No names, student numbers, or balances. All of that lives in the member list or database.
2. **Tokens are random and never regenerated for existing members, except through the explicit Replace flow for a lost or damaged ID.** Format: 16 characters from `abcdefghjkmnpqrstuvwxyz23456789`, created with `crypto.getRandomValues`. Never derive tokens from student numbers or use sequential values. The accepted token pattern everywhere is `[A-Za-z0-9_-]{8,64}`; keep all parsers consistent with it.
3. **Stickers are locked after writing, so the link prefix is permanent.** Never hardcode a domain that the organization might not keep for 4 years. Do not change URL structure (`?t=<token>` and `/t/<token>`) without a migration plan.
4. **Never rewrite stickers to change state.** Status, role, expiry, and balance change in data, not on tags. Stickers are written only through the Issue ID flow and are locked by default.
5. **Offline must keep working.** No feature may require network access to complete a tap, search, or admin edit. Network is only for syncing.
6. **Sync is idempotent.** Every log row has a unique `id` (UUID). A row is marked `synced` only after the server returns `{ok:true, ids:[...]}` containing that id. The receiver must skip ids it already has.
7. **Never commit secrets.** The Apps Script `SECRET` and any Supabase service-role key stay out of the repo. The Supabase anon key is public by design but still belongs in config, not scattered through code.
8. **Escape output.** Use `textContent`, never `innerHTML`, for member-supplied strings. CSV exports must neutralize formula injection (values starting with `=`, `+`, `-`, `@` get a leading `'`).

## Roles, authentication, and access

Every person in the system—including `admin`, `officer`, and `encrypts`—is a CSSO member with an NFC ID and a ₱40 printing allowance. `officer`, `encrypts`, and `admin` (a designated officer) are the **working members** of the organization.

| Role | Sign-in method | Operate the app | Office duty logs |
|---|---|---|---|
| `admin` (designated officer) | Tap NFC ID + **Admin Master Key** (or direct Master Key login for setup/fallback) | All `officer` permissions + **Admin Member Management** (edit member status/roles, expire semester, purge records past `valid_until`), Issue ID, and Settings | Yes |
| `officer` | Tap NFC ID (no individual password needed) | Office module (time in/out), Printing (member, non-member, editable history), Data sync & exports. Can unlock Admin tools by entering the single **Admin Master Key** | Yes |
| `encrypts` (working member, under officers) | Tap NFC ID (no password needed) | Printing (member, non-member, editable history) and Data syncing only (Sync now, Export new records). No Office module, no import, no Admin/Settings | Yes, logged by an officer/admin |
| `member` (non-working) | Cannot sign in (NFC tap refused at lock screen) | None. Receives printing only | No. Receives printing only |

Authentication & permission rules:
- **NFC-Tap Sign-In for Working Members (`officer` and `encrypts`):** Do not use individual passwords or a generic anonymous "Guest" button. `officer` and `encrypts` sign in by tapping their own active NFC ID card at the lock screen so every action accurately records their name and role in `operator` and `operator_role`.
- **Single Admin Master Key:** There is only **one** password/key in the app—the **Admin Master Key** (stored as a salted SHA-256 hash in local `settings`, with 5 wrong tries locking for 1 minute). It is required to access Admin actions (Member status/role management, Semester rollover, Data retention purge, Issue ID, CSV imports, and Settings).
- **Empty DB / NFC Fallback:** If the member list is empty on first launch (or an officer's physical NFC card is unavailable), entering the **Admin Master Key** at the lock screen unlocks the app for initial CSV setup or lets the Admin pick the active officer from the member list.
- The app locks when it goes to the background.
- Permissions are enforced in `src/core.js` (`can()`), not only by hiding buttons. Never move an authorization check into the UI alone.
- Unknown or missing roles are treated as `member`.

## Membership status (`status`) vs. data retention (`valid_until`)

Do not confuse semester membership renewal with student data deletion:

- **`status` (`active`, `expired`, `inactive`) — Semester / Academic Year Membership:**
  - Memberships expire every semester or academic year for all members (including working members: `admin`, `officer`, `encrypts`).
  - Tapping or searching a member whose `status` is `expired` or `inactive` is refused for Printing and Office duty.
  - In the **Members (Admin)** tab, an Admin can edit an individual member’s `status` (with an option to reset `print_balance` to `40` upon renewal) or trigger **Expire Semester** to bulk-set members to `expired` at the end of a term (while keeping the active Admin unlocked so the app cannot be locked out).
  - Status or role edits append an audit row (`action = member_status`) so changes are tracked when syncing to the Sheet.
- **`valid_until` (`YYYY-MM-DD`) — Data Retention & Student Deletion Check:**
  - `valid_until` indicates when a student’s personal data is eligible to be **deleted** from the organization’s records (e.g., after graduation or retention policy expiry).
  - The **Members (Admin)** tab flags records where `today > valid_until` as eligible for deletion and lets the Admin purge those students’ personal data from `csso_db_v1` and export the cleaned member CSV.

## Manual search, printing history, editing logs, and non-member printing

- **Manual search** (Office and Printing tabs) filters the in-memory member list by `student_no`, `full_name`, or `token`, fully offline. Tapping **Use** passes the member’s token into the **same** `core.tap()` / `core.deduct()` path an NFC scan uses, so the 3-second duplicate guard, active/expired status checks, role checks, and balance validation all still apply. Never add a second code path for manual actions.
- Anything triggered from search must write `[manual]` in the `note` column so Sheet auditors know the card was not physically tapped.
- **Printing history** is the latest `print` and `print_guest` rows from the local `logs` (newest first, 10 by default, 50 on “Show more”). It shows Manila time (UTC+8, computed manually, no `Intl` dependency), name, student number, `-₱amount`, `balance_after` (empty for `print_guest`), the note, a “waiting to send” flag for unsynced rows, and an **Edit** action.
- **Editable printing history (misclick correction):** Working members (`officer`, `encrypts`, `admin`) can edit or void/undo a printing log entry via `src/core.js` (`editPrintLog()` / `voidPrintLog()`) if they misclick:
  - **Validation:** Edited amounts must obey printing rules (`> 0` and `<= 1000`, rounded to 2 decimals), and for member `print` logs, the recalculated `print_balance` (`oldBalanceAfter + oldAmount - newAmount`) must not drop below `0`.
  - **Unsynced logs:** Update `amount`, `balance_after`, and `note` in place (or remove the row on Void/Undo) and immediately adjust the member’s local `print_balance` by `oldAmount - newAmount`. For `print_guest`, update or delete the row without touching any member balance.
  - **Already-synced logs:** Because `google_sheet_receiver.gs` skips duplicate `id`s, never mutate a synced row in place without changing its `id`. Adjust the member’s local `print_balance` and replace/append the correction with a new UUID `id` (marked unsynced) and append `[edited from ₱<old> ref:<old_id>]` (or `[voided ref:<old_id>]`) in `note` so the next sync updates the Sheet.
- **Non-member printing** records `action = print_guest` with the amount. Name and student number are optional; blanks automatically default to `Anonymous` (or `Anonymous` / `ANON`). There is no balance (`balance_after` is `""`), no NFC ID, and no member lookup. It deliberately does **not** use `print`, so a walk-in transaction never affects member balance reconciliation in the Sheet.

## Issuing stickers (Issue ID tab, Admin / Officers with Admin Key)

- Tokens are generated on the phone with `expo-crypto` secure random bytes (16 characters, rejection sampling so there is no bias, uniqueness checked).
- Three modes: **New member** (new record and token), **Existing** (write the current token to a first sticker), **Replace lost** (new token; the old one is removed on that phone).
- Order of operations, which must be kept: save the member as `pending`, write the link, **read it back and verify**, then lock, then record `tag_issue`. If the write or verify fails, `undoIssue` restores the previous state. Never lock before a successful verify.
- Locking is **permanent**. The app confirms with the exact link and name first. Test on spare stickers with the lock switch off before a real batch.
- Refuse to overwrite a sticker that already carries another member’s token.
- The link prefix lives in Settings and must start with `https://` and end with `?t=` or `/t/`.
- Locking prevents editing, not copying. A sticker can still be cloned onto another tag.
- A new or replaced token exists only on the issuing phone until other phones import the member CSV. Use the safe import (keeps each phone’s balances; a re-issued student’s old token is dropped and its balance carried over) rather than “replace all”, which overwrites local balances.

## Data contracts

**Member CSV (import and export).** Columns, matched by header name, case-insensitive:

`token` (required), `student_no`, `full_name`, `role` (`admin`, `officer`, `encrypts`, or `member`, default `member`), `status` (`active`, `expired`, or `inactive`, default `active`), `print_balance` (default `40`), `valid_until` (`YYYY-MM-DD`, optional, used for data deletion eligibility), `tag_locked` (`yes` once the sticker is locked; informational).

The card matching sheet from `tag_list_maker.html` (`order,student_no,full_name,token,url`) must remain importable as is.

**Log row (app export and Apps Script columns, in this exact order):**

`id, time, operator, student_no, name, action, amount, balance_after, note, operator_role`

`action` is one of `office_in`, `office_out`, `print`, `print_guest` (walk-in, non-member printing with `balance_after = ""`), `tag_issue` (a sticker was written; `note` says `locked` or `not locked`), `member_status` (admin status/renewal/role change). A `note` containing `[manual]` means the action came from the search bar instead of an NFC scan; `[edited ...]` or `[voided ...]` indicates a corrected printing log. Planned: `event_checkin`. If you change this order or add a column, update **both** `index.html` and `google_sheet_receiver.gs`, and the docs, in the same change.

## Behavior rules to preserve

- **Office toggle:** alternates in/out per working member (`admin`, `officer`, `encrypts`). Ignores a repeat tap within 10 seconds. If the last "in" is older than 16 hours, the next tap is a new "in".
- **Printing:** refuses `inactive` or `expired` members and insufficient balance. Amount must be greater than 0 and at most 1000. Round money to 2 decimals. Currency is Philippine pesos (₱). Display times in `Asia/Manila` style local time (UTC+8).
- **Same-token tap within 3 seconds is ignored** at the UI level to avoid double handling.
- **NFC reading** goes through `react-native-nfc-manager` and works on Android and iOS, one tag per scan. iOS shows a system scan sheet each time and needs the NFC entitlement. The older PWA used Web NFC (Chrome on Android only).

## Working on the code (`csso-mobile/`)

- **Expo (managed workflow with development builds), JavaScript, minimal dependencies.** `react-native-nfc-manager` is a native module, so **Expo Go does not work**; use a development build. Add packages with `npx expo install <pkg>` so versions match the Expo SDK.
- Keep business logic in `src/core.js` and UI in `App.js`. Do not put tap, balance, edit/refund, status/purge, or sync rules inside components.
- Storage is AsyncStorage key `csso_db_v1` (`{members, logs, settings}`). The phone keeps all unsynced logs plus the last 500 synced ones; the Sheet holds full history. If you change the shape, add a migration so phones do not lose unsent logs.
- File APIs use the newer `expo-file-system` `File` and `Paths` classes. If the project is on an older Expo SDK, adapt `exportCSV` and `pickAndImport` accordingly.
- Use `textContent`-style safety: render member strings only through `<Text>`, and keep CSV formula-injection protection in `cell()`.
- Visible text uses ’ for apostrophes. Keep UI strings short.

## Running and testing

Setup:

1. `npx create-expo-app@latest csso-officer --template blank`, then copy `App.js`, `app.json`, and `src/` over the generated files.
2. `npx expo install @react-native-async-storage/async-storage @react-native-community/netinfo expo-document-picker expo-file-system expo-sharing expo-crypto react-native-safe-area-context`, then `npm install react-native-nfc-manager`.
3. Build a development client: `eas build --profile development --platform android` (and `ios`), or run locally with `npx expo run:android`. **iOS NFC requires a paid Apple Developer account** and a real device; simulators have no NFC.

There is no automated test suite. Test manually on real phones:

1. Import a small member CSV (3 to 5 rows, including one `inactive`, one `expired`, and one with a past `valid_until` date).
2. First scan logs "in", second scan after 10+ seconds logs "out", a rapid double scan is ignored.
3. Printing: normal deduct, insufficient balance refused, `inactive` or `expired` member refused.
4. **Airplane-mode round trip:** do several scans offline, reconnect, confirm rows reach the Sheet exactly once, and resending creates no duplicates.
5. Export new, recent, and members CSVs and open them in Excel or Sheets. Names with commas, quotes, and a leading `=` must display correctly and safely.
6. Kill and reopen the app and confirm data persists.
7. Roles & Sign-In: tap an `officer` NFC ID and confirm immediate sign-in to Office, Printing, and Data with `operator` set to that officer’s name. Tap an `encrypts` NFC ID and confirm access is limited to Printing and Data (Sync and Export new only). Tap a `member` NFC ID at sign-in and confirm it is refused. Enter the **Admin Master Key** to unlock Admin features (Members management, Issue ID, Settings); verify 5 wrong tries lock for 1 minute.
8. Admin Member Management & Retention (`valid_until`): in the Admin view, change a member’s `status` from `expired` to `active` with balance reset to ₱40 and confirm they can now print. Test **Expire Semester** and confirm members become `expired` without locking out the active Admin. Filter by past `valid_until` and test purging a graduated student’s data.
9. Issue ID, using spare stickers: write with the lock off and tap it to confirm it opens the right link; then write one with the lock on and confirm another app (for example NFC Tools) can’t rewrite it. Try writing over a sticker that belongs to another member (must be refused), a failed write (member must not be left saved), and Replace lost (old token must stop working).
10. Search: find a member by name, by student number, and by a token fragment, all in airplane mode. **Use** in the Office tab logs in/out with `[manual]`; **Use** in the Printing tab then Deduct logs `print` with `[manual]`. Searching an `inactive` or `expired` member must be refused. A rapid second **Use** on the same member must be ignored.
11. Printing history & Non-member printing: deduct a few times and confirm they appear newest first with Manila times and the right balance after. Record a non-member print (`print_guest`) with blank name and student number and confirm it defaults to `Anonymous` with no balance (`balance_after` empty) and no NFC prompt, and that it never changes any member’s balance.
12. Editable printing history: edit an unsynced member print log (for example ₱15 to ₱5) and confirm the member’s `print_balance` increases by ₱10 and `balance_after` updates. Void/undo an unsynced member print log and confirm the full balance is restored. Edit a `print_guest` log and confirm no member balances are affected.
13. Test on both Android and iOS before calling a change done.

## Known limitations (be honest about these in docs and UI)

- **Balances can drift between phones** if two officers deduct for the same member while offline. Mitigation: one printing-station phone, and reconcile from the Sheet using the balance formula noted in `google_sheet_receiver.gs`.
- **NFC sign-in trusts physical possession of an officer/encrypts ID card** for everyday operations, while high-risk actions (Admin member management, semester rollover, data purge, Issue ID, Settings) require the single **Admin Master Key** (salted SHA-256, local to each phone, 5 wrong tries lock for a minute).
- **Standard NTAG stickers can be cloned.** Locking stops edits, not copying. Mitigated by visual name and photo checks. Optional upgrade: NTAG 424 DNA with signed rolling codes, which requires server-side signature verification and different tag programming tools.
- Unsent logs live only in the app’s local storage. Uninstalling the app or clearing its data loses them, so encourage regular sync or export.

## Planned work (not yet built)

- Event check-in (attendance only).
- Per-role reports in the Sheet.
- `valid_until` handling in the Supabase schema (the offline app already supports it).
- Members-balance refresh flow from the Sheet back to officer phones.

## Before you finish a change

- Did the sticker still stay token-only?
- Does it still work with no internet?
- Are the CSV column contracts unchanged, or updated everywhere?
- If you touched `csso-offline/`, did you bump the service worker version?
- Did you run the airplane-mode test if you touched logging or sync?