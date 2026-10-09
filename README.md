# Humanitix Pre-checkout Assistant

[简体中文](README.zh-CN.md)

A local Tampermonkey userscript that prepares Humanitix checkouts, supports configured release times, and stops before the final wallet confirmation.

## Features

- First-run setup for name, email, mobile, student ID, enrolment type, study level, and study load
- Profile data stays in Tampermonkey storage on the user's browser
- Selects one ticket automatically when exactly one ticket type is purchasable
- Prompts for a manual choice when multiple ticket types are purchasable
- Fills known buyer and student fields while stopping on unknown required fields
- Treats event-specific fields such as Confirm Email and student ID as optional when the page omits them
- Disables Humanitix marketing email by default
- Reads Humanitix's visible `Sales start at ...` time automatically and refreshes once when sales open
- Lets each user choose Google Pay, Apple Pay, credit card, PayPal, or stop at the payment page during first-run setup
- Requires a real user click to open a browser-native Google Pay or Apple Pay sheet
- Never confirms the final wallet payment

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) and enable user scripts in the browser extension settings.
2. Open the [userscript installation link](https://raw.githubusercontent.com/richardkkk/humanitix-precheckout-assistant/main/userscript/humanitix-precheckout.user.js).
3. Confirm installation in Tampermonkey.
4. Open a Humanitix event page. The first-run form asks for the user's own details.
5. Click **启动当前活动** when the event is not already configured for automatic countdown.

## Ticket selection

The script does not depend on a ticket name or fixed screen position. If exactly one enabled ticket quantity control exists, it selects one ticket. If several are enabled, the script highlights them and asks the user to set exactly one quantity to 1, then click **已选好，继续**.

## Scheduled releases

No event configuration is normally required. When the ticket page displays text such as `Sales start at Mon 12th Oct 2026, 12:00 pm AEDT`, the script reads the date, time, and AEST/AEDT timezone automatically. Opening the event page before release starts the countdown; Chrome and the tab must stay open.

The page's displayed release time takes priority, so refreshing the page picks up a host's changed schedule. The script does not repeatedly poll Humanitix.

During the final 150 ms, the script switches to a short local timer for better precision, but it does not request the page before the official release timestamp. Keeping the tab in the foreground near release reduces browser timer throttling.

For unusual pages that do not expose a readable sale time, an optional fallback can be added through **Advanced: edit complete JSON configuration**:

```json
{
  "id": "event-name",
  "url": "https://events.humanitix.com/event-slug",
  "releaseAt": "2026-10-12T12:00:00+11:00",
  "expectedPriceAud": 15
}
```

The JSON fallback is not needed for ordinary Humanitix scheduled-release pages.

## Payment boundary

Browser-native wallets require a foreground tab and a real user gesture. The script prepares the payment section and shows **打开 Google Pay** or **打开 Apple Pay**. The user must click that button and must personally perform any final wallet confirmation. Apple Pay is available only when Humanitix exposes it in a compatible Apple/Safari environment; it normally does not appear in Windows Chrome. Credit card and PayPal selections stop on their payment section for manual completion.

## Privacy

Personal details are saved only in Tampermonkey storage in the user's browser. This repository contains no user profile, analytics, backend, or data collection.

## Important

This is an unofficial helper and is not affiliated with Humanitix, UNSW, or Arc. Humanitix terms may restrict automated access. The script contains no CAPTCHA bypass, stealth, rapid polling, or anti-bot evasion. Users are responsible for complying with the event host's rules and applicable terms.

## Development

```powershell
npm test
```

MIT License.
