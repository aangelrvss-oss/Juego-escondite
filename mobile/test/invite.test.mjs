import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CODE_ALPHABET as SERVER_ALPHABET, CODE_LENGTH as SERVER_LENGTH } from '../../server/hub.ts';
import { CODE_ALPHABET, CODE_LENGTH, codeFromLink, inviteLink, normalizeCode } from '../www/js/game-view.js';

// Enlace de invitación (Plan Maestro D-002 y §2.2; MVP_SCOPE M4; AC-A5). Funciones puras de la interfaz.

test('el alfabeto y la longitud del código coinciden con los del servidor', () => {
  assert.equal(CODE_ALPHABET, SERVER_ALPHABET);
  assert.equal(CODE_LENGTH, SERVER_LENGTH);
});

test('normalizeCode: mayúsculas y sin espacios; rechaza longitudes y caracteres ambiguos', () => {
  assert.equal(normalizeCode(' abc 234 '), 'ABC234');
  assert.equal(normalizeCode('ABC23'), null);
  assert.equal(normalizeCode('ABC2345'), null);
  assert.equal(normalizeCode('ABC10O'), null, 'sin 0/O ni 1/I/L');
  assert.equal(normalizeCode(null), null);
});

test('inviteLink: dirección web del servidor con solo el código', () => {
  assert.equal(inviteLink('wss://algo.trycloudflare.com/ws', 'abc234'), 'https://algo.trycloudflare.com/?sala=ABC234');
  assert.equal(inviteLink('ws://127.0.0.1:8787/ws', 'ABC234'), 'http://127.0.0.1:8787/?sala=ABC234');
  assert.equal(inviteLink('wss://h.example/ws', 'XX'), null, 'código no válido');
  assert.equal(inviteLink('no es una url', 'ABC234'), null);
  assert.equal(inviteLink('ftp://h.example', 'ABC234'), null);
});

test('el enlace no lleva credenciales aunque la URL del servidor las tenga', () => {
  const link = inviteLink('wss://usuario:clave@h.example/ws?token=x', 'ABC234');
  assert.equal(link, 'https://h.example/?sala=ABC234');
});

test('codeFromLink: ida y vuelta, y enlaces sin código o con código no válido', () => {
  assert.equal(codeFromLink(inviteLink('wss://h.example/ws', 'MNP567')), 'MNP567');
  assert.equal(codeFromLink('https://h.example/?sala=mnp567'), 'MNP567');
  assert.equal(codeFromLink('https://h.example/'), null);
  assert.equal(codeFromLink('https://h.example/?sala=<script>'), null);
  assert.equal(codeFromLink('basura'), null);
});

test('normalizeCode: entradas no válidas de todo tipo', () => {
  for (const bad of ['', '      ', 'ABCDE', 'ABCDEFG', 'ABC-23', 'ÁBC234', 'AB C2 34 5', 'ABCI23', 'ABCL23', 'ABC023', 'ABC123', 'ABCO23', 'ab\u200bc23', undefined, 42, {}]) {
    assert.equal(normalizeCode(bad), null, JSON.stringify(bad));
  }
  assert.equal(normalizeCode('a b c 2 3 4'), 'ABC234', 'los espacios intermedios se quitan (código dictado)');
});

test('codeFromLink: parámetros repetidos, en el fragmento, codificados o en otra clave', () => {
  assert.equal(codeFromLink('https://h.example/?sala=ABC234&sala=XYZ789'), 'ABC234', 'se usa el primero');
  assert.equal(codeFromLink('https://h.example/#sala=ABC234'), null, 'en el fragmento no cuenta');
  assert.equal(codeFromLink('https://h.example/?code=ABC234'), null, 'otra clave no cuenta');
  assert.equal(codeFromLink('https://h.example/?sala=%41BC234'), 'ABC234', 'codificado en la URL');
  assert.equal(codeFromLink('https://h.example/?sala=ABC234%00'), null);
  assert.equal(codeFromLink('javascript:alert(1)//?sala=ABC234'), null, 'solo enlaces http(s)');
  assert.equal(codeFromLink('ftp://h.example/?sala=ABC234'), null, 'solo enlaces http(s)');
  assert.equal(codeFromLink('http://192.168.1.10:8787/?sala=ABC234'), 'ABC234', 'http también (servidor en la red local)');
  assert.equal(codeFromLink(''), null);
  assert.equal(codeFromLink(undefined), null);
});

test('inviteLink: el resultado es siempre http(s) con solo la ruta raíz y el parámetro sala', () => {
  const cases = ['wss://h.example/ws', 'wss://h.example:8443/ws', 'ws://192.168.1.10:8787/ws', 'wss://h.example/ruta/rara/ws?x=1#y'];
  for (const url of cases) {
    const link = new URL(inviteLink(url, 'ABC234'));
    assert.ok(link.protocol === 'https:' || link.protocol === 'http:');
    assert.equal(link.pathname, '/');
    assert.deepEqual([...link.searchParams.keys()], ['sala']);
    assert.equal(link.hash, '');
    assert.equal(link.username + link.password, '');
  }
  assert.equal(inviteLink('wss://h.example:8443/ws', 'ABC234'), 'https://h.example:8443/?sala=ABC234', 'conserva el puerto');
  for (const bad of ['javascript:alert(1)', 'file:///C:/x', 'data:text/html,x', '', null]) assert.equal(inviteLink(bad, 'ABC234'), null, String(bad));
});
