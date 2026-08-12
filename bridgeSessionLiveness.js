function shouldCloseBridgeSessionAfterEventStreamClose(session) {
  if (!session || session.closed) return false;
  return !session.eventStreams || session.eventStreams.size === 0;
}

module.exports = { shouldCloseBridgeSessionAfterEventStreamClose };
