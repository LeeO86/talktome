# App Review instructions

Template for App Store Connect → iOS version → App Review Information → Notes.
Replace the placeholders privately. Store the primary account in the dedicated
sign-in fields as well. Keep passwords, session cookies and populated review
instructions out of this public repository.

## Reviewer notes template

Talktome Intercom is a push-to-talk client for a user-selected Talktome server.
The following review accounts provide access without registration or a purchase.

Primary server: {{SERVER_URL}}
Account 1: {{ACCOUNT_1}}
Account 2: {{ACCOUNT_2}}
Password for both accounts: {{REVIEW_PASSWORD}}
Production: {{PRODUCTION_NAME}}

### Sign in

1. Open the app and select Account on the sign-in screen. If profiles already
   exist, choose Add profile to open the sign-in screen.
2. Enter the primary server address, Account 1 and the password, then tap Sign In.
3. Select the production above if a production selector appears. Allow microphone
   access when prompted. The primary HTTPS address needs no manual certificate
   trust; leave Allow self-signed local TLS off for this address.
4. Sign in as Account 2 on a second iPhone/iPad. Alternatively, open the primary
   server address in a microphone-capable browser on a second device and sign in
   there as Account 2. Allow microphone access on that device too.

### Test two-way audio

1. Keep both sessions connected. On the device signed in as Account 1, find
   Account 2 in the target list. It should become available when the other session
   is connected.
2. Press and hold the other account's talk button/card and speak. Audio should
   play on the other device. Release to stop transmitting.
3. Repeat in the opposite direction: on Account 2's device, hold Account 1's talk
   button/card and speak. Reply can also be used to answer the most recent caller.
4. Both accounts can also test the {{CONFERENCE_NAME}} conference target.

Use headphones or separate the devices to avoid acoustic feedback. One signed-in
device can show the interface, but a second connected session is needed to hear
another participant. Bluetooth accessories are optional.

### Optional Apple Watch test

With the Watch app installed and the iPhone session connected, open Session →
Accessories → Watch targets on iPhone. Select Reply and/or fixed targets. One
selected target fills the Watch screen; two targets use fixed upper/lower
buttons, and more targets use a list. Reply keeps its own button even if it
currently addresses a selected fixed target; without a recent caller, Reply
remains visible but unavailable. Hold a target on Watch to talk and release
to stop. In the full-screen view, swipe left while holding to lock talk; tap the
locked target again to stop. With an external iPhone audio output selected, the
ready beep plays through that output instead of the Watch. The Watch controls the iPhone session; audio remains
on iPhone and its selected audio device.

### Backup connection

If the primary address cannot be reached, use {{BACKUP_URL}} as the Server value
with the same accounts and production. Use the same server address on both test
devices. The backup presents a self-signed certificate:

1. Enable Allow self-signed local TLS and tap Sign In.
2. In Trust this certificate?, compare the displayed SHA-256 fingerprint with:
   {{BACKUP_CERT_SHA256}}
3. If it matches, tap Trust and continue. The app pins this certificate for the
   backup host; HTTPS remains enabled. If it differs, contact us before trusting
   it. Use the app for this backup test; browser certificate handling differs.

Review support: {{REVIEW_CONTACT_EMAIL}}

## Publisher checks

- Keep both accounts and the production available throughout App Review.
- Check that the accounts can talk to one another and the shared conference.
- Verify real audio in both directions, including over an external network.
- Keep the primary HTTPS certificate valid. Recheck the backup fingerprint after
  any certificate replacement, and update the private review notes accordingly.
- Check the backup against the intended server identity before entering account
  credentials. A successful page request or login alone does not verify media.
- Keep the review server's actual logging and retention covered by its privacy
  information. The generic client privacy label does not establish those facts.
