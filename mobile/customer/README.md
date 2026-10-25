# تَمْوِين: store app (iOS and Android)

The App Store and Google Play app is a Capacitor 8 wrapper around the customer web app in `../../shop`.
It runs the same code, talks to the same API (`https://tamveen-pos.vercel.app/api`) and adds the native
sign-in, location and microphone.

- Bundle ID / application ID: `sa.tamveen.app` (change it in `capacitor.config.json` before the first upload if you want a different one)
- Display name: تَمْوِين
- Android: target and compile SDK 36, min SDK 24
- iOS: Sign in with Apple entitlement, privacy manifest (`PrivacyInfo.xcprivacy`), when-in-use location and microphone strings

## Build

```
npm install
npm run ios        # copies ../../shop into www/, syncs, opens Xcode (Mac only)
npm run android    # same, opens Android Studio
```

Run `npm run sync` after any change in `../../shop`.

## What has to be set up once

| What | Where | Then |
| --- | --- | --- |
| Apple Developer account | developer.apple.com | Create the App ID `sa.tamveen.app` with **Sign in with Apple** on. Create a Services ID (for the website sign-in) and set it plus `sa.tamveen.app` in Vercel as `APPLE_CLIENT_IDS` (comma separated). |
| Google Cloud OAuth | console.cloud.google.com, APIs and Services, Credentials | Make a **Web** client, an **iOS** client (bundle `sa.tamveen.app`) and an **Android** client (package `sa.tamveen.app` + the Play signing SHA-1). Set `GOOGLE_CLIENT_IDS` to the web client ID and `GOOGLE_IOS_CLIENT_ID` to the iOS one in Vercel. Add the iOS client's reversed ID as a URL scheme in Xcode. |
| Google Play Console | play.google.com/console | Developer account, app listing, Data safety form, account deletion URL. |

Until the Apple and Google client IDs are set, the app runs sign-in in demo mode (type a name and email).

## Store checklist

**Both stores**
- Privacy policy: `https://tamveen-pos.vercel.app/shop/privacy.html`
- Terms: `https://tamveen-pos.vercel.app/shop/terms.html`
- Account deletion in the app: Account, Delete account. On the web: `https://tamveen-pos.vercel.app/shop/delete-account.html` (Google Play asks for this link)
- Browsing works without an account; sign-in is asked only to place an order
- Payment is cash or card on delivery for physical goods, so no in-app purchase is needed (App Store 3.1.3(e), Play payments policy)

**App Store**
- 4.8: Sign in with Apple is offered next to Google
- 5.1.1(v): in-app account deletion is there
- Privacy labels (App Privacy): Name, Email, Phone, Physical address, Precise location, Audio data (voice notes), Purchase history, User ID. All linked to the user, used for App Functionality, none for tracking. These match `PrivacyInfo.xcprivacy`
- Location is when-in-use only; the microphone is used only when the customer taps the mic
- 4.2: native sign-in, location and microphone go beyond a plain website
- Review notes: give the reviewer a test address in Riyadh and say orders are paid on delivery

**Google Play**
- Data safety: same data types as above, encrypted in transit, user can request deletion
- Location: approximate and precise, foreground only, for App functionality
- Microphone: voice notes, App functionality
- Target API 36 (required for new apps and updates from 31 August 2026)
- The Android app offers Google sign-in only. Apple's sign-in rule applies to iOS
