const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { readSyndication, digest } = require("./build_syndication.cjs");

async function verifySyndication(publicRoot, distRoot) {
  const published = await readFile(path.join(publicRoot, "data/syndication.json"), "utf8");
  const provided = JSON.parse(published);
  const expected = await readSyndication(publicRoot, provided.exportedAt);
  const deployed = await readFile(path.join(distRoot, "data/syndication.json"), "utf8");
  if (published !== deployed) throw new Error("Public and dist syndication differ");
  if (digest(provided) !== digest(expected)) {
    throw new Error("Syndication does not match the current analysis, history and withdrawal records");
  }
  return expected;
}

module.exports = { verifySyndication };

if (require.main === module) {
  if (process.argv.length !== 4) throw new Error("Usage: verify_syndication.cjs PUBLIC_ROOT DIST_ROOT");
  verifySyndication(process.argv[2], process.argv[3]).then((feed) => {
    console.log(`Syndication verified: ${feed.items.length} items, ${feed.suppressed.length} suppressions, ${feed.withdrawn.length} withdrawals.`);
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
