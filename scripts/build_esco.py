#!/usr/bin/env python3
"""Build a source-attributed, bounded ESCO occupation/skill graph.

Input: public European Commission ESCO v1.2.0 CSVs mirrored on GitHub.
The pinned upstream commit is an immutable transport; taxonomy belongs to ESCO.
No candidate records, employee information, or fabricated links.
"""
from __future__ import annotations
import argparse
import csv
import io
import json
import re
import time
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ESCO_VERSION = "1.2.0"
MIRROR_REV = "bf68c5e3845acb9494b50c476b2de6ab001d0df5"
BASE = f"https://raw.githubusercontent.com/DakFu2k6/Knowledge_graph_datcom/{MIRROR_REV}/ESCO%20dataset%20-%20v1.2.0%20-%20classification%20-%20en%20-%20csv"
COLUMNS = {"occupations":"occupations_en.csv","skills":"skills_en.csv","relations":"occupationSkillRelations_en.csv"}
# Searchable occupational clusters useful for technical and non-technical sourcing.
PATTERN = re.compile(r"engineer|technician|maintenance|operator|production|manufactur|mechanic|electric|automati|quality|robot|logistic|warehouse|supply chain|procurement|software|developer|data |analyst|recruit|human resource|personnel|talent|sales|accountant|finance|research|scientist|manager|designer|machine|health|nurs|customer service|driver|assembly|control|computer|machinist|inspector|safety|industrial|mechanical|weld|material|supervisor", re.I)

def rows(text: str):
    return csv.DictReader(io.StringIO(text.lstrip('\ufeff')), delimiter=',')

def get(row: dict, *names: str):
    norm = {k.strip().lower().replace('_',''):v for k,v in row.items() if k}
    for n in names:
        v = norm.get(n.lower().replace('_',''))
        if v:
            return v.strip()
    return ""

def download(name: str):
    url = f"{BASE}/{COLUMNS[name]}"
    for attempt in range(4):
        try:
            request = urllib.request.Request(url, headers={"User-Agent":"ScoutForge-OpenESCO-Research/0.1", "Accept":"text/csv"})
            with urllib.request.urlopen(request, timeout=110) as response:
                payload=response.read()
            print(f"{name}: downloaded {len(payload):,} bytes")
            return payload.decode("utf-8-sig")
        except (TimeoutError, OSError) as exc:
            if attempt == 3: raise RuntimeError(f"Could not retrieve {name} from pinned public ESCO mirror") from exc
            time.sleep(2 ** (attempt + 1))
    raise AssertionError

def build(occupations_text: str, skills_text: str, relations_text: str, limit: int = 420):
    occupations = []
    for row in rows(occupations_text):
        uri=get(row,"conceptUri","occupationUri","uri")
        label=get(row,"preferredLabel","preferred label","name")
        if uri and label and PATTERN.search(label):
            occupations.append({"id":uri,"name":label,"isco":get(row,"iscoGroup","isco","code"),"alt":get(row,"altLabels","alternativeLabels")[:180]})
    occupations.sort(key=lambda x: x["name"].casefold())
    # Choose a bounded deterministic subset; do not invent a curated relationship.
    if limit and len(occupations)>limit:
        important = sorted(occupations, key=lambda x: (not bool(re.search(r"engineer|technician|operator|maintenance|recruit|production|manufactur|quality|logistic|software",x['name'],re.I)),x["name"].casefold()))
        occupations = sorted(important[:limit],key=lambda x:x['name'].casefold())
    selected_ids={o['id'] for o in occupations}
    rel_by_occupation=defaultdict(list); needed_skills=set();rel_count=0
    for row in rows(relations_text):
        occ=get(row,"occupationUri","occupation URI","occupation")
        if occ not in selected_ids:continue
        skill=get(row,"skillUri","skill URI","skill")
        kind=get(row,"relationType","relation type","type").lower()
        if skill:
            kind="essential" if "essential" in kind else "optional" if "optional" in kind else "linked"
            rel_by_occupation[occ].append((skill,kind));needed_skills.add(skill);rel_count+=1
    skills={}
    for row in rows(skills_text):
        uri=get(row,"conceptUri","skillUri","uri")
        if uri not in needed_skills:continue
        label=get(row,"preferredLabel","preferred label","name")
        if uri and label:
            skills[uri]={"id":uri,"name":label,"type":get(row,"skillType"),"alt":get(row,"altLabels","alternativeLabels")[:180]}
    if not occupations or not skills or rel_count < 50:
        raise ValueError(f"Unexpectedly sparse ESCO source: occupations {len(occupations)}, skills {len(skills)}, links {rel_count}. Check upstream CSV schemas.")
    output=[]
    for occ in occupations:
        links=[{"id":sid,"type":kind} for sid,kind in rel_by_occupation[occ['id']] if sid in skills]
        if links:output.append({**occ,"skills":links})
    if len(output) < 50:
        raise ValueError("Not enough occupations with relationships")
    return {
        "source":"European Commission ESCO", "version":ESCO_VERSION,
        "source_url":"https://esco.ec.europa.eu/en/use-esco/download",
        "transport":"https://github.com/DakFu2k6/Knowledge_graph_datcom",
        "transport_revision":MIRROR_REV,
        "retrieved_at":datetime.now(timezone.utc).isoformat(),
        "notice":"This application uses the ESCO classification of the European Commission. Reduced English subset; ESCO relationships are not individual candidate suitability scores.",
        "occupations":output,
        "skills":[skills[k] for k in sorted(skills, key=lambda k:skills[k]['name'].casefold())],
        "counts":{"occupations":len(output),"skills":len(skills),"relations":sum(len(o['skills']) for o in output)},
    }

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--from-dir",type=Path)
    parser.add_argument("--out",type=Path,default=Path("web/data/esco.json"))
    parser.add_argument("--limit",type=int,default=420)
    args=parser.parse_args()
    contents={k:(args.from_dir / fn).read_text(encoding="utf-8-sig") if args.from_dir else download(k) for k,fn in COLUMNS.items()}
    result=build(contents['occupations'],contents['skills'],contents['relations'],args.limit)
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(f"Wrote {args.out} ({args.out.stat().st_size:,} bytes); {result['counts']}")

if __name__=="__main__":main()