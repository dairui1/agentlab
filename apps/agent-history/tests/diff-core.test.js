const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const core = require("../public/diff-core.js");


function fixtureIndex() {
  return {
    schemaVersion: 3,
    lineageCount: 4,
    paths: [
      "system-prompts/agent-prompt-alpha.md",
      "system-prompts/system-prompt-beta.md",
      "system-prompts/system-prompt-beta-renamed.md",
      "system-prompts/tool-description-added.md",
      "system-prompts/skill-removed.md",
      "system-prompts/system-prompt-beta-final.md",
    ],
    blobs: [
      ["a".repeat(40), 1, "body-alpha", 1],
      ["b".repeat(40), 1, "body-beta-old", 1],
      ["c".repeat(40), 1, "body-alpha", 1],
      ["d".repeat(40), 1, "body-beta-new", 1],
      ["e".repeat(40), 1, "body-removed", 1],
      ["f".repeat(40), 1, "body-added", 1],
      ["0".repeat(40), 1, "body-beta-final", 1],
    ],
    pairStats: [
      [0, 2, 2, 2],
      [1, 3, 3, 1],
      [1, 6, 5, 2],
      [3, 6, 1, 1],
    ],
    versions: [
      {
        version: "1.0.0",
        previousVersion: null,
        fileCount: 3,
        sets: [[0, 0, 0], [1, 1, 1], [2, 4, 4]],
        deletes: [],
        stats: [[0, 1, 0], [1, 1, 0], [2, 1, 0]],
      },
      {
        version: "1.1.0",
        previousVersion: "1.0.0",
        fileCount: 3,
        sets: [[0, 0, 2], [1, 2, 3], [3, 3, 5]],
        deletes: [2],
        stats: [[0, 2, 2], [1, 3, 1], [2, 0, 1], [3, 4, 0]],
      },
      {
        version: "1.2.0",
        previousVersion: "1.1.0",
        fileCount: 3,
        sets: [[1, 5, 6]],
        deletes: [],
        stats: [[1, 1, 1]],
      },
    ],
  };
}


test("release deltas replay without mutating older snapshots", () => {
  const snapshots = core.replayVersionIndex(fixtureIndex());
  assert.deepEqual([...snapshots.get("1.0.0")], [
    [0, { pathId: 0, blobId: 0 }],
    [1, { pathId: 1, blobId: 1 }],
    [2, { pathId: 4, blobId: 4 }],
  ]);
  assert.deepEqual([...snapshots.get("1.1.0")], [
    [0, { pathId: 0, blobId: 2 }],
    [1, { pathId: 2, blobId: 3 }],
    [3, { pathId: 3, blobId: 5 }],
  ]);
});


test("non-adjacent comparisons follow a rename lineage across releases", () => {
  const index = fixtureIndex();
  const snapshots = core.replayVersionIndex(index);
  const comparison = core.compareSnapshots(index, snapshots, "1.0.0", "1.2.0");
  const rename = comparison.files.find((file) => file.lineageId === 1);
  assert.deepEqual(
    [rename.status, rename.oldPath, rename.path, rename.leftBlobId, rename.rightBlobId],
    ["R", index.paths[1], index.paths[5], 1, 6],
  );
  assert.deepEqual(
    [comparison.statsAvailable, comparison.additions, comparison.deletions],
    [true, 8, 5],
  );
});


test("arbitrary forward and reverse comparisons classify M/A/D/R", () => {
  const index = fixtureIndex();
  const snapshots = core.replayVersionIndex(index);
  const forward = core.compareSnapshots(index, snapshots, "1.0.0", "1.1.0");
  const reverse = core.compareSnapshots(index, snapshots, "1.1.0", "1.0.0");

  assert.deepEqual(forward.files.map((file) => [file.status, file.path]), [
    ["M", index.paths[0]],
    ["D", index.paths[4]],
    ["R", index.paths[2]],
    ["A", index.paths[3]],
  ]);
  assert.deepEqual(reverse.files.map((file) => [file.status, file.path]), [
    ["M", index.paths[0]],
    ["A", index.paths[4]],
    ["R", index.paths[1]],
    ["D", index.paths[3]],
  ]);

  const forwardRename = forward.files.find((file) => file.status === "R");
  const reverseRename = reverse.files.find((file) => file.status === "R");
  assert.deepEqual(
    [forwardRename.oldPath, forwardRename.path, forwardRename.leftBlobId, forwardRename.rightBlobId],
    [index.paths[1], index.paths[2], 1, 3],
  );
  assert.deepEqual(
    [forward.statsAvailable, forward.additions, forward.deletions, forward.metadataOnly],
    [true, 9, 4, 1],
  );
  assert.deepEqual(
    [reverse.statsAvailable, reverse.additions, reverse.deletions, reverse.metadataOnly],
    [true, 4, 9, 1],
  );
  assert.deepEqual(
    [reverseRename.oldPath, reverseRename.path, reverseRename.leftBlobId, reverseRename.rightBlobId],
    [index.paths[2], index.paths[1], 3, 1],
  );
});


test("Myers stats and LCS rows agree for repeated and replaced lines", () => {
  const left = ["start", "same", "repeat", "repeat", "old", "end"];
  const right = ["start", "same", "repeat", "new", "repeat", "end"];
  assert.deepEqual(core.diffLineStats(left, right), { additions: 1, deletions: 1 });

  const operations = core.lcsOperations(left, right);
  assert.equal(operations.filter((operation) => operation.type === "insert").length, 1);
  assert.equal(operations.filter((operation) => operation.type === "delete").length, 1);
  assert.equal(operations.filter((operation) => operation.type === "equal").length, 5);
});


test("line stats swap additions and deletions under reverse comparison", () => {
  const left = ["a", "b", "c"];
  const right = ["a", "inserted", "b", "changed"];
  const forward = core.diffLineStats(left, right);
  const reverse = core.diffLineStats(right, left);
  assert.deepEqual(forward, { additions: 2, deletions: 1 });
  assert.deepEqual(reverse, { additions: 1, deletions: 2 });
});


test("content-only diff strips only a closed leading metadata comment", () => {
  const body = Array.from({ length: 40 }, (_, index) => `line ${index + 1}`);
  const left = ["<!--", "name: old", "-->", "", ...body].join("\n") + "\n";
  const rightBody = [...body];
  rightBody[20] = "changed";
  const right = ["<!--", "name: new", "-->", ...rightBody].join("\n") + "\n";

  const compact = core.createFileDiff(left, right, { contentOnly: true, full: false });
  const full = core.createFileDiff(left, right, { contentOnly: true, full: true });
  assert.equal(compact.leftLineCount, 40);
  assert.equal(compact.rightLineCount, 40);
  assert.ok(compact.rows.some((row) => row.kind === "skip"));
  assert.ok(!full.rows.some((row) => row.kind === "skip"));
  assert.equal(full.rows[0].leftNo, 5);
  assert.equal(full.rows[0].rightNo, 4);

  const unclosed = core.stripLeadingMetadata(["<!--", "not metadata after all"]);
  assert.deepEqual(unclosed, { lines: ["<!--", "not metadata after all"], offset: 0 });
});


test("added and deleted files produce one-sided rows", () => {
  const added = core.createFileDiff("", "one\ntwo\n", {});
  const deleted = core.createFileDiff("one\ntwo\n", "", {});
  assert.deepEqual(added.rows.map((row) => row.kind), ["insert", "insert"]);
  assert.deepEqual(deleted.rows.map((row) => row.kind), ["delete", "delete"]);
});


test("Myers counts agree with LCS reconstruction across varied sequences", () => {
  let seed = 0x5eed1234;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let iteration = 0; iteration < 250; iteration += 1) {
    const left = Array.from(
      { length: Math.floor(random() * 16) },
      () => String.fromCharCode(97 + Math.floor(random() * 5)),
    );
    const right = Array.from(
      { length: Math.floor(random() * 16) },
      () => String.fromCharCode(97 + Math.floor(random() * 5)),
    );
    const operations = core.lcsOperations(left, right);
    assert.deepEqual(core.diffLineStats(left, right), {
      additions: operations.filter((operation) => operation.type === "insert").length,
      deletions: operations.filter((operation) => operation.type === "delete").length,
    });
  }
});


test("browser entrypoint discovers all agent data through the static manifest", () => {
  const source = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  assert.doesNotMatch(source, /\/api\//);
  assert.match(source, /\/data\/manifest\.json/);
  assert.match(source, /agent\.historyUrl/);
  assert.match(source, /agent\.changelogUrl/);
  assert.match(source, /release\.promptUrl/);
});
