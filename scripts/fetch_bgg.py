#!/usr/bin/env python3
"""Fetch board game data from BoardGameGeek XML API2 for games in data/games-raw.json.

Requires BGG_TOKEN env var (Bearer token) — BGG now requires auth on xmlapi2.
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

RAW_PATH = "data/games-raw.json"
OUT_PATH = "data/games.json"
CACHE_PATH = "data/bgg-cache.json"

SEARCH_URL = "https://boardgamegeek.com/xmlapi2/search?type=boardgame,boardgameexpansion&query={}"
THING_URL = "https://boardgamegeek.com/xmlapi2/thing?stats=1&id={}"

TOKEN = os.environ.get("BGG_TOKEN")
if not TOKEN:
    print("ERROR: set BGG_TOKEN env var first.", file=sys.stderr)
    sys.exit(1)


def http_get(url, retries=5):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "giochi-da-tavolo-script/1.0",
                    "Authorization": f"Bearer {TOKEN}",
                },
            )
            with urllib.request.urlopen(req, timeout=20) as resp:
                if resp.status == 202:
                    time.sleep(2)
                    continue
                return resp.read()
        except urllib.error.HTTPError as e:
            if e.code == 202:
                time.sleep(2)
                continue
            time.sleep(2)
        except Exception:
            time.sleep(2)
    return None


def search_bgg(title):
    q = urllib.parse.quote(title)
    data = http_get(SEARCH_URL.format(q))
    if not data:
        return []
    root = ET.fromstring(data)
    results = []
    for item in root.findall("item"):
        bgg_id = item.get("id")
        name_el = item.find("name")
        name = name_el.get("value") if name_el is not None else None
        year_el = item.find("yearpublished")
        year = year_el.get("value") if year_el is not None else None
        if bgg_id and name:
            results.append({"id": bgg_id, "name": name, "year": year})
    return results


def score_match(title, candidate_name):
    t = re.sub(r"[^a-z0-9]", "", title.lower())
    c = re.sub(r"[^a-z0-9]", "", candidate_name.lower())
    if t == c:
        return 100
    if t in c or c in t:
        return 80
    t_words = set(re.findall(r"[a-z0-9]+", title.lower()))
    c_words = set(re.findall(r"[a-z0-9]+", candidate_name.lower()))
    overlap = len(t_words & c_words)
    return overlap * 10


def best_match(title, results):
    if not results:
        return None
    scored = [(score_match(title, r["name"]), r) for r in results]
    scored.sort(key=lambda x: -x[0])
    return scored[0][1] if scored[0][0] > 0 else results[0]


def fetch_thing(bgg_id):
    data = http_get(THING_URL.format(bgg_id))
    if not data:
        return None
    root = ET.fromstring(data)
    item = root.find("item")
    if item is None:
        return None

    def text(tag, attr="value"):
        el = item.find(tag)
        return el.get(attr) if el is not None else None

    name = None
    for name_el in item.findall("name"):
        if name_el.get("type") == "primary":
            name = name_el.get("value")
            break
    image_el = item.find("image")
    thumb_el = item.find("thumbnail")
    desc_el = item.find("description")
    stats = item.find("statistics/ratings")
    rating = None
    weight = None
    if stats is not None:
        avg = stats.find("average")
        rating = avg.get("value") if avg is not None else None
        wt = stats.find("averageweight")
        weight = wt.get("value") if wt is not None else None

    categories = [l.get("value") for l in item.findall("link[@type='boardgamecategory']")]
    mechanics = [l.get("value") for l in item.findall("link[@type='boardgamemechanic']")]
    expansions_bgg = [l.get("value") for l in item.findall("link[@type='boardgameexpansion']")]

    best_players = None
    lang_dependence = None
    for poll in item.findall("poll"):
        if poll.get("name") == "suggested_numplayers":
            best_votes = {}
            for res in poll.findall("results"):
                numplayers = res.get("numplayers")
                for r in res.findall("result"):
                    if r.get("value") == "Best":
                        best_votes[numplayers] = int(r.get("numvotes", 0))
            if best_votes:
                max_votes = max(best_votes.values())
                if max_votes > 0:
                    best_players = ", ".join(sorted(
                        (k for k, v in best_votes.items() if v == max_votes),
                        key=lambda x: int(re.sub(r"[^0-9]", "", x) or 0)
                    ))
        elif poll.get("name") == "language_dependence":
            results = poll.find("results")
            if results is not None:
                top = max(results.findall("result"), key=lambda r: int(r.get("numvotes", 0)), default=None)
                if top is not None and int(top.get("numvotes", 0)) > 0:
                    lang_dependence = top.get("value")

    return {
        "bgg_id": bgg_id,
        "bgg_name": name,
        "year": text("yearpublished"),
        "minplayers": text("minplayers"),
        "maxplayers": text("maxplayers"),
        "playingtime": text("playingtime"),
        "minplaytime": text("minplaytime"),
        "maxplaytime": text("maxplaytime"),
        "minage": text("minage"),
        "image": image_el.text if image_el is not None else None,
        "thumbnail": thumb_el.text if thumb_el is not None else None,
        "description": (desc_el.text or "").strip() if desc_el is not None else None,
        "categories": categories,
        "mechanics": mechanics,
        "expansions_bgg": expansions_bgg,
        "best_players": best_players,
        "language_dependence": lang_dependence,
        "rating": round(float(rating), 1) if rating else None,
        "weight": round(float(weight), 2) if weight else None,
    }


def main():
    with open(RAW_PATH, encoding="utf-8") as f:
        raw_games = json.load(f)

    try:
        with open(CACHE_PATH, encoding="utf-8") as f:
            cache = json.load(f)
    except FileNotFoundError:
        cache = {}

    results = []
    for i, g in enumerate(raw_games):
        title = g["name"]
        print(f"[{i+1}/{len(raw_games)}] {title}", file=sys.stderr)

        if title in cache:
            entry = cache[title]
        else:
            search_results = search_bgg(title)
            match = best_match(title, search_results)
            entry = {"matched": False}
            if match:
                details = fetch_thing(match["id"])
                if details:
                    entry.update(details)
                    entry["matched"] = True
            cache[title] = entry
            with open(CACHE_PATH, "w", encoding="utf-8") as f:
                json.dump(cache, f, ensure_ascii=False, indent=2)
            time.sleep(1.2)

        merged = {**g, **entry}
        results.append(merged)

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    unmatched = [r["name"] for r in results if not r.get("matched")]
    print(f"\nDone. {len(results) - len(unmatched)}/{len(results)} matched.", file=sys.stderr)
    if unmatched:
        print("Unmatched:", file=sys.stderr)
        for u in unmatched:
            print(f"  - {u}", file=sys.stderr)


if __name__ == "__main__":
    main()
