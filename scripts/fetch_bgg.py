#!/usr/bin/env python3
"""Fetch board game data from BoardGameGeek XML API2 for a list of titles."""
import json
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


def http_get(url, retries=5):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "giochi-da-tavolo-script/1.0"})
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
    stats = item.find("statistics/ratings")
    rating = None
    weight = None
    if stats is not None:
        avg = stats.find("average")
        rating = avg.get("value") if avg is not None else None
        wt = stats.find("averageweight")
        weight = wt.get("value") if wt is not None else None

    return {
        "bgg_id": bgg_id,
        "name": name,
        "year": text("yearpublished"),
        "minplayers": text("minplayers"),
        "maxplayers": text("maxplayers"),
        "playingtime": text("playingtime"),
        "minage": text("minage"),
        "image": image_el.text if image_el is not None else None,
        "thumbnail": thumb_el.text if thumb_el is not None else None,
        "rating": round(float(rating), 1) if rating else None,
        "weight": round(float(weight), 2) if weight else None,
    }


def main():
    with open(RAW_PATH, encoding="utf-8") as f:
        titles = json.load(f)

    try:
        with open(CACHE_PATH, encoding="utf-8") as f:
            cache = json.load(f)
    except FileNotFoundError:
        cache = {}

    results = []
    for i, title in enumerate(titles):
        print(f"[{i+1}/{len(titles)}] {title}", file=sys.stderr)
        if title in cache:
            results.append(cache[title])
            continue

        search_results = search_bgg(title)
        match = best_match(title, search_results)
        entry = {"query": title, "matched": False}
        if match:
            details = fetch_thing(match["id"])
            if details:
                entry.update(details)
                entry["matched"] = True
        results.append(entry)
        cache[title] = entry

        with open(CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)

        time.sleep(1.2)

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    unmatched = [r["query"] for r in results if not r.get("matched")]
    print(f"\nDone. {len(results) - len(unmatched)}/{len(results)} matched.", file=sys.stderr)
    if unmatched:
        print("Unmatched:", file=sys.stderr)
        for u in unmatched:
            print(f"  - {u}", file=sys.stderr)


if __name__ == "__main__":
    main()
