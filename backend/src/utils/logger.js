'use strict';

/**
 * Structured CloudWatch-friendly JSON logger.
 * Strips potential secrets and stack traces before emitting logs.
 */
function sanitizeError(err) {
  if (!err) return undefined;
  return {
    name: err.name || 'Error',
    code: err.code || undefined,
    message: String(err.message || 'Unknown error').replace(/password=[^;\s]+/gi, 'password=***')
  };
}

function log(level, payload) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    ...payload
  };
  const line = JSON.stringify(entry);
  if (level === 'ERROR') {
    console.error(line);
  } else {
    console.log(line);
  }
}

module.exports = {
  info: (payload) => log('INFO', payload),
  warn: (payload) => log('WARN', payload),
  error: (payload, err) => log('ERROR', { ...payload, error: sanitizeError(err) })
};
