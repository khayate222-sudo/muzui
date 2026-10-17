# WALK international launch

2026-10-17: The owner chose Asia outside mainland China and English-speaking markets first, with English, Simplified Chinese and Traditional Chinese. Mainland China needs a separate distribution and operating plan. This is a launch work list for the existing social/video MVP, not a promise to ship construction, a paid economy, dating or a casino at the same time.

## Implementation and evidence

- Existing core: worlds and station, post viewers with consent, next-post movement, favorites, accounts and recovery, private rooms, reporting/blocking and moderation, private activity journal, consent-based synchronization for WALK-hosted videos, voice and a small cooperative game.
- External video: Douyin official metadata/player integration, Kuaishou source links, bilibili official player. Files are not copied from external services. Synchronization is not available for these external players.
- Initial video library: 13 WALK originals and 41 bilibili links. All 16 existing external videos were rechecked in the actual WALK phone UI; 25 more passed the candidate campaign. Of 29 candidates, one returned 503 and three were not run. See [existing playback](verification/WALK_PLAYBACK_16_2026-10-17.json) and [candidate playback](verification/WALK_PLAYBACK_CANDIDATES_2026-10-17.json). This confirms opening seconds in this cloud Chromium, not every country, device or the entire video.
- Language work: device-language selection plus an explicit local preference; application copy and builtin world names can change without rewriting user posts, names, rooms or messages. Core viewer, room, journal, account, invitation, synchronized viewing, party and game controls are translated. Administration, collection review/publishing and moderation controls now also support all three languages, including collection/provider failures and room/upload/party errors. Source names, creator titles, report reasons, moderation notes and user content retain their original language. Missing report targets use a separate deletion flag so a real post named “削除済み” is never mistaken for translated system copy. Remaining copy and detailed errors still need a final audit; original editorial media retains its source language. Native-speaker review and target-market/device checks have not been completed. This is not a claim of complete localization.
- Operator workflows: [localized collection and moderation validation](VALIDATION_OPERATOR_LOCALES_2026-10-17.md) covers three languages at 320px, failed fetch/retry, explicit review before publication, post editing/deletion and report resolution. Fixture upstreams do not establish real external playback.
- Public runtime: a single Node process with persistent SQLite and media; production Compose forwards legal and voice configuration and fails startup if required policy information is missing. Public posting requires a free account.

## Deployment package (no server or domain has been purchased)

The owner asked for deployable artifacts and instructions first. Existing `.env`, database, uploaded files and backups must be preserved. Build and run only `walk/`, not the separate root website.

1. Choose a host outside mainland China with a persistent disk, Docker Compose and a reachable domain. Measure latency and actual video access from the intended markets before choosing a final location. The current MVP runs one replica; do not start multiple replicas against independent SQLite files.
2. Build the image from this source: `npm run docker:build`. For a registry, use your own immutable image tag or digest. The app image contains no administrator key or operator secrets.
3. Start from [the production settings template](../deploy/production.env.example). Place the reviewed configuration in a file outside this checkout with permission `0600`. Required names: `APP_ORIGIN`, `ADMIN_KEY`, `WALK_OPERATOR_NAME`, `WALK_SUPPORT_EMAIL`, `WALK_TERMS_URL`, `WALK_PRIVACY_URL`, `WALK_POLICY_VERSION`, `WALK_POLICIES_APPROVED`. Use the actual operator and published policy documents; set approval to true only after reviewing those documents. A public HTTPS origin is not the cloud editor URL or localhost.
4. Validate without printing values: `docker compose --env-file /secure/path/walk.env -f compose.production.yaml config --quiet`.
5. Start: `docker compose --env-file /secure/path/walk.env -f compose.production.yaml up -d --build`. The app port binds to `127.0.0.1:3001`; persistent data is in `walk-production-data`. Do not run `down -v` on a volume containing user data.
6. Configure HTTPS using [the Caddyfile](../deploy/Caddyfile) on the same host, with `WALK_DOMAIN` set to the owned hostname. Caddy handles HTTP upgrades for Socket.IO. A different reverse proxy must support WebSockets and adequate upload limits. Keep TLS verification enabled.
7. Check HTTPS `/api/health`, first login, account creation/recovery/deletion, real post upload, two-user movement/viewer counts, invitations, moderation and restart persistence. Test both iOS and Android from the intended markets; cloud Chromium results do not replace this.
8. Configure an actual TURN service and test voice on separate networks. STUN defaults to off in the production Compose file; a local relay test is not a production relay.
9. Before each update, create and verify a backup using the repository backup commands. Follow the existing restore instructions for a rollback that needs older data. Preserve database, media and backup retention policies; never initialize a live installation to apply a migration.

## Operator and store work still requiring outside input

- Actual operator identity, support address, policy documents and retention/deletion practices are still undecided. The code must keep public launch blocked while these are missing.
- Server/domain and deployment credentials do not exist yet. The cloud environment has not been presented as a public application.
- Apple and Google developer accounts, signing identities, public backend origin, store privacy disclosures, screenshots, target-age/content declarations and review submission remain external steps. No account, signature, review or live deployment is invented.
- The initial audience age is still awaiting the owner’s decision. No 18+ gate or store age/content declaration has been assumed.
- iOS permission prompts have English, Simplified Chinese, Traditional Chinese and Japanese resources, following the OS app language. The in-app language selector changes WALK copy; it does not change the OS permission-dialog language.
- Actual iOS compilation and physical-device testing require the relevant tools and devices. Android debug compilation is separate from a signed store release.
- Paid features remain disabled. If added later, design store purchases and entitlements before selling; approvals and voting rights are never for sale.
- Douyin/Kuaishou account-authorized collection needs the actual app registration and permissions. Registering a public link is not an authenticated collection integration.

Deployment configuration and source preparation can be completed without these credentials. Actual public launch and store release cannot be marked complete until their checks are performed.

[海外向けの実装検証（2026-10-17）](VALIDATION_INTERNATIONAL_2026-10-17.md)に、成功した検証と未確認の範囲を記録しています。
