function hasActiveTalkState(peer, producers = []) {
  return Boolean(
    peer?.pttTalking
    || (Array.isArray(peer?.activeTalkTargets) && peer.activeTalkTargets.length > 0)
    || producers.some((producer) => producer && !producer.closed && !producer.paused)
  );
}

async function stopPeerTransmission(peer, producers = []) {
  if (!peer || typeof peer !== "object") {
    throw new TypeError("Peer is required");
  }

  const uniqueProducers = [...new Set(producers.filter(Boolean))];
  const hadActiveTransmission = hasActiveTalkState(peer, uniqueProducers);
  peer.activeTalkTargets = [];
  peer.pttTalking = false;
  peer.pttStartedAt = 0;

  let pausedProducerCount = 0;
  let closedProducerCount = 0;
  const errors = [];

  for (const producer of uniqueProducers) {
    if (producer.closed || producer.paused) continue;
    try {
      await producer.pause();
      pausedProducerCount += 1;
    } catch (pauseError) {
      try {
        producer.close();
        closedProducerCount += 1;
      } catch (closeError) {
        errors.push(closeError || pauseError);
      }
    }
  }

  return {
    hadActiveTransmission,
    pausedProducerCount,
    closedProducerCount,
    errors,
  };
}

module.exports = {
  hasActiveTalkState,
  stopPeerTransmission,
};
