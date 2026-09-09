# Chrome Web Store privacy fields

## Single purpose

Provide user-controlled, on-device speech enhancement for the audio of one selected Twitch tab, reducing background music and other background sounds while preserving speech.

## Permission justifications

| Permission | Text to paste |
| --- | --- |
| `activeTab` | Grants temporary access after the user invokes MuteTheBeat, so it can verify the selected tab is a supported Twitch page and display its title. The extension does not request access to all websites or read browsing-history records. |
| `tabCapture` | Captures the selected Twitch tab's audio only after the user clicks Enable. Audio is processed locally to enhance speech, played back to the user, and discarded. No video capture, audio recording, or upload occurs. |
| `offscreen` | Keeps the local audio session, Web Audio graph, and model worker running in an offscreen document when the popup closes. Capture resources are released on Disable, tab closure, navigation away, or processing failure. |
| `storage` | Saves only reduction strength, output volume, and Original/Enhanced preference in local extension storage. Captured audio and browsing information are not persisted. |

## Remote code

Select **No, I am not using remote code**.

All executable JavaScript, WASM, and model weights are packaged in the upload ZIP. Runtime fetches resolve only to the extension's own local asset URLs. The `wasm-unsafe-eval` CSP token permits local WebAssembly execution; it does not enable remote JavaScript or JavaScript `eval`. The packaged model archive is data for the packaged inference runtime. There are no CDN, analytics, or inference API calls.

## Data handling disclosures

Disclose local handling even though the developer receives no user data. Do not describe this as “accesses no data.”

- **Website content:** selected Twitch tab audio, used transiently for speech enhancement.
- **Web history / browsing activity:** only the selected/current session tab's URL, title, and identifier, used transiently to validate the site and identify the active session. No history log or history API access.
- Local preferences: reduction, volume, and comparison setting. Explain this in the privacy policy; it is not an analytics log.

Do not declare collection of identity, payment, health, authentication, location, or private communications data; the extension does not collect these categories. It does not inspect Twitch chat or make transcripts. Match the current dashboard wording to the descriptions above.

Certify that data is not sold or transferred to third parties, is not used for unrelated purposes, and is not used for creditworthiness or lending decisions. The extension uses data solely for its visible speech-enhancement feature and sends none to the developer.

## Privacy-policy URL

Publish the supplied `privacy.html` at a publicly accessible HTTPS URL under your control. Paste that URL into the dashboard. A local file path or a `chrome-extension://` URL does not satisfy the public URL requirement.

The same policy is bundled in the extension and linked from its popup. Fill in the developer contact in the store account/listing so the contact route described by the policy is available.

Official references: [privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), [local data handling FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).
