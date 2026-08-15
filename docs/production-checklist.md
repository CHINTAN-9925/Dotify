# Production checklist

## Gameplay and networking

- [ ] Compare 20 seeded sessions against the original prototype and sign off tuning parity.
- [ ] Add prime nodes, homing reward orbs, chain tiers, hunters, positional audio, trails, and minimap to the extracted architecture.
- [ ] Replace whole-arena food state with spawn/consume messages if measured bandwidth exceeds the budget.
- [ ] Generate typed Colyseus state bindings instead of the temporary client wire interfaces.
- [ ] Simulate 5%, 10%, and 20% packet loss with 50–250 ms latency.
- [ ] Verify stationary-and-vulnerable disconnect grace cannot be exploited.

## Security and data

- [ ] Enable Supabase anonymous sign-in, manual identity linking, CAPTCHA/attack protection, backups, and point-in-time recovery.
- [ ] Add Apple and Google providers and test anonymous-to-existing-account conflict handling.
- [ ] Review every RLS policy and database grant with a non-service client.
- [ ] Add profanity filtering, reserved names, account deletion, data export, privacy policy, and terms.
- [ ] Rotate staging and production credentials independently.

## Reliability and operations

- [ ] Instrument tick duration, active rooms, clients, reconnects, heap, event-loop lag, traffic, checkpoint failures, and room crashes.
- [ ] Configure Sentry releases/source maps and alerts without collecting gameplay positions or unnecessary personal data.
- [ ] Add readiness and graceful shutdown behavior that stops matchmaking, checkpoints players, then drains rooms.
- [ ] Load test 1,200 clients for two hours and record cost per concurrent player.
- [ ] Test database restore, server rollback, client upgrade rejection, and regional outage procedures.

## Web and mobile

- [ ] Add final icons, splash screens, store screenshots, privacy manifests, and signed builds.
- [ ] Test Chrome, Safari, Firefox, Edge, Android WebView, and iOS WKWebView.
- [ ] Test orientation changes, safe areas, interrupted audio, background/resume, low-memory termination, and reduced motion.
- [ ] Add adaptive render quality and verify 60 FPS mid-range / 30 FPS low-end targets.
