import { parseUnseenMessage } from './switch-ingest.mjs';
/**
 * Only a fresh, explicitly addressed command from the bound opaque Switch
 * sender in release-room may start the live proof. Never trust display names.
 */
export function matchReleaseProofRequest(frame, { roomId, senderId, decisionId, sha }) {
  if (frame?.event !== 'message' || frame.data?.room_id !== roomId) return null;
  const payload = frame.data?.payload;
  if (!payload || payload.addressed !== true || payload.sender !== senderId) return null;
  const command = parseUnseenMessage(payload.body);
  if (command?.kind !== 'release_request' || command.decisionId !== decisionId ||
      command.sha !== sha) return null;
  return command;
}
