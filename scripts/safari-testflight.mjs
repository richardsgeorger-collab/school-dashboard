// Halo+ for Safari to TestFlight (Loop 308): archives the iPhone/iPad app and the Mac app from what ships (never the
// test build), signs them with George's team through his Xcode account, and uploads them to App Store Connect.
// It never submits anything for App Review: George presses Submit.
//
// The App Store Connect API key (role Developer, made by George) lives only in the macOS Keychain, never in the repo
// or any kept file:
//   security add-generic-password -s haloplus-asc-key -a <KEY_ID>:<ISSUER_ID> -w "$(cat AuthKey_<KEY_ID>.p8)"
// (then delete the downloaded .p8). For the upload, Apple's tool needs the key as a file: it is written to a private
// temporary folder (readable only by this user) and deleted when the upload ends, whatever happens.
//
//   node scripts/safari-testflight.mjs [ios|mac|both]   (default both)
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const TEAM = '5UCXUK4PHZ';
const PROJECT = resolve('safari/Halo+');
const OUT = resolve('.scratch/testflight');
const which = process.argv[2] ?? 'both';

// 1. What ships: the Safari build from extension/, with no test address in it (build-safari.mjs refuses one too).
execFileSync('node', ['scripts/build-safari.mjs'], { stdio: 'inherit' });
const manifest = JSON.parse(readFileSync('safari/build/manifest.json', 'utf8'));
if (/test/i.test(manifest.name) || JSON.stringify(manifest).includes('127.0.0.1')) throw new Error('the test build is in safari/build');
const version = manifest.version;
// Each upload needs a new build number: the time, to the minute (UTC).
const build = new Date().toISOString().replace(/\D/g, '').slice(0, 12);

// 2. The key, from the Keychain.
const keychain = spawnSync('security', ['find-generic-password', '-s', 'haloplus-asc-key', '-g'], { encoding: 'utf8' });
const account = (keychain.stderr + keychain.stdout).match(/"acct"<blob>="([^"]+)"/);
if (keychain.status !== 0 || !account) throw new Error('No App Store Connect key in the Keychain (service haloplus-asc-key). See the top of this file.');
const [keyId, issuer] = account[1].split(':');
const p8 = execFileSync('security', ['find-generic-password', '-s', 'haloplus-asc-key', '-w'], { encoding: 'utf8' }).trim();

const dir = mkdtempSync(join(tmpdir(), 'haloplus-asc-'));
chmodSync(dir, 0o700);
const keyFile = join(dir, `AuthKey_${keyId}.p8`);
try {
  writeFileSync(keyFile, `${p8}\n`, { mode: 0o600 });
  const auth = ['-authenticationKeyPath', keyFile, '-authenticationKeyID', keyId, '-authenticationKeyIssuerID', issuer];
  const exportOptions = join(dir, 'ExportOptions.plist');
  writeFileSync(exportOptions, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>${TEAM}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
`);
  for (const platform of which === 'both' ? ['ios', 'mac'] : [which]) {
    const scheme = platform === 'ios' ? 'Halo+ (iOS)' : 'Halo+ (macOS)';
    const archive = join(OUT, `HaloPlus-${platform}-${version}-${build}.xcarchive`);
    console.log(`\n${scheme} ${version} (${build}): archiving`);
    const settings = [`DEVELOPMENT_TEAM=${TEAM}`, 'CODE_SIGN_STYLE=Automatic', `MARKETING_VERSION=${version}`, `CURRENT_PROJECT_VERSION=${build}`, 'SAFARI_TEST=0'];
    const dest = platform === 'ios' ? 'generic/platform=iOS' : 'generic/platform=macOS';
    let r = spawnSync('xcodebuild', ['archive', '-scheme', scheme, '-destination', dest, '-archivePath', archive, '-allowProvisioningUpdates', ...auth, ...settings], { cwd: PROJECT, stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`${scheme}: archive failed`);
    console.log(`${scheme}: uploading to App Store Connect (TestFlight). Not submitted for review.`);
    r = spawnSync('xcodebuild', ['-exportArchive', '-archivePath', archive, '-exportOptionsPlist', exportOptions, '-exportPath', join(OUT, `export-${platform}-${build}`), '-allowProvisioningUpdates', ...auth], { cwd: PROJECT, stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`${scheme}: upload failed`);
  }
  console.log(`\nUploaded ${version} (${build}). It appears in App Store Connect → TestFlight after Apple processes it (about 10–30 minutes).`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
