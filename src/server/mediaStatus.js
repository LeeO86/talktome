const CONNECTION_STATES = new Set(['idle', 'new', 'connecting', 'connected', 'disconnected', 'failed', 'closed']);
const ICE_GATHERING_STATES = new Set(['new', 'gathering', 'complete']);

function transportForDirection(peer, direction) {
  return direction === 'send' ? peer?.sendTransport : peer?.recvTransport;
}

function resetPeerMediaTransportStatus(peer, direction) {
  if (peer?.mediaTransportStates) delete peer.mediaTransportStates[direction];
}

function updatePeerMediaTransportStatus(peer, payload) {
  if (!peer || peer.isBridgePeer || !['user', 'feed', 'guest'].includes(peer.kind)
      || !['send', 'receive'].includes(payload?.direction)) return false;
  const { direction, event, state } = payload;
  const transport = transportForDirection(peer, direction);
  // Older clients do not send an ID. New clients cannot overwrite the state of
  // a replacement transport with a delayed event from an earlier connection.
  if (payload.transportId != null && payload.transportId !== transport?.id) return false;

  let field;
  let value;
  if (event === 'connection-state' && CONNECTION_STATES.has(state)) {
    field = 'connectionState';
    value = state;
  } else if (event === 'ice-gathering-state' && ICE_GATHERING_STATES.has(state)) {
    field = 'iceGatheringState';
    value = state;
  } else if (event === 'ice-candidate-error' && state === 'warning') {
    field = 'iceError';
    value = typeof payload.detail === 'string' ? payload.detail.trim().slice(0, 500) : '';
    value ||= 'ICE candidate negotiation failed';
  } else {
    return false;
  }

  peer.mediaTransportStates ||= {};
  const previous = peer.mediaTransportStates[direction] || {};
  const next = { ...previous, [field]: value };
  if (field === 'connectionState' && ['idle', 'new', 'connected'].includes(value)) next.iceError = null;
  if (field === 'connectionState' && ['idle', 'new'].includes(value)) {
    next.iceGatheringState = value === 'new' ? 'new' : null;
  }
  if (JSON.stringify(previous) === JSON.stringify(next)) return false;
  peer.mediaTransportStates[direction] = next;
  return true;
}

function serverTransportState(transport) {
  if (!transport) return 'idle';
  if (transport.closed) return 'closed';
  if (transport.dtlsState === 'failed') return 'failed';
  if (transport.dtlsState === 'closed') return 'closed';
  if (transport.iceState === 'disconnected') return 'disconnected';
  if (transport.dtlsState === 'connecting') return 'connecting';
  if (transport.dtlsState === 'connected') return 'connected';
  return 'new';
}

function describePeerMediaStatus(peer) {
  // Bridge peers use plain RTP transports rather than browser WebRTC.
  if (!peer || peer.isBridgePeer) return null;
  const directions = ['send', 'receive'].map(direction => {
    const transport = transportForDirection(peer, direction);
    const report = peer.mediaTransportStates?.[direction] || {};
    const serverState = serverTransportState(transport);
    const clientState = report.connectionState;
    const state = clientState === 'idle' ? 'idle'
      : [clientState, serverState].includes('failed') ? 'failed'
      : [clientState, serverState].includes('closed') ? 'closed'
      : [clientState, serverState].includes('disconnected') ? 'disconnected'
      : clientState || serverState;
    return { state, iceGatheringState: report.iceGatheringState || null, iceError: report.iceError || null };
  });
  const states = directions.map(direction => direction.state);
  const iceError = directions.find(direction => direction.iceError)?.iceError || null;
  let state = 'idle';
  let label = 'Media idle';
  if (states.includes('failed')) {
    state = 'failed'; label = 'Media failed';
  } else if (states.some(value => ['disconnected', 'closed'].includes(value))) {
    state = 'interrupted'; label = 'Media interrupted';
  } else if (states.includes('connecting')) {
    state = 'connecting'; label = 'Media connecting';
  } else if (directions.some(direction => direction.iceGatheringState === 'gathering')) {
    state = 'connecting'; label = 'ICE gathering';
  } else if (states.includes('connected')) {
    state = 'connected'; label = 'Media connected';
  } else if (iceError) {
    state = 'warning'; label = 'ICE warning';
  } else if (states.includes('new')) {
    state = 'ready'; label = 'Media ready';
  }
  return { state, label, send: directions[0], receive: directions[1] };
}

module.exports = { resetPeerMediaTransportStatus, updatePeerMediaTransportStatus, describePeerMediaStatus };
