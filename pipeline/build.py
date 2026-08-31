#!/usr/bin/env python3
"""M0 資料管線：TSL 1.2 × ECDICT × WordNet × Tatoeba → app/data/units/*.json

來源與授權：
  TSL 1.2   (Browne, Culligan & Phillips, CC BY 3.0)  — 字表與排序
  ECDICT    (skywind3000, MIT 程式/彙編資料)          — 中文釋義、音標、詞性、變形
  WordNet   (Princeton, WordNet License)              — 英英釋義、同反義詞
  Tatoeba   (CC BY 2.0 FR)                            — 例句與中譯
  OpenCC s2twp                                        — 簡轉繁（台灣用語）
"""
import csv, json, re, sys, bz2, collections, pathlib

ROOT = pathlib.Path(__file__).resolve().parent
RAW = ROOT / "raw"
OUT_UNITS = ROOT.parent / "app" / "data" / "units"
OUT_UNITS.mkdir(parents=True, exist_ok=True)
REPORT = ROOT.parent / "reports" / "m0-coverage-report.txt"

TOTAL_WORDS = 400
UNIT_SIZE = 40
MAX_EXAMPLES = 3

from opencc import OpenCC
cc = OpenCC("s2twp")

from nltk.corpus import wordnet as wn

# ── 1. TSL 字表（依 TOEIC 語料頻率排序） ─────────────────────────
import unicodedata
def ascii_fold(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()

tsl = []
with open(RAW / "TSL_12_stats.csv", newline="", encoding="cp1252") as f:
    for row in csv.DictReader(f):
        w = ascii_fold(row["Word"].strip().lower())
        if w:
            tsl.append((int(row["TSL Rank"]), w))
tsl.sort()
print(f"TSL words: {len(tsl)}")

# ── 2. ECDICT 索引（只留 TSL 需要的字） ──────────────────────────
need = {w for _, w in tsl}
ecdict = {}
with open(RAW / "ecdict.csv", newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        w = row["word"].strip().lower()
        if w in need and w not in ecdict:
            ecdict[w] = row
print(f"ECDICT hits: {len(ecdict)}/{len(need)}")

POS_MAP = {"vt": "v", "vi": "v", "aux": "v", "n": "n", "v": "v",
           "adj": "adj", "a": "adj", "adv": "adv", "ad": "adv",
           "prep": "prep", "conj": "conj", "pron": "pron",
           "int": "int", "interj": "int", "num": "num", "art": "art"}

def parse_pos(row):
    """先用 ECDICT pos 欄（如 n:60/v:40），缺漏再從釋義行前綴抓。"""
    out = []
    for part in (row["pos"] or "").split("/"):
        name = part.split(":")[0].strip().lower()
        if name in POS_MAP and POS_MAP[name] not in out:
            out.append(POS_MAP[name])
    if not out:
        for line in (row["translation"] or "").split("\\n"):
            m = re.match(r"^\s*([a-z]+)\.", line)
            if m and m.group(1) in POS_MAP and POS_MAP[m.group(1)] not in out:
                out.append(POS_MAP[m.group(1)])
    return out

def parse_forms(row):
    """ECDICT exchange: p 過去式 / d 過去分詞 / i 現在分詞 / 3 三單 / s 複數"""
    forms = {}
    keymap = {"s": "plural", "p": "past", "d": "pp", "i": "ing", "3": "thirdSg"}
    for part in (row["exchange"] or "").split("/"):
        if ":" in part:
            k, v = part.split(":", 1)
            if k in keymap and v and re.fullmatch(r"[A-Za-z' -]+", v):
                forms[keymap[k]] = v
    return forms or None

def zh_defs(row):
    raw = (row["translation"] or "").replace("\\n", "\n").strip()
    if not raw:
        return None
    lines = [cc.convert(l.strip()) for l in raw.split("\n") if l.strip()]
    return "\n".join(lines) or None

# ── 3. WordNet：英英釋義、同反義 ────────────────────────────────
def wordnet_fields(word):
    syns = wn.synsets(word)
    if not syns:
        return None, [], []
    defs_en = syns[0].definition()
    synonyms, antonyms = [], []
    for s in syns[:3]:
        for l in s.lemmas():
            name = l.name().replace("_", " ")
            if name.lower() != word and name not in synonyms and " " not in name:
                synonyms.append(name)
            for a in l.antonyms():
                an = a.name().replace("_", " ")
                if an not in antonyms:
                    antonyms.append(an)
    return defs_en, synonyms[:5], antonyms[:5]

# ── 4. Tatoeba：例句索引 ────────────────────────────────────────
def load_tsv_bz2(path, cols):
    out = {}
    with bz2.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= cols:
                out[parts[0]] = parts[cols - 1]
    return out

print("loading tatoeba …")
eng_sent = load_tsv_bz2(RAW / "eng_sentences.tsv.bz2", 3)   # id -> text
cmn_sent = load_tsv_bz2(RAW / "cmn_sentences.tsv.bz2", 3)
pairs = []                                                   # (eng_text, cmn_text)
with bz2.open(RAW / "eng-cmn_links.tsv.bz2", "rt", encoding="utf-8") as f:
    for line in f:
        a, b = line.rstrip("\n").split("\t")[:2]
        if a in eng_sent and b in cmn_sent:
            pairs.append((eng_sent[a], cmn_sent[b]))
print(f"eng-cmn pairs: {len(pairs)}")

# 詞形 -> 詞彙索引：例句掃一遍就好
def word_variants(word, forms):
    v = {word}
    if forms:
        v.update(x.lower() for x in forms.values())
    if not word.endswith("s"):
        v.add(word + "s")
    v.update({word + "ed", word + "ing", word + "d"})
    return v

TOKEN = re.compile(r"[a-z']+")
def index_sentences(pairs, variant_map):
    hits = collections.defaultdict(list)   # word -> [(en, zh)]
    for en, zh in pairs:
        toks = set(TOKEN.findall(en.lower()))
        nwords = len(en.split())
        if nwords < 3 or nwords > 16:
            continue
        for tok in toks:
            for w in variant_map.get(tok, ()):
                hits[w].append((en, zh))
    return hits

# ── 5. 組裝 400 字 ──────────────────────────────────────────────
skipped = []
selected = []
for rank, w in tsl:
    if len(selected) >= TOTAL_WORDS:
        break
    row = ecdict.get(w)
    if not row:
        skipped.append((w, "無 ECDICT 條目"))
        continue
    defs = zh_defs(row)
    if not defs:
        skipped.append((w, "無中文釋義"))
        continue
    selected.append((rank, w, row, defs))
print(f"selected: {len(selected)}, skipped: {len(skipped)}")

variant_map = collections.defaultdict(list)
meta = {}
for rank, w, row, defs in selected:
    forms = parse_forms(row)
    meta[w] = forms
    for v in word_variants(w, forms):
        variant_map[v].append(w)

hits = index_sentences(pairs, variant_map)

def pick_examples(word):
    cand = hits.get(word, [])
    cand.sort(key=lambda p: len(p[0]))          # 短句優先
    out, seen = [], set()
    for en, zh in cand:
        key = en.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append({"en": en, "zh": cc.convert(zh)})
        if len(out) >= MAX_EXAMPLES:
            break
    return out

words = []
for i, (rank, w, row, defs) in enumerate(selected):
    defs_en, synonyms, antonyms = wordnet_fields(w)
    ipa = (row["phonetic"] or "").strip() or None
    words.append({
        "id": f"w{i+1:04d}",
        "unit": i // UNIT_SIZE + 1,
        "headword": w,
        "ipa": ipa,
        "pos": parse_pos(row) or None,
        "defsZh": defs,
        "forms": meta[w],
        "examples": pick_examples(w),
        "synonyms": synonyms or None,
        "antonyms": antonyms or None,
        "phrases": None,
        "defsEn": defs_en,
        "note": None,
        "audioUrl": None,
    })

for u in range(1, TOTAL_WORDS // UNIT_SIZE + 1):
    chunk = [x for x in words if x["unit"] == u]
    path = OUT_UNITS / f"unit-{u:02d}.json"
    path.write_text(json.dumps(chunk, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"wrote {TOTAL_WORDS // UNIT_SIZE} unit files")

# ── 6. coverage report ─────────────────────────────────────────
def pct(n):
    return f"{n}/{len(words)} = {n/len(words)*100:.1f}%"

have = lambda f: sum(1 for x in words if x[f])
n_ipa = have("ipa")
n_forms = sum(1 for x in words if x["forms"])
n_verbforms = sum(1 for x in words if x["forms"] and ("v" in (x["pos"] or []) or "n" in (x["pos"] or [])))
n_vn = sum(1 for x in words if "v" in (x["pos"] or []) or "n" in (x["pos"] or []))
n_en = have("defsEn")
n_syn = sum(1 for x in words if x["synonyms"] or x["antonyms"])
n_ex = sum(1 for x in words if x["examples"])
n_pos = have("pos")

lines = [
    "M0 coverage report — TOEIC 單字學習 App 第一版",
    f"字表：TSL 1.2 前 {TOTAL_WORDS} 字（依 TOEIC 語料頻率），單元 = 每 {UNIT_SIZE} 字",
    "",
    f"{'欄位':<14}{'覆蓋':>22}   門檻   判定",
    f"{'中文釋義':<14}{pct(len(words)):>22}   100%   {'PASS' if len(words)==TOTAL_WORDS else 'FAIL'}",
    f"{'IPA 音標':<14}{pct(n_ipa):>22}   >=90%  {'PASS' if n_ipa/len(words)>=.9 else 'FAIL'}",
    f"{'詞性':<14}{pct(n_pos):>22}   (參考)  {'—'}",
    f"{'變形(名/動)':<14}{f'{n_verbforms}/{n_vn} = {n_verbforms/max(n_vn,1)*100:.1f}%':>22}   >=80%  {'PASS' if n_verbforms/max(n_vn,1)>=.8 else 'FAIL'}",
    f"{'英英釋義':<14}{pct(n_en):>22}   >=95%  {'PASS' if n_en/len(words)>=.95 else 'FAIL'}",
    f"{'同/反義詞':<14}{pct(n_syn):>22}   >=60%  {'PASS' if n_syn/len(words)>=.6 else 'FAIL'}",
    f"{'例句含中譯':<14}{pct(n_ex):>22}   >=50%  {'PASS' if n_ex/len(words)>=.5 else ('改純英例句' if n_ex/len(words)<.3 else 'FAIL(30-50%)')}",
    "",
    "缺 IPA：" + (", ".join(x["headword"] for x in words if not x["ipa"]) or "無"),
    "缺英英釋義：" + (", ".join(x["headword"] for x in words if not x["defsEn"]) or "無"),
    "缺例句：" + (", ".join(x["headword"] for x in words if not x["examples"]) or "無"),
    "",
    "TSL 前段被跳過的字（原因）：",
] + [f"  {w} — {r}" for w, r in skipped[:40]]

REPORT.write_text("\n".join(lines), encoding="utf-8")
print("\n".join(lines[:12]))
print(f"\nreport -> {REPORT}")
