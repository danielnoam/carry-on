#!/usr/bin/env bash
# Signs the release APK Gradle built, as Waypage.apk.
#
# Android installs an update only over an app signed with the same key, so the
# key has to be the same one every time: it comes from two repository secrets,
# ANDROID_KEYSTORE_B64 (the .jks, base64) and ANDROID_KEYSTORE_PASSWORD. The
# key alias is "carryon" (the name the key was made under, kept when the
# app became Waypage; swapping keys is a separate step) and its password is
# the store's.
#
# Without the secrets it still signs — with a throwaway key made on the spot,
# so the APK installs and can be tried — and reports signed=false, which is
# what keeps the workflow from publishing it as a release. A published
# throwaway-signed APK would be the one every later update refuses to install
# over.
set -euo pipefail

BT="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)"
IN=android/app/build/outputs/apk/release/app-release-unsigned.apk
KS="$RUNNER_TEMP/waypage.jks"

if [ -n "${KEYSTORE_B64:-}" ] && [ -n "${KEYSTORE_PASSWORD:-}" ]; then
  printf '%s' "$KEYSTORE_B64" | base64 -d > "$KS"
  export KS_PASS="$KEYSTORE_PASSWORD"
  # LifeLog's keystore holds its key under "lifelog"; uploading that one by
  # mistake would otherwise fail later inside apksigner with a vaguer error.
  if ! keytool -list -keystore "$KS" -storepass:env KS_PASS -alias carryon >/dev/null 2>&1; then
    ALIASES="$(keytool -list -keystore "$KS" -storepass:env KS_PASS 2>/dev/null | awk -F, '/PrivateKeyEntry/ {print $1}' | paste -sd, - || true)"
    echo "::error title=Wrong signing key::ANDROID_KEYSTORE_B64 has no key under the alias \"carryon\" (it has: ${ALIASES:-none, or the password is wrong}). Make a keystore with -alias carryon and set it as the secret."
    rm -f "$KS"
    exit 1
  fi
  echo "signed=true" >> "$GITHUB_OUTPUT"
else
  echo "::warning title=Unsigned build::No ANDROID_KEYSTORE_B64 / ANDROID_KEYSTORE_PASSWORD secrets, so this APK is signed with a throwaway key. It installs, but a later build won't install over it — no release is published until the secrets are set."
  export KS_PASS="throwaway-$RANDOM$RANDOM"
  keytool -genkeypair -keystore "$KS" -alias carryon -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KS_PASS" -keypass "$KS_PASS" -dname "CN=Waypage (throwaway)" >/dev/null
  echo "signed=false" >> "$GITHUB_OUTPUT"
fi

"$BT/zipalign" -p -f 4 "$IN" "$RUNNER_TEMP/aligned.apk"
"$BT/apksigner" sign --ks "$KS" --ks-key-alias carryon \
  --ks-pass env:KS_PASS --key-pass env:KS_PASS \
  --out Waypage.apk "$RUNNER_TEMP/aligned.apk"
"$BT/apksigner" verify --print-certs Waypage.apk | head -3
rm -f "$KS"
