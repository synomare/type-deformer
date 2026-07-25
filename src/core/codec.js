// Serialisation primitives for share links and SVG export.

/* ---------------- share via URL ---------------- */
function bytesToB64url(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  var bin = atob(str);
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/* ---------------- SVG export ---------------- */
function escXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escXmlAttr(s) {
  return escXml(String(s)).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export {
  bytesToB64url,
  b64urlToBytes,
  escXml,
  escXmlAttr
};
