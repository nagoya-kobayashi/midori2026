const fs = require('node:fs');
const path = require('node:path');

const sharedConfig = require(path.join(__dirname, '..', '..', 'config.js'));
const localConfigPath = path.join(__dirname, '..', 'local-config.js');
let localConfig = {};

if (fs.existsSync(localConfigPath)) {
  try {
    localConfig = require(localConfigPath);
  } catch (error) {
    console.warn('[typing-server] failed_to_load_local_config', error && error.message ? error.message : error);
  }
}

const sharedGasSync = sharedConfig && typeof sharedConfig.GAS_SYNC === 'object'
  ? sharedConfig.GAS_SYNC
  : {};
const localGasSync = localConfig && typeof localConfig.GAS_SYNC === 'object'
  ? localConfig.GAS_SYNC
  : {};
const sharedGasWebAppUrl = sharedGasSync.webAppUrl || '';
const localGasWebAppUrl = localGasSync.webAppUrl || '';
const GAME_DURATION_SEC = 5 * 60;

module.exports = {
  SERVER_BIND_HOST: process.env.BIND_HOST || process.env.HOST || localConfig.SERVER_BIND_HOST || localConfig.SERVER_HOST || '0.0.0.0',
  SERVER_PUBLIC_HOST: process.env.SERVER_PUBLIC_HOST || process.env.PUBLIC_HOST || localConfig.SERVER_PUBLIC_HOST || sharedConfig.SERVER_PUBLIC_HOST || 'midori-st-sv',
  SERVER_HOST: process.env.BIND_HOST || process.env.HOST || localConfig.SERVER_BIND_HOST || localConfig.SERVER_HOST || '0.0.0.0',
  SERVER_PORT: Number(process.env.PORT || localConfig.SERVER_PORT || sharedConfig.SERVER_PORT || 3100),
  GAME_DURATION_SEC,
  GAME_DURATION_MS: GAME_DURATION_SEC * 1000,
  START_DELAY_MS: 3000,
  HEARTBEAT_INTERVAL_MS: 10_000,
  HEARTBEAT_TIMEOUT_MS: 35_000,
  LOBBY_BROADCAST_INTERVAL_MS: 5_000,
  SCORE_MODE: 'best',
  PROMPT_QUEUE_SIZE: 220,
  MAX_PLAYER_NAME_LENGTH: 20,
  MAX_CLASS_ID_LENGTH: 16,
  LOG_PREFIX: '[typing-server]',
  GAS_SYNC_ENABLED:
    String(process.env.GAS_SYNC_ENABLED || '').toLowerCase() === 'true'
    || process.env.GAS_SYNC_ENABLED === '1'
    || Boolean(localGasSync.enabled)
    || Boolean(sharedGasSync.enabled),
  GAS_META_URL: String(process.env.GAS_META_URL || localGasSync.metaUrl || localGasWebAppUrl || sharedGasSync.metaUrl || sharedGasWebAppUrl || '').trim(),
  GAS_DATA_URL: String(process.env.GAS_DATA_URL || localGasSync.dataUrl || localGasWebAppUrl || sharedGasSync.dataUrl || sharedGasWebAppUrl || '').trim(),
  GAS_PUSH_URL: String(process.env.GAS_PUSH_URL || localGasSync.pushUrl || localGasWebAppUrl || sharedGasSync.pushUrl || sharedGasWebAppUrl || '').trim(),
  GAS_TIMEOUT_MS: Math.max(1000, Number(process.env.GAS_TIMEOUT_MS || localGasSync.timeoutMs || sharedGasSync.timeoutMs || 8000))
};
