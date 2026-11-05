/**
 * Switch's HTTP operation endpoint wraps tool output in { result: ... }.
 * Work only with explicit collection fields; never infer room or participant IDs.
 */
export function operationList(value, collectionKeys, depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object' || depth > 8) return [];
  for (const key of ['result', ...collectionKeys]) {
    if (!Object.hasOwn(value, key)) continue;
    const child = value[key];
    if (Array.isArray(child)) return child;
    if (child && typeof child === 'object') {
      const nested = operationList(child, collectionKeys, depth + 1);
      if (nested.length > 0) return nested;
    }
  }
  return [];
}

export function roomId(room) {
  return room?.id ?? room?.room_id ?? room?.roomId ?? null;
}

export function findRoomByExactName(rooms, name) {
  const expected = name.toLowerCase();
  return rooms.find((room) => [
    room?.name,
    room?.room_name,
    room?.display_name,
    room?.displayName,
    room?.slug
  ].filter(Boolean).some((label) => String(label).replace(/^#/, '').toLowerCase() === expected));
}
