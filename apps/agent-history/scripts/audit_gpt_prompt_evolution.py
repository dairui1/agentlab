#!/usr/bin/env python3
"""Reproduce the frozen template receipt and the public side-by-side diff input."""

import argparse
import difflib
import hashlib
import json
from pathlib import Path
import re
import subprocess


ROOT = Path(__file__).resolve().parents[1]
COLLECTION_REVISION = "3713c676ab49fa0a9f58dc693a153b5c12618dd6"
OFFICIAL_REVISION = "588b781ab4924ce7352488394028e63d74cf807f"
CACHE = ROOT / ".cache/gpt-prompt-evolution"
OUTPUT = ROOT / "public/capabilities/gpt-prompt-evolution-sources.json"
DIFF_OUTPUT = ROOT / "public/capabilities/gpt-prompt-evolution-diff.json"
SOURCES = (
    ("gpt-5.5", "c13cc50bc068912608769224bf2c5ffcb5f534856fd631f3df0ef72a8a3108a4", "8733d6c3ca22d7540e6e13132415de375ffb95d2", "2026-07-08T14:20:35Z"),
    ("gpt-5.6", "40f053be80a6ee153b007dc4805d9f480d3847204e80c7f643ee5725054ef42d", "74a363bcdad5834bd7a27c05925dc7266f5bca24", "2026-09-04T20:42:15Z"),
    ("gpt-6-astra", "ffbf2e1b8af4d5c99bb0b78f8b71509dbf4fd645e3f1146aa4c506c671f01f11", "f5c8e107370e6fed7dc0342e6667f168f4e47eb1", "2026-09-04T20:40:39Z"),
)
OFFICIAL_SHA = "d7136a413cfac1b5b1686d9e0dcc5c80ca05bebed5e9fc3911376561d0ef6ee8"


def sha256(value):
    return hashlib.sha256(value).hexdigest()


def read_source(path, url, expected_sha, fetch):
    if not path.exists() and fetch:
        path.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["curl", "--fail", "--silent", "--show-error", "--location",
                        "--max-time", "60", "--output", str(path), url], check=True)
    data = path.read_bytes()
    if sha256(data) != expected_sha:
        raise ValueError(f"Source digest mismatch: {path}")
    return data


def normalize_layout(text):
    # Deliberately narrow: do not erase words, numbers, punctuation or negation.
    text = text.translate(str.maketrans({"\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"'}))
    text = text.replace("`", "").replace("**", "")
    text = re.sub(r"^# Destructive Actions$", "# Destructive actions", text, flags=re.M)
    return re.sub(r"\s+", " ", text).strip()


def metrics(data):
    text = data.decode("utf-8")
    lines = text.splitlines()
    return {
        "bytes": len(data), "characters": len(text), "lines": len(lines),
        "nonemptyLines": sum(bool(line.strip()) for line in lines),
        "whitespaceWords": len(text.split()),
        "headings": [{"line": i, "level": len(m[1]), "title": m[2]}
                     for i, line in enumerate(lines, 1)
                     if (m := re.match(r"^(#{1,3}) (.+)$", line))],
    }


def build_receipt(fetch=False):
    corpus, sources = {}, []
    for name, digest, last_commit, date in SOURCES:
        path = f"OpenAI/Codex/{name}.md"
        raw_url = f"https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/{COLLECTION_REVISION}/{path}"
        data = read_source(CACHE / COLLECTION_REVISION / f"{name}.md", raw_url, digest, fetch)
        corpus[name] = data.decode("utf-8")
        sources.append({
            "id": name, "path": path, "sha256": digest,
            "url": f"https://github.com/asgeirtj/system_prompts_leaks/blob/{COLLECTION_REVISION}/{path}",
            "rawUrl": raw_url, "lastFileCommit": last_commit, "lastFileCommitAt": date,
            **metrics(data),
        })
    official_path = "codex-rs/models-manager/models.json"
    official_url = f"https://raw.githubusercontent.com/openai/codex/{OFFICIAL_REVISION}/{official_path}"
    official = read_source(CACHE / "official-models-588b781.json", official_url, OFFICIAL_SHA, fetch)
    models = {model["slug"]: model for model in json.loads(official)["models"]}
    checks = []
    for name, slugs in (("gpt-5.5", ["gpt-5.5"]), ("gpt-5.6", ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]), ("gpt-6-astra", ["gpt-6-astra"])):
        for slug in slugs:
            template = models[slug]["model_messages"]["instructions_template"]
            left = [normalize_layout(line) for line in corpus[name].splitlines() if line.strip()]
            right = [normalize_layout(line) for line in template.splitlines() if line.strip()]
            mismatches = []
            for kind, a, b, c, d in difflib.SequenceMatcher(None, left, right, autojunk=False).get_opcodes():
                if kind != "equal":
                    mismatches.append({"kind": kind, "collectionNonemptyLines": [a + 1, b], "officialNonemptyLines": [c + 1, d]})
            checks.append({
                "source": name, "modelSlug": slug,
                "field": f"models[slug={slug}].model_messages.instructions_template",
                "templateSha256": sha256(template.encode("utf-8")),
                "byteEqual": template == corpus[name],
                "layoutNormalizedEqual": normalize_layout(template) == normalize_layout(corpus[name]),
                "normalizedLineChanges": mismatches,
            })
    pairs = []
    names = [source[0] for source in SOURCES]
    for before, after in zip(names, names[1:]):
        a, b = corpus[before].splitlines(), corpus[after].splitlines()
        deleted = added = unchanged = 0
        for kind, i, j, k, l in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
            if kind == "equal":
                unchanged += j - i
            else:
                deleted += j - i
                added += l - k
        pairs.append({"before": before, "after": after, "deletedLines": deleted,
                      "addedLines": added, "unchangedLines": unchanged})
    return {
        "version": 1, "verifiedAt": "2026-09-05", "collectionRevision": COLLECTION_REVISION,
        "method": {
            "size": "UTF-8 bytes; splitlines includes blank lines; whitespaceWords is not model tokens",
            "diff": "Python difflib.SequenceMatcher(autojunk=False), exact lines including blanks; moves count as delete/add",
            "normalization": "curly quotes to straight quotes; remove backticks and paired bold markers; normalize only Destructive Actions heading case; collapse whitespace",
            "boundary": "Snapshot labels are not release dates. Template equality is not proof of a complete runtime request or model behavior.",
        },
        "sources": sources, "pairs": pairs,
        "official": {
            "revision": OFFICIAL_REVISION, "path": official_path, "sha256": OFFICIAL_SHA,
            "url": f"https://github.com/openai/codex/blob/{OFFICIAL_REVISION}/{official_path}",
            "checks": checks,
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fetch", action="store_true", help="Download missing pinned sources only")
    parser.add_argument("--check", action="store_true", help="Compare against the committed receipt without writing it")
    args = parser.parse_args()
    receipt = build_receipt(args.fetch)
    corpus = {"revision": COLLECTION_REVISION, "versions": []}
    for source in receipt["sources"]:
        raw = read_source(CACHE / COLLECTION_REVISION / f"{source['id']}.md",
                          source["rawUrl"], source["sha256"], False)
        corpus["versions"].append({"id": source["id"], "url": source["url"],
                                    "sha256": source["sha256"], "text": raw.decode("utf-8")})
    for target, data in ((OUTPUT, receipt), (DIFF_OUTPUT, corpus)):
        rendered = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
        if args.check:
            if target.read_text() != rendered:
                raise SystemExit(f"Prompt data differs: {target.name}; review before regenerating")
        else:
            target.write_text(rendered)
            print(target)
    if args.check:
        print("Prompt corpus: 4 source digests, diff inputs and metrics match")


if __name__ == "__main__":
    main()
