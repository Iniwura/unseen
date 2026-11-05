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
