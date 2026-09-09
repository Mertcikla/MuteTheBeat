# Reviewer notes — MuteTheBeat 1.0.0

No login, account, payment, API key, or companion software is required.

1. Open a playing, unmuted live stream or video on `https://www.twitch.tv`. Some streams autoplay muted; unmute the Twitch player first.
2. Click the extension action and then **Enable speech focus**. Initialization loads the local model; the popup reports when processing is active.
3. Adjust **Music reduction**, then compare **Original** and **Enhanced**. Instrumental accompaniment beneath speech is a useful example. Different streams produce different results.
4. Close the popup: audio processing continues. Reopen it and click **Disable** to restore native playback.
5. Navigation away from Twitch or closing the captured tab ends the session. Browser restart does not resume capture.

The only runtime fetches are local `chrome-extension://` model/WASM files. The extension's content security policy restricts connections and workers to itself. No microphone capture or video capture is requested. The service worker obtains a tab audio stream ID after user activation, and an offscreen document consumes it.

The WASM file is a packaged DeepFilterNet3 inference runtime. Its pretrained weights are a packaged `.tar.gz` archive. Their SHA-256 hashes and provenance are in `vendor/assets.json` and `THIRD_PARTY_NOTICES.md`; dependency license notices are in `vendor/`. No remotely hosted code is executed.

Music reduction is model-based speech enhancement. It is not guaranteed removal of all music, and it does not identify a specific speaker. Song vocals and other speakers may remain. The output is mono while processing; Disable restores native stereo.

The publisher has manually checked playback and accepted its quality. Automated tests cover the audio timeline, failure handling, actual popup controls, capture lifecycle, and local asset loading. Extended live testing was stopped at the publisher's request; no 30-minute stability certification is claimed.
