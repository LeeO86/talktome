(() => {
  'use strict';

  const REDACTED = '********';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const state = {
    authenticated: false,
    view: 'status',
    status: null,
    statusTimer: null,
    deckTimer: null,
    config: null,
    configDoc: null,
    audioDevices: { inputs: [], outputs: [] },
    rawMode: false,
    pressed: new Set(),
    memberOpen: new Set(),
    volumeTimers: new Map(),
    restarting: false,
  };

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  async function api(method, path, body) {
    const options = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetch(path, options);
    if (response.status === 401 && !path.endsWith('/api/login')) {
      showLogin();
      throw new Error('login required');
    }
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text };
    }
    if (!response.ok) {
      throw new Error((data && data.error) || `${response.status} ${response.statusText}`);
    }
    return data;
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) {
      if (child === null || child === undefined) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function badge(text, kind) {
    return el('span', { class: `badge${kind ? ` badge-${kind}` : ''}`, text });
  }

  function setBadge(node, text, kind) {
    node.textContent = text;
    node.className = `badge${kind ? ` badge-${kind}` : ''}`;
  }

  function flash(message, kind = '') {
    const node = $('#flash');
    node.textContent = message;
    node.className = `flash ${kind}`;
    node.classList.remove('is-hidden');
    clearTimeout(flash.timer);
    flash.timer = setTimeout(() => node.classList.add('is-hidden'), 6000);
  }

  function formatDuration(seconds) {
    if (seconds == null || Number.isNaN(seconds)) return '–';
    const s = Math.max(0, Math.floor(seconds));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (d) return `${d}d ${h}h ${m}m`;
    if (h) return `${h}h ${m}m ${sec}s`;
    if (m) return `${m}m ${sec}s`;
    return `${sec}s`;
  }

  function kv(container, rows) {
    container.replaceChildren();
    for (const [label, value] of rows) {
      if (value === undefined) continue;
      container.append(el('dt', { text: label }));
      const dd = el('dd');
      if (value instanceof Node) dd.append(value);
      else dd.textContent = value === null || value === '' ? '–' : String(value);
      container.append(dd);
    }
  }

  function code(text) {
    return el('code', { text });
  }

  function connectionKind(connection) {
    switch (connection) {
      case 'ready':
        return 'ok';
      case 'registered':
      case 'connecting':
      case 'logging-in':
      case 'registering':
        return 'warn';
      case 'conflict':
      case 'kicked':
      case 'disconnected':
        return 'bad';
      default:
        return '';
    }
  }

  function targetKey(target) {
    if (typeof target === 'string') return target;
    if (!target) return null;
    const [kind, id] = Object.entries(target)[0];
    return `${kind.toLowerCase()}:${id}`;
  }

  function targetKind(key) {
    return key.split(':')[0];
  }

  // ---------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------

  function showLogin() {
    state.authenticated = false;
    stopPolling();
    $('#login-overlay').classList.remove('is-hidden');
    $('#topbar').classList.add('is-hidden');
    $('#app').classList.add('is-hidden');
    setTimeout(() => $('#login-form input[name="password"]').focus(), 50);
  }

  function showApp() {
    state.authenticated = true;
    $('#login-overlay').classList.add('is-hidden');
    $('#topbar').classList.remove('is-hidden');
    $('#app').classList.remove('is-hidden');
    routeFromHash();
    startPolling();
  }

  async function boot() {
    try {
      const session = await api('GET', '/api/session');
      $('#login-instance').textContent = session.instance ? `Instance ${session.instance} · v${session.version}` : '';
      $('#topbar-instance').textContent = `Talktome Headless · ${session.instance || ''}`;
      if (session.authenticated) {
        showApp();
        if (session.must_change_password) openPasswordDialog(true);
      } else {
        showLogin();
      }
    } catch (error) {
      showLogin();
      $('#login-message').textContent = error.message;
    }
  }

  $('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = $('#login-message');
    message.textContent = '';
    try {
      const result = await api('POST', '/api/login', {
        username: form.username.value,
        password: form.password.value,
      });
      form.password.value = '';
      showApp();
      if (result.must_change_password) openPasswordDialog(true);
    } catch (error) {
      message.textContent = error.message;
    }
  });

  $('#logout-button').addEventListener('click', async () => {
    try {
      await api('POST', '/api/logout');
    } catch {
      // ignore
    }
    showLogin();
  });

  // ---------------------------------------------------------------------
  // Password dialog
  // ---------------------------------------------------------------------

  function openPasswordDialog(forced) {
    const dialog = $('#password-dialog');
    dialog.dataset.forced = forced ? '1' : '';
    $('#password-intro').textContent = forced
      ? 'The default password is in use. Choose a new one before continuing.'
      : 'Choose a new password for the admin login.';
    $('#password-cancel').classList.toggle('is-hidden', Boolean(forced));
    $('#password-message').textContent = '';
    $('#password-form').reset();
    dialog.classList.remove('is-hidden');
    setTimeout(() => $('#password-form input[name="current"]').focus(), 50);
  }

  $('#password-cancel').addEventListener('click', () => $('#password-dialog').classList.add('is-hidden'));
  $('#change-password-button').addEventListener('click', () => openPasswordDialog(false));

  $('#password-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = $('#password-message');
    message.className = 'form-message';
    if (form.new.value !== form.repeat.value) {
      message.textContent = 'The new passwords do not match.';
      return;
    }
    try {
      const result = await api('POST', '/api/password', { current: form.current.value, new: form.new.value });
      $('#password-dialog').classList.add('is-hidden');
      flash(result.note ? `Password changed. ${result.note}` : 'Password changed and saved to the configuration file.', 'ok');
    } catch (error) {
      message.textContent = error.message;
    }
  });

  // ---------------------------------------------------------------------
  // Restart
  // ---------------------------------------------------------------------

  function confirmDialog(title, text, okLabel) {
    return new Promise((resolve) => {
      const dialog = $('#confirm-dialog');
      $('#confirm-title').textContent = title;
      $('#confirm-text').textContent = text;
      $('#confirm-ok').textContent = okLabel;
      dialog.classList.remove('is-hidden');
      const done = (value) => {
        dialog.classList.add('is-hidden');
        $('#confirm-ok').onclick = null;
        $('#confirm-cancel').onclick = null;
        resolve(value);
      };
      $('#confirm-ok').onclick = () => done(true);
      $('#confirm-cancel').onclick = () => done(false);
    });
  }

  async function restartService(skipConfirm) {
    if (!skipConfirm) {
      const ok = await confirmDialog(
        'Restart service?',
        'The client disconnects from Talktome, applies the saved configuration and reconnects. Audio is interrupted for a few seconds.',
        'Restart'
      );
      if (!ok) return;
    }
    try {
      await api('POST', '/api/restart');
    } catch (error) {
      flash(`Restart failed: ${error.message}`, 'error');
      return;
    }
    state.restarting = true;
    stopPolling();
    flash('Restarting… waiting for the service to come back.', '');
    const started = Date.now();
    const poll = async () => {
      try {
        const session = await api('GET', '/api/session');
        if (Date.now() - started > 1500 && session) {
          state.restarting = false;
          flash('Service is back.', 'ok');
          if (session.authenticated) startPolling();
          else showLogin();
          return;
        }
      } catch {
        // still down
      }
      if (Date.now() - started > 90000) {
        flash('The service did not come back within 90 s. Check the journal on the device.', 'error');
        state.restarting = false;
        return;
      }
      setTimeout(poll, 1000);
    };
    setTimeout(poll, 1500);
  }

  $('#restart-button').addEventListener('click', () => restartService(false));

  // ---------------------------------------------------------------------
  // Routing
  // ---------------------------------------------------------------------

  function routeFromHash() {
    const view = (location.hash || '#status').slice(1);
    showView(['status', 'deck', 'settings'].includes(view) ? view : 'status');
  }

  function showView(view) {
    state.view = view;
    for (const section of $$('.view')) section.classList.toggle('is-hidden', section.id !== `view-${view}`);
    for (const link of $$('.topbar__nav a')) {
      if (link.dataset.view === view) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
    if (view === 'settings' && !state.config) loadConfig();
    if (view === 'deck') refreshDeck();
  }

  window.addEventListener('hashchange', routeFromHash);

  // ---------------------------------------------------------------------
  // Polling
  // ---------------------------------------------------------------------

  function startPolling() {
    stopPolling();
    refreshStatus();
    state.statusTimer = setInterval(() => {
      if (document.visibilityState === 'visible') refreshStatus();
    }, 1000);
    state.deckTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && state.view === 'deck') refreshDeck();
    }, 700);
  }

  function stopPolling() {
    clearInterval(state.statusTimer);
    clearInterval(state.deckTimer);
    state.statusTimer = null;
    state.deckTimer = null;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.authenticated && !state.restarting) refreshStatus();
  });

  // ---------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------

  async function refreshStatus() {
    if (!state.authenticated || state.restarting) return;
    let status;
    try {
      status = await api('GET', '/api/status');
    } catch (error) {
      if (error.message !== 'login required') setBadge($('#badge-connection'), 'no response', 'bad');
      return;
    }
    state.status = status;
    renderStatus(status);
  }

  function renderStatus(status) {
    const snap = status.snapshot;
    $('#topbar-user').textContent = `${snap.user_name}${snap.user_id != null ? ` (#${snap.user_id})` : ''} · ${snap.server_url}`;
    setBadge($('#badge-connection'), snap.connection, connectionKind(snap.connection));
    $('#badge-onair').classList.toggle('is-hidden', !snap.on_air);
    setBadge($('#conn-state'), snap.connection + (snap.detail ? ` · ${snap.detail}` : ''), connectionKind(snap.connection));

    const media = snap.media || {};
    kv($('#conn-details'), [
      ['Server', code(snap.server_url)],
      ['User', `${snap.user_name}${snap.user_id != null ? ` (id ${snap.user_id})` : ''}`],
      ['Production', snap.production || 'Default'],
      ['Registered for', snap.registered_since_unix ? formatDuration(status.now_unix - snap.registered_since_unix) : '–'],
      ['Reconnects', snap.reconnects],
      ['Send transport', media.send_state || '–'],
      ['Receive transport', media.recv_state || '–'],
      ['Consumers', media.consumers != null ? media.consumers : '–'],
      ['Producer', media.producer_id ? code(media.producer_id.slice(0, 8)) : '–'],
      ['ICE (server)', media.ice_servers_announced && media.ice_servers_announced.length ? media.ice_servers_announced.join(', ') : (media.ice_servers && media.ice_servers.length ? media.ice_servers.join(', ') : 'none (direct only)')],
      ['ICE (webrtc)', iceEffectiveLabel(media)],
      ['ICE policy', media.ice_transport_policy || '–'],
      ['Camera tally', snap.on_air ? badge('ON AIR', 'bad') : badge('off')],
    ]);

    // Talk card
    const talking = snap.talking;
    setBadge($('#talk-state'), talking ? (snap.lock_active ? 'talking · locked' : 'talking') : snap.lock_active ? 'locked' : 'idle', talking ? 'ok' : snap.lock_active ? 'info' : '');
    const incoming = $('#incoming');
    incoming.replaceChildren(
      ...snap.incoming.map((entry) => badge(`${entry.from_name} → ${entry.target ? labelForTarget(snap, targetKey(entry.target)) : 'you'}`, 'warn'))
    );
    if (snap.reply_target) {
      incoming.append(badge(`Reply → ${snap.reply_name || targetKey(snap.reply_target)}`, 'info'));
    }
    renderTargets(snap);

    // Audio card
    const audio = status.audio || {};
    const audioOk = snap.audio_ok;
    setBadge($('#audio-state'), audioOk ? 'ok' : 'no device', audioOk ? 'ok' : 'bad');
    kv($('#audio-details'), [
      ['Capture', audio.capture_device ? `${audio.capture_device}${audio.capture_ok ? '' : ' (not open)'}` : status.audio_config.input_device === 'none' ? 'disabled' : 'not open'],
      ['Playback', audio.playback_device ? `${audio.playback_device}${audio.playback_ok ? '' : ' (not open)'}` : status.audio_config.output_device === 'none' ? 'disabled' : 'not open'],
      ['Profile', status.audio_config.profile],
      ['Last error', audio.last_error || '–'],
    ]);
    const level = Math.max(-60, Math.min(0, snap.input_level_db));
    $('#input-meter').style.width = `${((level + 60) / 60) * 100}%`;
    $('#input-level').textContent = snap.input_level_db <= -100 ? '-∞ dBFS' : `${snap.input_level_db.toFixed(1)} dBFS`;

    // GPIO card
    const gpio = status.gpio || {};
    const gpioKind = gpio.backend === 'error' ? 'bad' : gpio.backend === 'disabled' ? '' : gpio.backend === 'mock' ? 'warn' : 'ok';
    setBadge($('#gpio-state'), gpio.backend || 'disabled', gpioKind);
    $('#gpio-error').textContent = gpio.error || '';
    const outputs = $('#gpio-outputs tbody');
    outputs.replaceChildren();
    if (!gpio.outputs || !gpio.outputs.length) {
      outputs.append(el('tr', {}, el('td', { class: 'empty', colspan: 3, text: 'no outputs configured' })));
    }
    for (const output of gpio.outputs || []) {
      const ledClass = output.error ? 'led-amber' : output.active === null ? 'led-unknown' : output.active ? (output.name === 'tally' ? 'led-red' : 'led-on') : '';
      outputs.append(
        el('tr', {}, [
          el('td', { text: output.name }),
          el('td', {}, code(`${output.line}${output.active_low ? ' (active low)' : ''}`)),
          el('td', {}, [el('span', { class: `led ${ledClass}` }), ' ', output.error ? `error: ${output.error}` : output.active === null ? 'not driven' : output.active ? 'active' : 'inactive']),
        ])
      );
    }
    const inputs = $('#gpio-inputs tbody');
    inputs.replaceChildren();
    if (!gpio.inputs || !gpio.inputs.length) {
      inputs.append(el('tr', {}, el('td', { class: 'empty', colspan: 5, text: 'no inputs configured' })));
    }
    for (const input of gpio.inputs || []) {
      inputs.append(
        el('tr', {}, [
          el('td', {}, code(input.line)),
          el('td', { text: input.action.replace('_', ' ') }),
          el('td', { text: input.target || '–' }),
          el('td', {}, [el('span', { class: `led ${input.pressed ? 'led-on' : ''}` }), ' ', input.pressed ? 'pressed' : 'released']),
          el('td', { text: input.events }),
        ])
      );
    }

    // Stream Deck card
    const deck = status.deck || {};
    setBadge($('#deck-state'), !deck.enabled ? 'disabled' : deck.connected ? (deck.mock ? 'mock' : 'connected') : 'not connected', !deck.enabled ? '' : deck.connected ? (deck.mock ? 'warn' : 'ok') : 'bad');
    kv($('#deck-details'), [
      ['Model', deck.kind || '–'],
      ['Serial', deck.serial || '–'],
      ['Layout', deck.connected ? `${deck.rows}×${deck.cols} keys${deck.encoders ? `, ${deck.encoders} dials` : ''}${deck.touchpoints ? `, ${deck.touchpoints} touch points` : ''}` : '–'],
      ['Page', deck.connected ? `${deck.page + 1} / ${deck.pages}${deck.volume_layer ? ' · volume layer' : ''}` : '–'],
      ['Error', deck.error || '–'],
    ]);

    // Service card
    setBadge($('#service-state'), status.restart_pending ? 'restarting' : 'running', status.restart_pending ? 'warn' : 'ok');
    kv($('#service-details'), [
      ['Version', status.version],
      ['Uptime', formatDuration(status.uptime_s)],
      ['Instance', snap.instance],
      ['Configuration', status.config_path ? code(status.config_path) : 'environment only'],
      ['Supervisor', status.systemd ? 'systemd' : 'none'],
      ['Web interface', `${status.web.bind}:${status.web.port}`],
      ['Health endpoint', status.health_port ? `127.0.0.1:${status.health_port}/healthz` : 'off'],
    ]);
  }

  function iceEffectiveLabel(media) {
    const urls = media.ice_servers || [];
    if (!urls.length) return 'none';
    const bridged = urls.filter((url) => url.includes('127.0.0.1') || url.includes('[::1]'));
    if (!bridged.length) return urls.join(', ');
    return `${bridged.join(', ')} — local UDP façade for TURNS/TURN-TCP, not a second TURN hop`;
  }

  function labelForTarget(snap, key) {
    const target = snap.targets.find((t) => targetKey(t.key) === key);
    return target ? target.name : key;
  }

  function renderTargets(snap) {
    const container = $('#targets');
    const existing = new Map($$('.target', container).map((node) => [node.dataset.key, node]));
    const seen = new Set();
    for (const target of snap.targets) {
      const key = targetKey(target.key);
      seen.add(key);
      let node = existing.get(key);
      if (!node) {
        node = buildTargetRow(key, target);
        container.append(node);
      }
      updateTargetRow(node, target);
    }
    for (const [key, node] of existing) {
      if (!seen.has(key)) node.remove();
    }
    if (!snap.targets.length) {
      container.replaceChildren(el('p', { class: 'muted', text: 'No targets assigned to this user yet. Assign them in Talktome Admin.' }));
    }
  }

  function buildTargetRow(key, target) {
    const kind = targetKind(key);
    const row = el('div', { class: 'target', dataset: { key } });
    const flags = el('div', { class: 'target__flags' });
    const controls = el('div', { class: 'target__controls' });
    const talkButton = el('button', { type: 'button', class: 'btn btn-small btn-talk', text: 'Talk' });
    const lockButton = el('button', { type: 'button', class: 'btn btn-small btn-lock', text: 'Lock' });
    const slider = el('input', { type: 'range', min: 0, max: 100, step: 5 });
    const volume = el('span', { class: 'target__volume' });
    const muteButton = el('button', { type: 'button', class: 'btn btn-small btn-mute', text: 'Mute' });

    if (target.can_talk && kind !== 'feed') {
      const press = (event) => {
        event.preventDefault();
        if (state.pressed.has(key)) return;
        state.pressed.add(key);
        talkButton.classList.add('is-active');
        api('POST', '/api/talk', { action: 'press', target: key }).catch((error) => flash(error.message, 'error'));
      };
      const release = () => {
        if (!state.pressed.has(key)) return;
        state.pressed.delete(key);
        talkButton.classList.remove('is-active');
        api('POST', '/api/talk', { action: 'release', target: key }).catch(() => {});
      };
      talkButton.addEventListener('pointerdown', press);
      talkButton.addEventListener('pointerup', release);
      talkButton.addEventListener('pointercancel', release);
      talkButton.addEventListener('pointerleave', release);
      talkButton.addEventListener('contextmenu', (event) => event.preventDefault());
      lockButton.addEventListener('click', () => api('POST', '/api/talk', { action: 'lock', target: key }).catch((error) => flash(error.message, 'error')));
      controls.append(talkButton, lockButton);
    } else {
      controls.append(el('span', { class: 'muted small', text: 'listen only' }), el('span'));
    }
    slider.addEventListener('input', () => {
      volume.textContent = `${slider.value}%`;
      clearTimeout(state.volumeTimers.get(key));
      state.volumeTimers.set(
        key,
        setTimeout(() => api('POST', '/api/audio', { action: 'volume-set', target: key, value: Number(slider.value) / 100 }).catch((error) => flash(error.message, 'error')), 150)
      );
    });
    muteButton.addEventListener('click', () => api('POST', '/api/audio', { action: 'mute-toggle', target: key }).catch((error) => flash(error.message, 'error')));
    controls.append(slider, volume, muteButton);
    const members = el('div', { class: 'target__members is-hidden' });
    const membersToggle = el('button', { type: 'button', class: 'btn btn-small target__members-toggle is-hidden', text: 'Members' });
    membersToggle.addEventListener('click', () => {
      if (state.memberOpen.has(key)) state.memberOpen.delete(key);
      else state.memberOpen.add(key);
      members.classList.toggle('is-hidden', !state.memberOpen.has(key));
    });
    row.append(
      el('div', { class: 'target__name' }, [el('span', { class: 'kind', text: kind }), el('span', { class: 'name' })]),
      flags,
      controls,
      membersToggle,
      members
    );
    row._parts = { flags, talkButton, lockButton, slider, volume, muteButton, members, membersToggle };
    return row;
  }

  function updateTargetRow(node, target) {
    const parts = node._parts;
    $('.name', node).textContent = target.name;
    node.classList.toggle('is-incoming', target.incoming);
    node.classList.toggle('is-talking', target.held || target.locked);
    const flags = [];
    flags.push(badge(target.online ? 'online' : 'offline', target.online ? 'ok' : ''));
    if (target.incoming) flags.push(badge('calling', 'warn'));
    if (target.receiving) flags.push(badge('receiving', 'info'));
    if (target.locked) flags.push(badge('locked', 'ok'));
    if (target.held) flags.push(badge('talking', 'ok'));
    if (target.muted) flags.push(badge('muted', 'bad'));
    parts.flags.replaceChildren(...flags);
    parts.lockButton.classList.toggle('is-active', target.locked);
    parts.muteButton.classList.toggle('is-active', target.muted);
    if (document.activeElement !== parts.slider) {
      parts.slider.value = Math.round(target.volume * 100);
      parts.volume.textContent = `${Math.round(target.volume * 100)}%`;
    }
    const members = target.members || [];
    const showMembers = targetKind(targetKey(target.key)) === 'conference' && members.length;
    parts.membersToggle.classList.toggle('is-hidden', !showMembers);
    if (showMembers) {
      parts.membersToggle.textContent = `Members (${members.length})`;
      parts.members.classList.toggle('is-hidden', !state.memberOpen.has(targetKey(target.key)));
      if (state.memberOpen.has(targetKey(target.key))) {
        renderMembers(parts.members, targetKey(target.key), members);
      }
    } else {
      parts.members.replaceChildren();
      parts.members.classList.add('is-hidden');
    }
  }

  function renderMembers(container, conferenceKey, members) {
    const existing = new Map($$('.member', container).map((node) => [node.dataset.userId, node]));
    const seen = new Set();
    for (const member of members) {
      const id = String(member.user_id);
      seen.add(id);
      let node = existing.get(id);
      if (!node) {
        node = el('div', { class: 'member', dataset: { userId: id } });
        const name = el('span', { class: 'member__name' });
        const slider = el('input', { type: 'range', min: 0, max: 100, step: 5 });
        const mute = el('button', { type: 'button', class: 'btn btn-small btn-mute', text: 'Hear' });
        slider.addEventListener('input', () => {
          const timerKey = `${conferenceKey}/${id}`;
          clearTimeout(state.volumeTimers.get(timerKey));
          state.volumeTimers.set(
            timerKey,
            setTimeout(() => api('POST', '/api/audio', { action: 'member-volume-set', target: conferenceKey, member: `user:${id}`, value: Number(slider.value) / 100 }).catch((error) => flash(error.message, 'error')), 150)
          );
        });
        mute.addEventListener('click', () => api('POST', '/api/audio', { action: 'member-mute-toggle', target: conferenceKey, member: `user:${id}` }).catch((error) => flash(error.message, 'error')));
        node.append(name, slider, mute);
        node._parts = { name, slider, mute };
        container.append(node);
      }
      node._parts.name.textContent = `${member.name}${member.online ? '' : ' (offline)'}${member.receiving ? ' · speaking' : ''}`;
      node.classList.toggle('is-muted', member.muted);
      node._parts.mute.classList.toggle('is-active', !member.muted);
      node._parts.mute.textContent = member.muted ? 'Muted' : 'Hear';
      if (document.activeElement !== node._parts.slider) {
        node._parts.slider.value = Math.round(member.volume * 100);
      }
    }
    for (const [id, node] of existing) {
      if (!seen.has(id)) node.remove();
    }
  }

  $('#clear-locks').addEventListener('click', () => api('POST', '/api/talk', { action: 'clear-locks' }).catch((error) => flash(error.message, 'error')));

  // ---------------------------------------------------------------------
  // Stream Deck view
  // ---------------------------------------------------------------------

  async function refreshDeck() {
    if (!state.authenticated || state.restarting) return;
    let deck;
    try {
      deck = await api('GET', '/api/streamdeck');
    } catch {
      return;
    }
    renderDeck(deck);
  }

  function renderDeck(deck) {
    const grid = $('#deck-grid');
    const message = $('#deck-message');
    setBadge($('#deck-view-state'), !deck.enabled ? 'disabled' : deck.connected ? `${deck.kind}${deck.mock ? ' (mock)' : ''}` : 'not connected', !deck.enabled ? '' : deck.connected ? 'ok' : 'bad');
    $('#deck-page').textContent = deck.connected ? `page ${deck.page + 1}/${deck.pages}${deck.volume_layer ? ' · volume layer' : ''}` : '';
    if (!deck.enabled) {
      message.textContent = 'The Stream Deck surface is disabled in the settings.';
      grid.replaceChildren();
      $('#deck-encoders').replaceChildren();
      $('#deck-touchpoints').replaceChildren();
      return;
    }
    if (!deck.connected) {
      message.textContent = deck.error ? `No Stream Deck connected: ${deck.error}` : 'No Stream Deck connected.';
      grid.replaceChildren();
      $('#deck-encoders').replaceChildren();
      $('#deck-touchpoints').replaceChildren();
      return;
    }
    message.textContent = deck.serial ? `Serial ${deck.serial}` : '';
    grid.style.setProperty('--cols', deck.cols);
    grid.style.setProperty('--key-size', `${Math.min(96, deck.key_size || 72)}px`);
    grid.style.gridTemplateColumns = `repeat(${deck.cols}, var(--key-size, 72px))`;
    const existing = $$('.deck-key', grid);
    if (existing.length !== deck.keys.length) {
      grid.replaceChildren(...deck.keys.map((key) => buildDeckKey(key)));
    }
    for (const key of deck.keys) {
      const button = grid.children[key.index];
      if (!button) continue;
      button.title = key.subtitle ? `${key.title} · ${key.subtitle}` : key.title || key.role;
      const img = $('img', button);
      const src = `/api/streamdeck/key/${key.index}?h=${key.hash}`;
      if (img.dataset.src !== src) {
        img.dataset.src = src;
        img.src = src;
      }
    }
    const encoders = $('#deck-encoders');
    if (encoders.children.length !== deck.encoders) {
      encoders.replaceChildren(
        ...Array.from({ length: deck.encoders }, (_, index) =>
          el('div', { class: 'encoder' }, [
            el('span', { class: 'muted small', text: `Dial ${index + 1}` }),
            el('div', { class: 'encoder__row' }, [
              el('button', { type: 'button', class: 'btn btn-small', text: '−', onclick: () => deckInput({ kind: 'encoder', index, delta: -1 }) }),
              el('button', { type: 'button', class: 'btn btn-small', text: 'Press', onclick: () => deckInput({ kind: 'encoder-press', index }) }),
              el('button', { type: 'button', class: 'btn btn-small', text: '+', onclick: () => deckInput({ kind: 'encoder', index, delta: 1 }) }),
            ]),
          ])
        )
      );
    }
    const touchpoints = $('#deck-touchpoints');
    if (touchpoints.children.length !== deck.touchpoints) {
      touchpoints.replaceChildren(
        ...Array.from({ length: deck.touchpoints }, (_, index) =>
          el('button', { type: 'button', class: 'btn btn-small', text: index === 0 ? '◂ previous page' : 'next page ▸', onclick: () => deckInput({ kind: 'touch', index }) })
        )
      );
    }
  }

  function buildDeckKey(key) {
    const button = el('button', { type: 'button', class: 'deck-key', 'aria-label': key.title || key.role }, el('img', { alt: '' }));
    let down = false;
    const press = (event) => {
      event.preventDefault();
      if (down) return;
      down = true;
      button.classList.add('is-pressed');
      deckInput({ kind: 'key', index: key.index, action: 'down' });
    };
    const release = () => {
      if (!down) return;
      down = false;
      button.classList.remove('is-pressed');
      deckInput({ kind: 'key', index: key.index, action: 'up' });
      setTimeout(refreshDeck, 150);
    };
    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('pointerleave', release);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
    return button;
  }

  function deckInput(body) {
    api('POST', '/api/streamdeck/input', body)
      .then(() => setTimeout(refreshDeck, 120))
      .catch((error) => flash(error.message, 'error'));
  }

  // ---------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------

  const ACTIONS = ['talk', 'reply', 'lock_toggle', 'clear_locks', 'mute_toggle', 'volume_up', 'volume_down'];
  const OUTPUT_NAMES = ['tally', 'talking', 'incoming', 'connected', 'locked'];

  const SECTIONS = [
    {
      key: 'general',
      title: 'General',
      desc: 'instance name and state directory',
      fields: [
        { path: 'instance', label: 'Instance name', type: 'text' },
        { path: 'state_dir', label: 'State directory', type: 'text', nullable: true, help: 'Empty: $STATE_DIRECTORY or /var/lib/talktome-headless/<instance>' },
      ],
    },
    {
      key: 'server',
      title: 'Server & TLS',
      desc: 'Talktome server URL and certificate trust',
      open: true,
      fields: [
        { path: 'server.url', label: 'Server URL', type: 'url', wide: true },
        { path: 'tls.ca_file', label: 'CA file (PEM)', type: 'text', nullable: true, help: 'Trust an additional CA, e.g. for a self-signed server' },
        { path: 'tls.fingerprint_sha256', label: 'Pinned certificate SHA-256', type: 'text', nullable: true, help: 'AB:CD:… fingerprint of the server certificate' },
        { path: 'tls.insecure', label: 'Accept any certificate (development only)', type: 'bool' },
      ],
    },
    {
      key: 'user',
      title: 'Talktome user',
      desc: 'the account this panel logs in with',
      open: true,
      fields: [
        { path: 'user.name', label: 'User name', type: 'text' },
        { path: 'user.password', label: 'Password', type: 'password', help: 'Leave the placeholder to keep the stored password' },
        { path: 'user.production', label: 'Production (id or name)', type: 'text', nullable: true, help: 'Empty: Default production' },
        { path: 'registration.conflict', label: 'If the account is already in use', type: 'select', options: [['takeover', 'Take over the session'], ['wait', 'Wait until it is free']] },
        { path: 'registration.takeover_delay_ms', label: 'Takeover delay (ms)', type: 'number' },
        { path: 'registration.retry_ms', label: 'Retry interval (ms)', type: 'number' },
        { path: 'registration.kicked_retry_ms', label: 'Retry after being kicked (ms)', type: 'number' },
      ],
    },
    {
      key: 'audio',
      title: 'Audio',
      desc: 'devices, codec profile, dimming, jitter buffer',
      fields: [
        { path: 'audio.input_device', label: 'Input device', type: 'device', direction: 'inputs', nullable: true, help: 'Use tone or tone:440 on a VM with no microphone' },
        { path: 'audio.output_device', label: 'Output device', type: 'device', direction: 'outputs', nullable: true, help: 'wav:/tmp/out.wav records the mix when there is no speaker' },
        { path: 'audio.profile', label: 'Codec profile', type: 'select', options: [['standard', 'Standard (20 ms, FEC)'], ['low', 'Low (10 ms)'], ['ultra-low', 'Ultra low (5 ms)']] },
        { path: 'audio.input_gain_db', label: 'Input gain (dB)', type: 'number', step: 0.5 },
        { path: 'audio.default_volume', label: 'Default target volume (0–1)', type: 'number', step: 0.05, min: 0, max: 1 },
        { path: 'audio.dim_db', label: 'Dim amount (dB)', type: 'number', step: 1 },
        { path: 'audio.dim_feeds_while_speaking', label: 'Dim feeds while speaking', type: 'bool' },
        { path: 'audio.dim_when_addressed', label: 'Dim feeds when addressed', type: 'bool' },
        { path: 'audio.jitter_min_ms', label: 'Jitter buffer minimum (ms)', type: 'number' },
        { path: 'audio.jitter_max_ms', label: 'Jitter buffer maximum (ms)', type: 'number' },
        { path: 'audio.reopen_ms', label: 'Device reopen interval (ms)', type: 'number' },
      ],
    },
    {
      key: 'talk',
      title: 'Talk & VOX',
      desc: 'key behaviour and voice trigger',
      fields: [
        { path: 'talk.tap_ms', label: 'Tap threshold (ms)', type: 'number', help: 'A shorter press toggles the talk lock' },
        { path: 'talk.lock_multiple', label: 'Allow several locks at once', type: 'bool' },
        { path: 'vox.enabled', label: 'Voice trigger (VOX)', type: 'bool' },
        { path: 'vox.target', label: 'VOX target', type: 'text', nullable: true, help: 'e.g. conference:1' },
        { path: 'vox.threshold_db', label: 'VOX threshold (dBFS)', type: 'number' },
        { path: 'vox.hang_ms', label: 'VOX hang time (ms)', type: 'number' },
      ],
    },
    {
      key: 'streamdeck',
      title: 'Stream Deck',
      desc: 'device binding, brightness, volume layer',
      fields: [
        { path: 'streamdeck.enabled', label: 'Use a Stream Deck', type: 'bool' },
        { path: 'streamdeck.mock', label: 'Dummy deck (no hardware)', type: 'select', nullable: true, options: [['', 'Real hardware'], ['mk2', 'Stream Deck MK.2 (15 keys)'], ['mini', 'Stream Deck Mini'], ['minimk2', 'Stream Deck Mini MK.2'], ['original', 'Stream Deck Original'], ['originalv2', 'Stream Deck Original V2'], ['xl', 'Stream Deck XL'], ['xlv2', 'Stream Deck XL V2'], ['plus', 'Stream Deck +'], ['plusxl', 'Stream Deck + XL'], ['neo', 'Stream Deck Neo'], ['pedal', 'Stream Deck Pedal']], help: 'Pick a model to test the Stream Deck tab without a USB deck. TALKTOME_MOCK_STREAMDECK overrides this.' },
        { path: 'streamdeck.serial', label: 'Serial number', type: 'text', nullable: true, help: 'Empty: first deck found' },
        { path: 'streamdeck.brightness', label: 'Brightness (%)', type: 'number', min: 0, max: 100 },
        { path: 'streamdeck.font_path', label: 'Font file', type: 'text' },
        { path: 'streamdeck.volume_step', label: 'Volume step per key/dial tick', type: 'number', step: 0.01, min: 0.01, max: 1 },
        { path: 'streamdeck.volume_layer_timeout_s', label: 'Volume layer timeout (s)', type: 'number' },
        { path: 'streamdeck.pedal_target', label: 'Pedal middle switch target', type: 'text', nullable: true },
        { path: 'streamdeck.layout', label: 'Key layout overrides (JSON object)', type: 'json', wide: true },
      ],
    },
    {
      key: 'gpio',
      title: 'GPIO',
      desc: 'tally and talk lines',
      fields: [
        { path: 'gpio.enabled', label: 'Use GPIO', type: 'bool' },
        { path: 'gpio.chip', label: 'GPIO chip', type: 'text', nullable: true, help: 'Only needed when lines are given as offsets (e.g. gpiochip0)' },
        { type: 'gpio-outputs' },
        { type: 'gpio-inputs' },
      ],
    },
    {
      key: 'network',
      title: 'Network & ICE',
      desc: 'STUN/TURN overrides and recovery',
      fields: [
        { path: 'ice.transport_policy', label: 'ICE transport policy', type: 'select', nullable: true, options: [['', 'From server'], ['all', 'all'], ['relay', 'relay (TURN only)']] },
        { path: 'ice.ipv6', label: 'Gather IPv6 ICE candidates', type: 'bool', help: 'Off by default. Enable only if this device has a global IPv6 address.' },
        { path: 'network.ice_disconnect_grace_ms', label: 'ICE disconnect grace (ms)', type: 'number' },
        { path: 'ice.servers', label: 'ICE server overrides (JSON array, testing only)', type: 'json', nullable: true, wide: true, help: '[{ "urls": ["turn:host:3478"], "username": "u", "credential": "p" }]' },
      ],
    },
    {
      key: 'web',
      title: 'Web interface & health',
      desc: 'this interface, health endpoint, logging',
      fields: [
        { path: 'web.enabled', label: 'Web interface', type: 'bool' },
        { path: 'web.bind', label: 'Web bind address', type: 'text' },
        { path: 'web.port', label: 'Web port', type: 'number', min: 1, max: 65535 },
        { path: 'health.port', label: 'Health port (/healthz)', type: 'number', nullable: true, min: 1, max: 65535, help: 'Empty: disabled' },
        { path: 'health.bind', label: 'Health bind address', type: 'text' },
        { path: 'log.level', label: 'Log level', type: 'select', options: [['error', 'error'], ['warn', 'warn'], ['info', 'info'], ['debug', 'debug'], ['trace', 'trace']] },
        { path: 'log.format', label: 'Log format', type: 'select', options: [['auto', 'auto'], ['json', 'json'], ['text', 'text']] },
      ],
    },
  ];

  function getPath(doc, path) {
    return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), doc);
  }

  function setPath(doc, path, value) {
    const keys = path.split('.');
    let cursor = doc;
    for (const key of keys.slice(0, -1)) {
      if (typeof cursor[key] !== 'object' || cursor[key] === null) cursor[key] = {};
      cursor = cursor[key];
    }
    cursor[keys[keys.length - 1]] = value;
  }

  async function loadConfig() {
    const message = $('#settings-message');
    message.textContent = '';
    try {
      const [config, devices] = await Promise.all([api('GET', '/api/config'), api('GET', '/api/config/audio-devices').catch(() => ({ inputs: [], outputs: [] }))]);
      state.config = config;
      state.configDoc = JSON.parse(JSON.stringify(config.document));
      state.audioDevices = devices;
      $('#settings-path').textContent = config.editable ? `Saved to ${config.path} (${config.format}). Changes apply after a restart.` : 'This instance runs from environment variables only; settings cannot be saved.';
      const env = $('#settings-env');
      if (config.env_overrides.length) {
        env.textContent = `Environment overrides are active and take precedence over the file on the next start: ${config.env_overrides.join(', ')}`;
        env.classList.remove('is-hidden');
      } else {
        env.classList.add('is-hidden');
      }
      renderSettingsForm();
      $('#raw-json').value = JSON.stringify(state.configDoc, null, 2);
      const disabled = !config.editable;
      $('#settings-save').disabled = disabled;
      $('#settings-save-restart').disabled = disabled;
    } catch (error) {
      message.className = 'form-message';
      message.textContent = error.message;
    }
  }

  function renderSettingsForm() {
    const form = $('#settings-form');
    form.replaceChildren();
    const doc = state.configDoc;
    for (const section of SECTIONS) {
      const details = el('details', section.open ? { open: '' } : {});
      details.append(el('summary', {}, [section.title, el('span', { class: 'desc', text: section.desc })]));
      const fields = el('div', { class: 'fields' });
      for (const field of section.fields) {
        fields.append(renderField(field, doc));
      }
      details.append(fields);
      form.append(details);
    }
  }

  function renderField(field, doc) {
    if (field.type === 'gpio-outputs') return renderGpioOutputs(doc);
    if (field.type === 'gpio-inputs') return renderGpioInputs(doc);
    const value = getPath(doc, field.path);
    const wrapper = el('label', { class: `field${field.wide ? ' wide' : ''}`, dataset: { path: field.path } });
    if (field.type === 'bool') {
      wrapper.className = `field-check${field.wide ? ' wide' : ''}`;
      const input = el('input', { type: 'checkbox', dataset: { path: field.path, type: 'bool' } });
      input.checked = Boolean(value);
      wrapper.append(input, el('span', { text: field.label }));
      return wrapper;
    }
    wrapper.append(el('span', { text: field.label }));
    let input;
    if (field.type === 'select') {
      input = el('select', { dataset: { path: field.path, type: 'select', nullable: field.nullable ? '1' : '' } });
      for (const [optionValue, label] of field.options) {
        input.append(el('option', { value: optionValue, text: label }));
      }
      input.value = value == null ? '' : String(value);
    } else if (field.type === 'device') {
      const listId = `devices-${field.path.replace(/\W/g, '-')}`;
      input = el('input', { type: 'text', list: listId, placeholder: 'default device', dataset: { path: field.path, type: 'text', nullable: '1' } });
      input.value = value == null ? '' : value;
      const list = el('datalist', { id: listId });
      for (const device of state.audioDevices[field.direction] || []) {
        list.append(el('option', { value: device.id, text: device.label }));
      }
      for (const special of field.direction === 'inputs' ? ['none', 'tone', 'tone:440', 'tone:1000'] : ['none', 'wav:/tmp/talktome-out.wav']) {
        list.append(el('option', { value: special }));
      }
      wrapper.append(list);
    } else if (field.type === 'json') {
      input = el('textarea', { rows: 3, dataset: { path: field.path, type: 'json', nullable: field.nullable ? '1' : '' } });
      input.value = value == null ? '' : JSON.stringify(value, null, 1);
    } else if (field.type === 'password') {
      input = el('input', { type: 'password', autocomplete: 'off', dataset: { path: field.path, type: 'password' } });
      input.value = value == null ? '' : value;
    } else {
      input = el('input', {
        type: field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text',
        dataset: { path: field.path, type: field.type === 'number' ? 'number' : 'text', nullable: field.nullable ? '1' : '' },
      });
      if (field.step != null) input.step = field.step;
      if (field.min != null) input.min = field.min;
      if (field.max != null) input.max = field.max;
      if (field.type === 'number') input.inputMode = 'decimal';
      input.value = value == null ? '' : value;
    }
    wrapper.append(input);
    if (field.help) wrapper.append(el('span', { class: 'help', text: field.help }));
    return wrapper;
  }

  function renderGpioOutputs(doc) {
    const outputs = getPath(doc, 'gpio.outputs') || {};
    const editor = el('div', { class: 'list-editor', dataset: { editor: 'gpio-outputs' } });
    editor.append(el('h3', { class: 'subheading', text: 'Outputs (leave the line empty to disable)' }));
    for (const name of OUTPUT_NAMES) {
      const current = outputs[name] || {};
      editor.append(
        el('div', { class: 'list-row', dataset: { output: name } }, [
          el('label', { class: 'field' }, [el('span', { text: `${name} line` }), el('input', { type: 'text', placeholder: 'GPIO17', dataset: { field: 'line' }, value: current.line || '' })]),
          el('label', { class: 'field-check' }, [el('input', { type: 'checkbox', dataset: { field: 'active_low' }, ...(current.active_low ? { checked: '' } : {}) }), el('span', { text: 'active low' })]),
        ])
      );
    }
    return editor;
  }

  function renderGpioInputs(doc) {
    const inputs = getPath(doc, 'gpio.inputs') || [];
    const editor = el('div', { class: 'list-editor', dataset: { editor: 'gpio-inputs' } });
    const rows = el('div', { class: 'list-editor' });
    const addRow = (input) => rows.append(gpioInputRow(input));
    editor.append(el('h3', { class: 'subheading', text: 'Inputs' }), rows, el('div', {}, el('button', { type: 'button', class: 'btn btn-small', text: '+ Add input', onclick: () => addRow({ line: '', action: 'talk', target: '', active_low: true, debounce_ms: 20 }) })));
    for (const input of inputs) addRow(input);
    return editor;
  }

  function gpioInputRow(input) {
    const row = el('div', { class: 'list-row', dataset: { input: '1' } });
    const action = el('select', { dataset: { field: 'action' } });
    for (const name of ACTIONS) action.append(el('option', { value: name, text: name.replace('_', ' ') }));
    action.value = input.action || 'talk';
    row.append(
      el('label', { class: 'field' }, [el('span', { text: 'Line' }), el('input', { type: 'text', placeholder: 'GPIO22', dataset: { field: 'line' }, value: input.line || '' })]),
      el('label', { class: 'field' }, [el('span', { text: 'Action' }), action]),
      el('label', { class: 'field' }, [el('span', { text: 'Target' }), el('input', { type: 'text', placeholder: 'conference:1', dataset: { field: 'target' }, value: input.target || '' })]),
      el('label', { class: 'field' }, [el('span', { text: 'Debounce (ms)' }), el('input', { type: 'number', min: 0, dataset: { field: 'debounce_ms' }, value: input.debounce_ms != null ? input.debounce_ms : 20 })]),
      el('label', { class: 'field-check' }, [el('input', { type: 'checkbox', dataset: { field: 'active_low' }, ...(input.active_low ? { checked: '' } : {}) }), el('span', { text: 'active low' })]),
      el('button', { type: 'button', class: 'btn btn-small btn-danger', text: 'Remove', onclick: () => row.remove() })
    );
    return row;
  }

  function collectDocument() {
    if (state.rawMode) {
      return JSON.parse($('#raw-json').value);
    }
    const doc = JSON.parse(JSON.stringify(state.configDoc));
    for (const input of $$('#settings-form [data-path]', document)) {
      if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement || input instanceof HTMLTextAreaElement)) continue;
      const path = input.dataset.path;
      const type = input.dataset.type;
      const nullable = input.dataset.nullable === '1';
      let value;
      if (type === 'bool') value = input.checked;
      else if (type === 'number') {
        const text = input.value.trim();
        if (text === '') value = nullable ? null : getPath(doc, path);
        else {
          value = Number(text);
          if (Number.isNaN(value)) throw new Error(`${path}: not a number`);
        }
      } else if (type === 'json') {
        const text = input.value.trim();
        if (text === '') value = nullable ? null : {};
        else {
          try {
            value = JSON.parse(text);
          } catch (error) {
            throw new Error(`${path}: invalid JSON (${error.message})`);
          }
        }
      } else if (type === 'select') {
        value = input.value === '' && nullable ? null : input.value;
      } else {
        const text = input.value;
        value = text.trim() === '' && nullable ? null : text;
      }
      setPath(doc, path, value);
    }
    const outputs = {};
    for (const row of $$('[data-editor="gpio-outputs"] [data-output]')) {
      const line = $('[data-field="line"]', row).value.trim();
      if (!line) continue;
      outputs[row.dataset.output] = { line, active_low: $('[data-field="active_low"]', row).checked };
    }
    setPath(doc, 'gpio.outputs', outputs);
    const inputs = [];
    for (const row of $$('[data-editor="gpio-inputs"] [data-input]')) {
      const line = $('[data-field="line"]', row).value.trim();
      if (!line) continue;
      const target = $('[data-field="target"]', row).value.trim();
      inputs.push({
        line,
        action: $('[data-field="action"]', row).value,
        target: target || null,
        active_low: $('[data-field="active_low"]', row).checked,
        debounce_ms: Number($('[data-field="debounce_ms"]', row).value || 20),
      });
    }
    setPath(doc, 'gpio.inputs', inputs);
    return doc;
  }

  async function saveConfig(thenRestart) {
    const message = $('#settings-message');
    message.className = 'form-message';
    message.textContent = '';
    let doc;
    try {
      doc = collectDocument();
    } catch (error) {
      message.textContent = error.message;
      return;
    }
    try {
      const result = await api('PUT', '/api/config', { document: doc });
      message.className = 'form-message ok';
      message.textContent = `Saved to ${result.path}. ${thenRestart ? 'Restarting…' : 'Restart the service to apply the changes.'}`;
      await loadConfig();
      if (thenRestart) restartService(true);
      else flash('Configuration saved. Restart to apply.', 'ok');
    } catch (error) {
      message.textContent = error.message;
    }
  }

  $('#settings-save').addEventListener('click', () => saveConfig(false));
  $('#settings-save-restart').addEventListener('click', () => saveConfig(true));
  $('#settings-reload').addEventListener('click', loadConfig);
  $('#toggle-raw').addEventListener('click', () => {
    if (!state.rawMode) {
      try {
        $('#raw-json').value = JSON.stringify(collectDocument(), null, 2);
      } catch (error) {
        flash(error.message, 'error');
        return;
      }
    } else {
      try {
        state.configDoc = JSON.parse($('#raw-json').value);
        renderSettingsForm();
      } catch (error) {
        flash(`Raw JSON is invalid: ${error.message}`, 'error');
        return;
      }
    }
    state.rawMode = !state.rawMode;
    $('#raw-editor').classList.toggle('is-hidden', !state.rawMode);
    $('#settings-form').classList.toggle('is-hidden', state.rawMode);
    $('#toggle-raw').textContent = state.rawMode ? 'Form editor' : 'Raw editor';
  });

  boot();
})();
