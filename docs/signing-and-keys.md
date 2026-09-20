# Signing and keys

Two independent things sign a TypeLab desktop release, and confusing them wastes
a lot of time:

|                            | Answers                         | Cost                 | Without it                   |
| -------------------------- | ------------------------------- | -------------------- | ---------------------------- |
| **Updater key** (minisign) | "Did this update come from us?" | free, self-generated | The app refuses every update |
| **Apple Developer ID**     | "Will macOS open this at all?"  | US$99/year           | Gatekeeper blocks the app    |
| **Windows code signing**   | "Will SmartScreen stay quiet?"  | ~US$200–400/year     | A warning on first run       |

Only the first is set up. The other two are optional and independent — an
unsigned build still updates itself correctly, it just greets the user with a
warning.

---

## 1. Updater key (required, already configured)

Tauri signs every bundle with a minisign key. The app carries the public half
and refuses any update whose signature does not match.

### Generate

```bash
npm run tauri signer generate -- -w ~/.tauri/typelab.key
```

Press Enter twice to leave the password empty. A password means one more secret
to manage in CI for no real gain — the private key already lives only on your
machine and in the repository secret.

If the file exists, the command aborts. `--force` overwrites it; make sure you
are not destroying a key that has already shipped.

Two files appear:

```
~/.tauri/typelab.key       private — never leaves your control
~/.tauri/typelab.key.pub   public  — goes into version control
```

### Install the public half

Paste the **whole content** of `typelab.key.pub` into
`src-tauri/tauri.conf.json`:

```json
"plugins": {
  "updater": {
    "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6…"
  }
}
```

A placeholder or malformed value does not merely fail at runtime — `tauri build`
stops at the signing step with `failed to decode base64 pubkey`.

### Install the private half

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY   # paste when prompted
```

If the key has a password, also set `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

Then confirm the secret is newer than the key file:

```bash
gh secret list
ls -l ~/.tauri/typelab.key
```

**This check matters.** A mismatched pair passes every gate — the build
succeeds, the release publishes, the manifest check passes — and only fails when
a user presses "download and install".

### Back it up

Copy `~/.tauri/typelab.key` to a password manager or an offline drive. The
GitHub secret is **not** a backup: once stored it cannot be read back.

Losing the private key means every installed copy is stranded. Their built-in
public key only accepts signatures from that one private key, so a replacement
key reaches nobody — every user has to download and reinstall by hand.

### Verify it works

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/typelab.key)"
npm run desktop:build
```

Success looks like this — two bundles **and** two signatures:

```
Finished 2 bundles at:
    …/TypeLab_x.y.z_x64_en-US.msi
    …/TypeLab_x.y.z_x64-setup.exe
Finished 2 updater signatures at:
    …/TypeLab_x.y.z_x64_en-US.msi.sig
    …/TypeLab_x.y.z_x64-setup.exe.sig
```

### When CI says the key is malformed

`Missing comment in secret key` almost always means the key is **absent**, not
malformed: Tauri base64-decodes the value before validating it, so an empty
string fails as a format error. Check that `version.yml` passes
`secrets: inherit` to `release.yml` — a called workflow receives `GITHUB_TOKEN`
automatically and nothing else. This cost three failed releases here.

---

## 2. Apple Developer ID (optional — macOS)

Without this, macOS users see _"TypeLab can't be opened because Apple cannot
check it for malicious software"_ and must right-click → Open, or allow it under
System Settings → Privacy & Security.

Requires an [Apple Developer Program](https://developer.apple.com/programs/)
membership (US$99/year). The same membership covers iOS, should Tauri's mobile
target ever be used here.

### Which certificate

**Developer ID Application** — for distributing outside the App Store. This is
the one to create.

Not to be confused with:

- _Apple Development_ — for running on your own devices during development
- _Apple Distribution_ / _Mac App Distribution_ — for submitting to the App Store
- _Developer ID Installer_ — for `.pkg` installers, which Tauri does not produce

### Create it

1. **Make a Certificate Signing Request.** On the Mac, open _Keychain Access_ →
   menu _Certificate Assistant_ → _Request a Certificate From a Certificate
   Authority_. Enter your email, leave CA Email blank, choose **Saved to disk**.
   Produces `CertificateSigningRequest.certSigningRequest`.

2. **Create the certificate.** At
   [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates)
   → **+** → **Developer ID Application** → upload the CSR → download the
   resulting `.cer`.

3. **Install it.** Double-click the `.cer`. It lands in the login keychain,
   paired with the private key the CSR created.

4. **Export as `.p12`.** In Keychain Access, find the certificate, expand it to
   confirm a private key is attached, right-click → _Export_ → `.p12`. Set a
   password; you will need it in CI.

   Exporting the certificate **without** its private key produces a `.cer`, not
   a `.p12` — if the export dialog does not offer `.p12`, the private key is
   missing and the certificate cannot sign anything.

5. **Base64 it** for the secret:

   ```bash
   openssl base64 -A -in Certificates.p12 | pbcopy
   ```

### Find the signing identity

```bash
security find-identity -v -p codesigning
```

Copy the full name, for example
`Developer ID Application: Your Name (ABCDE12345)`.

### Notarization credentials

Apple must scan the app before macOS will open it without complaint. Two ways to
authenticate; the API key method is preferable because it does not tie CI to one
person's Apple ID.

**App Store Connect API key** — at
[appstoreconnect.apple.com/access/integrations/api](https://appstoreconnect.apple.com/access/integrations/api),
generate a key and note the Issuer ID and Key ID. The `.p8` private key file
downloads **once**.

**Apple ID** — create an app-specific password at
[account.apple.com](https://account.apple.com) → Sign-In and Security →
App-Specific Passwords. Your account password will not work. The Team ID is on
the membership page.

### Secrets to add

```bash
gh secret set APPLE_CERTIFICATE            # base64 of the .p12
gh secret set APPLE_CERTIFICATE_PASSWORD   # the .p12 export password
gh secret set APPLE_SIGNING_IDENTITY       # "Developer ID Application: …"

# API key method
gh secret set APPLE_API_ISSUER
gh secret set APPLE_API_KEY
gh secret set APPLE_API_KEY_PATH

# or Apple ID method
gh secret set APPLE_ID                     # your Apple account email
gh secret set APPLE_PASSWORD               # app-specific password
gh secret set APPLE_TEAM_ID
```

### Wire into the workflow

`tauri-action` reads these from the environment, so they go in the same `env:`
block as the updater key in `.github/workflows/release.yml`:

```yaml
- uses: tauri-apps/tauri-action@v0
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
    APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
    APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
    APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```

Signing and notarization only run on the macOS job; the other platforms ignore
these variables.

### Check the result

```bash
spctl -a -vvv -t install TypeLab.app     # should say: accepted, Notarized Developer ID
xcrun stapler validate TypeLab.app       # should say: The validate action worked
```

### Expect friction on the first attempt

- Notarization takes minutes, sometimes longer — it queues on Apple's side.
- A rejection arrives as a log URL, not a message. `xcrun notarytool log <id>`
  prints the reason.
- The certificate expires after five years, the API key does not expire but can
  be revoked. A release failing long after it last worked is usually this.

---

## 3. Windows code signing (optional, not set up)

SmartScreen warns on any unsigned executable. Quietening it needs an OV or EV
code signing certificate from a commercial CA (~US$200–400/year); EV certificates
require hardware token storage, which does not fit unattended CI without a
cloud-signing service.

`tauri-action` reads `WINDOWS_CERTIFICATE` (base64 `.pfx`) and
`WINDOWS_CERTIFICATE_PASSWORD`.

Worth noting: reputation accrues to the **certificate**, not the app. A brand
new certificate still triggers warnings until enough installs accumulate, so
buying one does not silence SmartScreen immediately.

---

## Summary

| Secret                                | Purpose                  | Set up? |
| ------------------------------------- | ------------------------ | ------- |
| `TAURI_SIGNING_PRIVATE_KEY`           | Updater signatures       | ✅      |
| `APPLE_CERTIFICATE` + `_PASSWORD`     | macOS code signing       | ❌      |
| `APPLE_SIGNING_IDENTITY`              | Which certificate to use | ❌      |
| `APPLE_ID` + `_PASSWORD` + `_TEAM_ID` | Notarization             | ❌      |
| `WINDOWS_CERTIFICATE` + `_PASSWORD`   | SmartScreen              | ❌      |

The updater key is the only one that is not optional. Without it the release
build fails outright — deliberately, so an unsigned update can never ship.
