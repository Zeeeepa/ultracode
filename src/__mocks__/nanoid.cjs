const { randomBytes } = require("node:crypto");

const CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-";

function nanoid(len = 21) {
  const buf = randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += CHARS[buf[i] % CHARS.length];
  return s;
}

function customAlphabet(chars, defLen = 21) {
  return (n) => {
    const sz = n ?? defLen;
    const buf = randomBytes(sz);
    let s = "";
    for (let i = 0; i < sz; i++) s += chars[buf[i] % chars.length];
    return s;
  };
}

function urlAlphabet(n = 21) {
  return nanoid(n);
}
async function nanoidAsync(n = 21) {
  return nanoid(n);
}

module.exports = { nanoid, customAlphabet, urlAlphabet, nanoidAsync };
