(function attachPromptHistoryCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PromptHistoryCore = api;
})(typeof globalThis === "undefined" ? this : globalThis, function createPromptHistoryCore() {
  "use strict";

  const pairStatsCache = new WeakMap();

  function categoryForPath(path) {
    const name = path.split("/").pop() || path;
    if (name.startsWith("agent-prompt-")) return "agent";
    if (name.startsWith("system-reminder-")) return "reminder";
    if (name.startsWith("system-prompt-")) return "system";
    if (name.startsWith("tool-description-") || name.startsWith("tool-parameter-")) return "tool";
    if (name.startsWith("skill-")) return "skill";
    if (name.startsWith("data-")) return "data";
    return "other";
  }

  function replayVersionIndex(index) {
    if (!index || ![2, 3].includes(index.schemaVersion)) throw new Error("不支持的静态历史数据格式");
    if (!Array.isArray(index.paths) || !Array.isArray(index.blobs) || !Array.isArray(index.versions)) {
      throw new Error("静态历史索引不完整");
    }

    const snapshots = new Map();
    let state = new Map();
    for (const release of index.versions) {
      const next = new Map(state);
      for (const entry of release.sets || []) {
        const [lineageId, pathId, blobId] = entry;
        if (!Number.isInteger(lineageId)) throw new Error(`版本 ${release.version} 包含无效文件谱系`);
        if (!Number.isInteger(pathId) || !index.paths[pathId]) throw new Error(`版本 ${release.version} 包含无效路径`);
        if (!Number.isInteger(blobId) || !index.blobs[blobId]) throw new Error(`版本 ${release.version} 包含无效内容`);
        next.set(lineageId, { pathId, blobId });
      }
      for (const lineageId of release.deletes || []) {
        if (!next.delete(lineageId)) throw new Error(`版本 ${release.version} 删除了不存在的文件谱系`);
      }
      if (next.size !== release.fileCount) throw new Error(`版本 ${release.version} 文件数校验失败`);
      snapshots.set(release.version, next);
      state = next;
    }
    return snapshots;
  }

  function adjacentStats(index, leftVersion, rightVersion) {
    const leftIndex = index.versions.findIndex((release) => release.version === leftVersion);
    const rightIndex = index.versions.findIndex((release) => release.version === rightVersion);
    if (leftIndex < 0 || rightIndex < 0 || leftIndex === rightIndex) return null;
    const reverse = leftIndex > rightIndex;
    const start = Math.min(leftIndex, rightIndex) + 1;
    const end = Math.max(leftIndex, rightIndex) + 1;
    const changed = index.versions
      .slice(start, end)
      .filter((release) => Array.isArray(release.stats) && release.stats.length);
    if (changed.length !== 1) return null;
    const source = changed[0].stats;
    return new Map(
      source.map(([lineageId, additions, deletions]) => [
        lineageId,
        reverse ? { additions: deletions, deletions: additions } : { additions, deletions },
      ]),
    );
  }

  function blobPairStats(index, leftBlobId, rightBlobId) {
    if (leftBlobId == null) {
      const lineCount = index.blobs[rightBlobId]?.[3];
      return Number.isInteger(lineCount) ? { additions: lineCount, deletions: 0 } : null;
    }
    if (rightBlobId == null) {
      const lineCount = index.blobs[leftBlobId]?.[3];
      return Number.isInteger(lineCount) ? { additions: 0, deletions: lineCount } : null;
    }
    if (leftBlobId === rightBlobId) return { additions: 0, deletions: 0 };
    if (!Array.isArray(index.pairStats)) return null;
    let pairs = pairStatsCache.get(index);
    if (!pairs) {
      pairs = new Map(
        index.pairStats.map(([lowBlobId, highBlobId, additions, deletions]) => [
          `${lowBlobId}:${highBlobId}`,
          { additions, deletions },
        ]),
      );
      pairStatsCache.set(index, pairs);
    }
    const lowBlobId = Math.min(leftBlobId, rightBlobId);
    const highBlobId = Math.max(leftBlobId, rightBlobId);
    const stats = pairs.get(`${lowBlobId}:${highBlobId}`);
    if (!stats) return null;
    return leftBlobId === lowBlobId
      ? stats
      : { additions: stats.deletions, deletions: stats.additions };
  }

  function compareSnapshots(index, snapshots, leftVersion, rightVersion) {
    const left = snapshots.get(leftVersion);
    const right = snapshots.get(rightVersion);
    if (!left || !right) throw new Error("未知版本");
    const lineageIds = new Set([...left.keys(), ...right.keys()]);
    const stats = adjacentStats(index, leftVersion, rightVersion);
    const files = [];

    for (const lineageId of lineageIds) {
      const leftEntry = left.get(lineageId) || null;
      const rightEntry = right.get(lineageId) || null;
      if (
        leftEntry &&
        rightEntry &&
        leftEntry.pathId === rightEntry.pathId &&
        leftEntry.blobId === rightEntry.blobId
      ) continue;
      const pathId = rightEntry ? rightEntry.pathId : leftEntry.pathId;
      const path = index.paths[pathId];
      const renamed = leftEntry && rightEntry && leftEntry.pathId !== rightEntry.pathId;
      const lineStats = stats?.get(lineageId) || blobPairStats(
        index,
        leftEntry?.blobId ?? null,
        rightEntry?.blobId ?? null,
      );
      const leftBodyHash = leftEntry ? index.blobs[leftEntry.blobId]?.[2] : null;
      const rightBodyHash = rightEntry ? index.blobs[rightEntry.blobId]?.[2] : null;
      files.push({
        status: !leftEntry ? "A" : !rightEntry ? "D" : renamed ? "R" : "M",
        path,
        pathId,
        oldPath: renamed ? index.paths[leftEntry.pathId] : null,
        lineageId,
        leftBlobId: leftEntry ? leftEntry.blobId : null,
        rightBlobId: rightEntry ? rightEntry.blobId : null,
        category: categoryForPath(path),
        metadataOnly: Boolean(!renamed && leftBodyHash && leftBodyHash === rightBodyHash),
        additions: lineStats?.additions ?? null,
        deletions: lineStats?.deletions ?? null,
      });
    }

    files.sort((leftFile, rightFile) => leftFile.path.localeCompare(rightFile.path));
    const statsAvailable = files.every(
      (file) => Number.isInteger(file.additions) && Number.isInteger(file.deletions),
    );
    return {
      left: leftVersion,
      right: rightVersion,
      filesChanged: files.length,
      metadataOnly: files.filter((file) => file.metadataOnly).length,
      additions: statsAvailable ? files.reduce((total, file) => total + file.additions, 0) : null,
      deletions: statsAvailable ? files.reduce((total, file) => total + file.deletions, 0) : null,
      statsAvailable,
      files,
    };
  }

  function splitTextLines(text) {
    if (!text) return [];
    const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    return lines;
  }

  function stripLeadingMetadata(lines) {
    if (!lines.length || !lines[0].trimStart().startsWith("<!--")) {
      return { lines, offset: 0 };
    }
    const end = lines.findIndex((line) => line.includes("-->"));
    if (end < 0) return { lines, offset: 0 };
    let offset = end + 1;
    while (offset < lines.length && !lines[offset].trim()) offset += 1;
    return { lines: lines.slice(offset), offset };
  }

  // Myers' frontier finds the shortest edit distance in O((N + M)D) time and O(N + M) space.
  function myersEditDistance(left, right) {
    const leftLength = left.length;
    const rightLength = right.length;
    if (!leftLength) return rightLength;
    if (!rightLength) return leftLength;
    const max = leftLength + rightLength;
    const offset = max + 1;
    const frontier = new Int32Array(max * 2 + 3);
    frontier.fill(-1);
    frontier[offset + 1] = 0;

    for (let distance = 0; distance <= max; distance += 1) {
      for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
        const index = offset + diagonal;
        let x;
        if (
          diagonal === -distance ||
          (diagonal !== distance && frontier[index - 1] < frontier[index + 1])
        ) {
          x = frontier[index + 1];
        } else {
          x = frontier[index - 1] + 1;
        }
        let y = x - diagonal;
        while (x < leftLength && y < rightLength && left[x] === right[y]) {
          x += 1;
          y += 1;
        }
        frontier[index] = x;
        if (x >= leftLength && y >= rightLength) return distance;
      }
    }
    return max;
  }

  function diffLineStats(left, right) {
    const distance = myersEditDistance(left, right);
    const common = (left.length + right.length - distance) / 2;
    return { additions: right.length - common, deletions: left.length - common };
  }

  function lcsPrefixLengths(
    left,
    leftStart,
    leftEnd,
    right,
    rightStart,
    rightEnd,
    reverseLeft,
    reverseRight,
  ) {
    const rightLength = rightEnd - rightStart;
    let previous = new Uint32Array(rightLength + 1);
    let current = new Uint32Array(rightLength + 1);
    const leftLength = leftEnd - leftStart;

    for (let leftOffset = 0; leftOffset < leftLength; leftOffset += 1) {
      const leftIndex = reverseLeft ? leftEnd - 1 - leftOffset : leftStart + leftOffset;
      current[0] = 0;
      for (let column = 1; column <= rightLength; column += 1) {
        const rightIndex = reverseRight ? rightEnd - column : rightStart + column - 1;
        current[column] =
          left[leftIndex] === right[rightIndex]
            ? previous[column - 1] + 1
            : Math.max(previous[column], current[column - 1]);
      }
      [previous, current] = [current, previous];
    }
    return previous;
  }

  // Hirschberg reconstruction keeps the LCS memory linear while returning stable line matches.
  function collectLcsMatches(left, leftStart, leftEnd, right, rightStart, rightEnd, matches) {
    const leftLength = leftEnd - leftStart;
    const rightLength = rightEnd - rightStart;
    if (!leftLength || !rightLength) return;
    if (leftLength === 1) {
      for (let index = rightStart; index < rightEnd; index += 1) {
        if (left[leftStart] === right[index]) {
          matches.push([leftStart, index]);
          break;
        }
      }
      return;
    }

    const leftMiddle = leftStart + Math.floor(leftLength / 2);
    const forward = lcsPrefixLengths(
      left,
      leftStart,
      leftMiddle,
      right,
      rightStart,
      rightEnd,
      false,
      false,
    );
    const backward = lcsPrefixLengths(
      left,
      leftMiddle,
      leftEnd,
      right,
      rightStart,
      rightEnd,
      true,
      true,
    );
    let rightSplitOffset = 0;
    let bestLength = -1;
    for (let offset = 0; offset <= rightLength; offset += 1) {
      const length = forward[offset] + backward[rightLength - offset];
      if (length > bestLength) {
        bestLength = length;
        rightSplitOffset = offset;
      }
    }
    const rightMiddle = rightStart + rightSplitOffset;
    collectLcsMatches(left, leftStart, leftMiddle, right, rightStart, rightMiddle, matches);
    collectLcsMatches(left, leftMiddle, leftEnd, right, rightMiddle, rightEnd, matches);
  }

  function lcsOperations(left, right) {
    const matches = [];
    collectLcsMatches(left, 0, left.length, right, 0, right.length, matches);
    const operations = [];
    let leftIndex = 0;
    let rightIndex = 0;
    for (const [matchedLeft, matchedRight] of matches) {
      while (leftIndex < matchedLeft) {
        operations.push({ type: "delete", leftIndex, rightIndex: null });
        leftIndex += 1;
      }
      while (rightIndex < matchedRight) {
        operations.push({ type: "insert", leftIndex: null, rightIndex });
        rightIndex += 1;
      }
      operations.push({ type: "equal", leftIndex, rightIndex });
      leftIndex += 1;
      rightIndex += 1;
    }
    while (leftIndex < left.length) {
      operations.push({ type: "delete", leftIndex, rightIndex: null });
      leftIndex += 1;
    }
    while (rightIndex < right.length) {
      operations.push({ type: "insert", leftIndex: null, rightIndex });
      rightIndex += 1;
    }
    return operations;
  }

  function makeRow(kind, left, right, leftIndex, rightIndex, leftOffset, rightOffset) {
    return {
      kind,
      leftNo: leftIndex === null ? null : leftIndex + 1 + leftOffset,
      left: leftIndex === null ? "" : left[leftIndex],
      rightNo: rightIndex === null ? null : rightIndex + 1 + rightOffset,
      right: rightIndex === null ? "" : right[rightIndex],
    };
  }

  function operationsToRows(operations, left, right, leftOffset, rightOffset, full) {
    const rows = [];
    let cursor = 0;
    while (cursor < operations.length) {
      if (operations[cursor].type === "equal") {
        const start = cursor;
        while (cursor < operations.length && operations[cursor].type === "equal") cursor += 1;
        const run = operations.slice(start, cursor);
        const visible = !full && run.length > 12 ? [...run.slice(0, 4), null, ...run.slice(-4)] : run;
        for (const operation of visible) {
          if (!operation) {
            rows.push({ kind: "skip", count: run.length - 8 });
          } else {
            rows.push(
              makeRow(
                "equal",
                left,
                right,
                operation.leftIndex,
                operation.rightIndex,
                leftOffset,
                rightOffset,
              ),
            );
          }
        }
        continue;
      }

      const deletes = [];
      const inserts = [];
      while (cursor < operations.length && operations[cursor].type !== "equal") {
        const operation = operations[cursor];
        if (operation.type === "delete") deletes.push(operation);
        else inserts.push(operation);
        cursor += 1;
      }
      const span = Math.max(deletes.length, inserts.length);
      for (let index = 0; index < span; index += 1) {
        const deletion = deletes[index];
        const insertion = inserts[index];
        rows.push(
          makeRow(
            deletion && insertion ? "replace" : deletion ? "delete" : "insert",
            left,
            right,
            deletion ? deletion.leftIndex : null,
            insertion ? insertion.rightIndex : null,
            leftOffset,
            rightOffset,
          ),
        );
      }
    }
    return rows;
  }

  function createFileDiff(leftText, rightText, options) {
    const settings = { contentOnly: false, full: false, ...options };
    const rawLeft = splitTextLines(leftText);
    const rawRight = splitTextLines(rightText);
    const leftResult = settings.contentOnly
      ? stripLeadingMetadata(rawLeft)
      : { lines: rawLeft, offset: 0 };
    const rightResult = settings.contentOnly
      ? stripLeadingMetadata(rawRight)
      : { lines: rawRight, offset: 0 };
    const operations = lcsOperations(leftResult.lines, rightResult.lines);
    const additions = operations.filter((operation) => operation.type === "insert").length;
    const deletions = operations.filter((operation) => operation.type === "delete").length;
    return {
      leftLineCount: leftResult.lines.length,
      rightLineCount: rightResult.lines.length,
      additions,
      deletions,
      full: settings.full,
      contentOnly: settings.contentOnly,
      rows: operationsToRows(
        operations,
        leftResult.lines,
        rightResult.lines,
        leftResult.offset,
        rightResult.offset,
        settings.full,
      ),
    };
  }

  return Object.freeze({
    categoryForPath,
    replayVersionIndex,
    adjacentStats,
    blobPairStats,
    compareSnapshots,
    splitTextLines,
    stripLeadingMetadata,
    myersEditDistance,
    diffLineStats,
    lcsOperations,
    createFileDiff,
  });
});
