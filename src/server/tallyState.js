const TALLY_BUSES = Object.freeze({ PGM: "pgm", PRV: "prv" });

function normalizeTallyBus(value) {
  const normalized = String(value ?? TALLY_BUSES.PGM).trim().toLowerCase();
  if (normalized === "pgm" || normalized === "program") return TALLY_BUSES.PGM;
  if (normalized === "prv" || normalized === "preview") return TALLY_BUSES.PRV;
  throw new Error("bus must be pgm or prv");
}

function createTallyStateStore() {
  const states = new Map();
  const keyFor = (productionId) => String(productionId ?? "default");

  function get(productionId) {
    const state = states.get(keyFor(productionId));
    return state
      ? { pgmUser: state.pgmUser, prvUser: state.prvUser }
      : { pgmUser: null, prvUser: null };
  }

  function set(productionId, bus, user) {
    const normalizedBus = normalizeTallyBus(bus);
    const state = get(productionId);
    const property = normalizedBus === TALLY_BUSES.PGM ? "pgmUser" : "prvUser";
    const previousUser = state[property];
    state[property] = typeof user === "string" && user.trim() ? user.trim() : null;
    states.set(keyFor(productionId), state);
    return { ...state, previousUser, bus: normalizedBus, user: state[property] };
  }

  function remove(productionId) {
    states.delete(keyFor(productionId));
  }

  return { get, set, remove };
}

module.exports = { TALLY_BUSES, normalizeTallyBus, createTallyStateStore };
