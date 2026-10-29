'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const runtimeDirectory = path.join(process.env.LOCALAPPDATA || process.cwd(), 'DetectQuestionBackend');
const deviceFile = path.join(runtimeDirectory, 'license-device-id');
const sessionFile = path.join(runtimeDirectory, 'license-session.json');

function studentIdFromArgs(args) {
  const index = args.indexOf('--student-id');
  const raw = index >= 0 ? args[index + 1] : args.find(arg => /^--student-id=/.test(arg))?.slice(13);
  const studentId = String(raw || '').trim();
  if (!/^[A-Za-z0-9._-]{3,64}$/.test(studentId)) throw new Error('A valid student ID is required.');
  return studentId;
}

function persistentDeviceId() {
  fs.mkdirSync(runtimeDirectory, { recursive: true });
  try {
    const value = fs.readFileSync(deviceFile, 'utf8').trim();
    if (/^[A-Za-z0-9-]{16,128}$/.test(value)) return value;
  } catch (_) {}
  const value = crypto.randomUUID();
  fs.writeFileSync(deviceFile, value, { encoding: 'utf8', mode: 0o600 });
  return value;
}

function priorSession(studentId) {
  try {
    const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    return session.studentId === studentId ? session.sessionId : null;
  } catch (_) { return null; }
}

async function authorizeDesktopSession(studentId) {
  if (process.env.AI_TRANSPORT === 'esp32') {
    const { sharedEsp32Transport } = require('./usb/Esp32SerialTransport');
    const body = await sharedEsp32Transport().request('license', {
      studentId, deviceId: persistentDeviceId(), sessionId: priorSession(studentId)
    });
    if (!body?.allowed || !body?.sessionId) throw new Error('Student ID is not authorized by the gateway.');
    fs.mkdirSync(runtimeDirectory, { recursive: true });
    fs.writeFileSync(sessionFile, JSON.stringify({ studentId, sessionId: body.sessionId, expiresAt: body.expiresAt }), { encoding: 'utf8', mode: 0o600 });
    return body;
  }
  const baseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = String(process.env.SUPABASE_ANON_KEY || '').trim();
  if (!baseUrl || !anonKey) throw new Error('Supabase licensing is not configured.');
  const response = await fetch(`${baseUrl}/functions/v1/license-session`, {
    method: 'POST', headers: { 'content-type': 'application/json', apikey: anonKey, authorization: `Bearer ${anonKey}` },
    body: JSON.stringify({ studentId, deviceId: persistentDeviceId(), sessionId: priorSession(studentId) })
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.allowed || !body?.sessionId) {
    const reason = body?.reason === 'DEVICE_IN_USE' ? 'This student ID is already active on another device.' : 'Student ID is not authorized.';
    throw new Error(reason);
  }
  fs.writeFileSync(sessionFile, JSON.stringify({ studentId, sessionId: body.sessionId, expiresAt: body.expiresAt }), { encoding: 'utf8', mode: 0o600 });
  return body;
}

module.exports = { studentIdFromArgs, authorizeDesktopSession };
