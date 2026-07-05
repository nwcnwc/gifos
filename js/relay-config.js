/*
 * relay-config.js — Where the GifOS relay lives.
 *
 * The relay does two jobs: WebRTC signaling (introducing browsers so they can
 * connect directly, peer-to-peer) and fallback transport (carrying session
 * traffic when P2P can't be established — strict NATs, corporate firewalls).
 *
 * Production relay: deployed from relay/ with `wrangler deploy` and mapped to
 * the branded domain below.
 *
 * For local testing you can override without editing this file:
 *   localStorage.setItem('gifos_relay', 'ws://127.0.0.1:8790');
 */
window.GIFOS_RELAY = 'wss://relay.gifos.app';
