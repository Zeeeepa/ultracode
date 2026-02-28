function pLimit(n) {
  const run = async (fn, ...a) => fn(...a);
  run.concurrency = n;
  return run;
}

module.exports = pLimit;
module.exports.pLimit = pLimit;
