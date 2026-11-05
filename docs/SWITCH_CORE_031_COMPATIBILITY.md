# Switch Core v0.31.0 compatibility checkpoint

Reviewed against the **exact** published source tag `switch-v0.31.0`, not Switch main and not Console v0.40.1 source.

## Confirmed version mismatch

- Core 0.31's `GET /gateway/auth/me/identities` returns linked claims **without** a `verified` field. These are already claimed identities used by the server for addressing, not failed verification attempts.
- The later `POST /gateway/collaborations/{bridge_id}/identities/{external_user_row_id}/code` route **does not exist** in Core 0.31. A 404 here was introduced by UNSEEN's wrong-version code; it is not evidence of an invalid account.
- Core 0.31 supports `GET /gateway/version` for authenticated version checks, `GET /gateway/agents/{id}` to read existing policy, and `PUT /gateway/agents/{id}/addressing-policy` to update it as owner or admin.
- A scoped addressing policy's `users` dimension uses Switch's *external user row ID*; the `owner` symbolic identity references the agent's own owner. Gatekeeper is owned by Agent Bootstrap, not by the admin account.
- The existing linked Mattermost `user` account is recognized by this version. Admin may permit *only that linked identity* in `release-room`, while retaining original owner rules. No direct DB edits or permission bypass are necessary.

Pinned source:
- [Core 0.31 identity response](https://github.com/sandbox-quantum/switch/blob/switch-v0.31.0/core/switch_core/gateway/auth_routes.py)
- [Core 0.31 collaboration routes](https://github.com/sandbox-quantum/switch/blob/switch-v0.31.0/core/switch_core/gateway/collaborations.py)
- [Core 0.31 addressing endpoint](https://github.com/sandbox-quantum/switch/blob/switch-v0.31.0/core/switch_core/gateway/agents.py)
- [Core 0.31 policy semantics](https://github.com/sandbox-quantum/switch/blob/switch-v0.31.0/core/switch_core/addressing.py)

## Version-specific recovery

1. The Gatekeeper is already registered, invited to both rooms, and observed connected to both rooms by authenticated WebSocket. The real human test message was delivered but marked `addressed: false`.
2. The current script `authorize:switch` checks admin credentials locally, server version, claimed Mattermost identity, exact agent owner/name, release-room ID and current policy. It fails closed for unknown or unverified newer identity states.
3. `npm.cmd run authorize:switch -- --apply` is an **explicit, scoped admin policy change**. It modifies only Gatekeeper's addressing policy to add one room-scoped human identity and preserves existing owner rules. It then reads back and compares the policy. The user must approve running this command on their Windows server.
4. The script `confirm:link` now reports that no verification code is necessary when Core 0.31 returns a legacy claimed identity; it must not call the absent endpoint.
5. After successfully applying the rule, verify a new genuine human `@UNSEEN Gatekeeper` mention as `addressed:true`, then prove the release gate fail-closed. **Do not report the workflow as live-complete before observing this.**

No further registration, reinstall, account unlink, credential rotation or guessed dashboard URL is part of this recovery.

**Validation status:** Protocol routes and schemas verified against tagged source. Local unit tests added. GitHub Actions configured for Windows and Linux. The live admin policy change has not yet been executed or verified on the user's Switch instance.
