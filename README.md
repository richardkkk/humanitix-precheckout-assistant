# Humanitix Pre-checkout Assistant

[简体中文](README.zh-CN.md)

A local Tampermonkey userscript that prepares Humanitix checkouts, supports configured release times, and stops before the final wallet confirmation.

## Features

- First-run setup for name, email, mobile, student ID, enrolment type, study level, and study load
- Profile data stays in Tampermonkey storage on the user's browser
- Selects one ticket automatically when exactly one ticket type is purchasable
- Prompts for a manual choice when multiple ticket types are purchasable
- Fills known buyer and student fields while stopping on unknown required fields
- Disables Humanitix marketing email by default
- Can wait for a configured release time and refresh once when sales open
- Supports Google Pay, credit card, and PayPal selection
- Requires a real user click to open the browser-native Google Pay sheet
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

Events can be added through **Advanced: edit complete JSON configuration** in the Tampermonkey menu:

```json
{
  "id": "event-name",
  "url": "https://events.humanitix.com/event-slug",
  "releaseAt": "2026-10-12T12:00:00+11:00",
  "expectedPriceAud": 15
}
```

When `autoStartScheduledEvents` is enabled, opening that event page before `releaseAt` starts the countdown automatically. Chrome and the tab must stay open. The script does not repeatedly poll Humanitix.

## Payment boundary

Browser-native wallets require a foreground tab and a real user gesture. The script prepares the payment section and shows **打开 Google Pay**. The user must click that button and must personally perform any final wallet confirmation.

## Privacy

Personal details are saved only in Tampermonkey storage in the user's browser. This repository contains no user profile, analytics, backend, or data collection.

## Important

This is an unofficial helper and is not affiliated with Humanitix, UNSW, or Arc. Humanitix terms may restrict automated access. The script contains no CAPTCHA bypass, stealth, rapid polling, or anti-bot evasion. Users are responsible for complying with the event host's rules and applicable terms.

## Development

```powershell
npm test
```

MIT License.

