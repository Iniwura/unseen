export function linkedMattermostAccount(identities, username = 'user') {
  if (!Array.isArray(identities)) throw new Error('Switch identity response is not a list');
  const matches = identities.filter((entry) =>
    entry?.bridge_type === 'mattermost' &&
    entry?.external_username === username &&
    typeof entry?.id === 'string' &&
    typeof entry?.bridge_id === 'string'
  );
  if (matches.length !== 1) throw new Error('Expected exactly one previously linked Mattermost account');
  return matches[0];
}

/**
 * Switch Core 0.31.x predates the identity-confirmation protocol.
 * Its authenticated /gateway/auth/me/identities response contains only linked,
 * already-claimed identities with no 'verified' property, and those links
 * participate in owner/addressing checks in that release.
 *
 * Never treat a false flag on newer servers as verified, and never guess
 * compatibility when the server version is missing or unrecognized.
 */
export function assertUsableLinkedIdentity(identity, coreVersion) {
  if (!identity || typeof identity.id !== 'string' || !identity.id ||
      typeof identity.bridge_id !== 'string' || !identity.bridge_id) {
    throw new Error('Linked Mattermost identity is incomplete');
  }
  if (identity.verified === true) return 'verified-confirmation';
  if (identity.verified === false) {
    throw new Error('Mattermost link requires its official confirmation code');
  }
  if (identity.verified === undefined && typeof coreVersion === 'string'
      && coreVersion.startsWith('0.31.')) {
    return 'legacy-claimed-0.31';
  }
  throw new Error('Unknown Switch identity verification state or server version');
}
