/*
 * relay-config.js — Where the GifOS relay lives.
 *
 * After deploying relay/ with `wrangler deploy`, set this to your relay URL:
 *   window.GIFOS_RELAY = 'wss://gifos-relay.<your-subdomain>.workers.dev';
 * or, once you map the custom domain in wrangler.toml:
 *   window.GIFOS_RELAY = 'wss://relay.gifos.app';
 *
 * For local testing you can override without editing this file:
 *   localStorage.setItem('gifos_relay', 'ws://127.0.0.1:8790');
 */
window.GIFOS_RELAY = 'wss://gifos-relay.YOUR-SUBDOMAIN.workers.dev';
