#!/usr/bin/env python3
"""Create a reproducible, privacy-safe talent *sandbox* from published ESCO taxonomy.

All personas, geographic locations, histories and skill claims are invented for DEMO.
No actual people or candidate availability are implied. Produces a queryable SQLite
snapshot for review and an indexed JSON snapshot for the static browser client.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import sqlite3
from collections import Counter
from pathlib import Path

SOURCE_LABEL = "Fictional profiles generated from ESCO occupation/skill relations"
REGIONS = ["Berlin–Brandenburg", "Leipzig", "Dresden", "Munich", "Stuttgart", "Hamburg", "Nuremberg", "Hannover", "Cologne", "Frankfurt"]
LEVELS = ["Early career", "Experienced", "Specialist"]
ARCHETYPES = [
    ("Automation & maintenance", r"automati|maintenance|mechatron|industrial|electri|robot|mechanic|plc|machine|weld|assembly", ["PLC", "Siemens S7", "TIA Portal", "SCADA", "Preventive maintenance", "Industrial automation", "Robotics", "Python", "HMI", "Quality control"]),
    ("Software & data", r"software|developer|data|computer|programm|information|network|cyber|analyst|statistic", ["Python", "SQL", "JavaScript", "TypeScript", "React", "Power BI", "Excel", "Machine learning", "AWS", "Docker", "Data analysis", "Data engineering", "Automation"]),
    ("Manufacturing & quality", r"manufactur|production|quality|inspector|operator|material|supervisor|safety|process", ["Quality control", "Quality assurance", "Lean manufacturing", "Six Sigma", "Excel", "SAP", "Preventive maintenance", "Process improvement"]),
    ("Supply chain & logistics", r"logistic|warehouse|supply|procurement|transport|purchas|driver", ["Supply chain", "Logistics", "SAP", "Excel", "ERP", "Inventory control", "SQL", "Process improvement"]),
    ("Talent & operations", r"recruit|human resource|personnel|talent|office|administrat|management|hr", ["Recruiting", "Talent acquisition", "Active sourcing", "Boolean search", "Excel", "Power Automate", "HR analytics", "Candidate screening", "Applicant tracking system", "Outreach"]),
    ("Design & research", r"designer|research|scientist|engineering|mechanical|product", ["CAD", "MATLAB", "Simulink", "Python", "Data analysis", "Technical documentation", "Quality control"]),
    ("Customer & commercial", r"customer|service|sales|account|finance|market|consult", ["Excel", "Customer service", "Data analysis", "CRM", "Sales", "Communication"]),
    ("Healthcare & care", r"nurs|health|medical|care|therap", ["Patient care", "Quality assurance", "Documentation", "Team coordination"]),
]


def family_for(name: str):
    for family, pattern, skills in ARCHETYPES:
        if re.search(pattern, name, re.I):
            return family, skills
    return "Cross-functional", ["Communication", "Excel", "Process improvement", "Documentation"]


def stable_int(*values):
    return int(hashlib.sha256("|".join(str(x) for x in values).encode()).hexdigest()[:12], 16)


def unique(values):
    seen=set();result=[]
    for value in values:
        v=" ".join(str(value or "").split())
        if v and v.casefold() not in seen:
            seen.add(v.casefold());result.append(v)
    return result


def generate(catalog: dict, variants=3):
    if catalog.get("source") != "European Commission ESCO":
        raise ValueError("ESCO origin validation failed")
    skills = {x["id"]:x["name"] for x in catalog.get("skills",[]) if x.get("id") and x.get("name")}
    occupations = catalog.get("occupations",[])
    if not occupations or not skills:
        raise ValueError("Expected non-empty ESCO occupations and skills")
    profiles=[]
    for occ in sorted(occupations, key=lambda o:o["name"].casefold()):
        oid=occ["id"];name=occ["name"]
        family, vocabulary=family_for(name)
        related=unique(skills[link["id"]] for link in occ.get("skills",[]) if link.get("id") in skills)
        for ix in range(variants):
            # Every public profile is fictional. Skill selections are not statements
            # about actual talent. Spread published ESCO links across variants.
            count=min(23, max(10, (len(related)+variants-1)//variants+4))
            own=[related[j] for j in range(ix,len(related),variants)][:count-4]
            common=related[:4]
            extra=[vocabulary[(ix*3+j)%len(vocabulary)] for j in range(5)]
            terms=unique([*own,*common,*extra])[:26]
            pid=f"SF-{stable_int(oid,ix):012x}"
            region=REGIONS[stable_int(oid,ix,"location")%len(REGIONS)]
            profiles.append({
                "id":pid,"title":name,"occupation_id":oid,"family":family,
                "location":region,"level":LEVELS[ix%len(LEVELS)],
                "skills":terms,"source":"synthetic_esco",
                "summary":f"Fictional {LEVELS[ix%len(LEVELS)].lower()} scenario representing a {name.lower()} occupation. Skills are illustrative, not verified individual qualifications."
            })
    profiles.sort(key=lambda x:(x["family"],x["title"].casefold(),x["id"]))
    if len({p["id"] for p in profiles})!=len(profiles):
        raise ValueError("Synthetic profile identifier collision")
    return {"schema":1,"kind":"synthetic_talent_sandbox","label":SOURCE_LABEL,
        "source":"European Commission ESCO","version":catalog.get("version"),
        "source_url":"https://esco.ec.europa.eu/en/use-esco/download",
        "notice":"Every profile is fictional. No contact information, real candidates, availability, personal scores or automated outreach.",
        "profiles":profiles,
        "counts":{"profiles":len(profiles),"occupations":len(set(p['occupation_id'] for p in profiles)),
                  "distinct_skills":len(set(s.casefold() for p in profiles for s in p['skills']))}}


def write_sqlite(data: dict, path: Path):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.unlink(missing_ok=True)
    db=sqlite3.connect(str(path))
    try:
        db.executescript("""
            PRAGMA foreign_keys=ON;
            CREATE TABLE profiles (id TEXT PRIMARY KEY,occupation_id TEXT NOT NULL,
                title TEXT NOT NULL, family TEXT NOT NULL, region TEXT NOT NULL,
                career_stage TEXT NOT NULL, summary TEXT NOT NULL, source TEXT NOT NULL);
            CREATE TABLE profile_skills (profile_id TEXT NOT NULL REFERENCES profiles(id),
                skill TEXT NOT NULL, PRIMARY KEY(profile_id,skill));
            CREATE INDEX idx_profile_family ON profiles(family);
            CREATE INDEX idx_profile_region ON profiles(region);
            CREATE INDEX idx_profile_skill ON profile_skills(skill);
        """)
        for p in data['profiles']:
            db.execute("INSERT INTO profiles VALUES (?,?,?,?,?,?,?,?)",(p['id'],p['occupation_id'],p['title'],p['family'],p['location'],p['level'],p['summary'],p['source']))
            db.executemany("INSERT INTO profile_skills VALUES (?,?)",[(p['id'],s) for s in p['skills']])
        db.commit()
    finally:db.close()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--esco",type=Path,default=Path("web/data/esco.json"))
    parser.add_argument("--out",type=Path,default=Path("web/data/talent-sandbox.json"))
    parser.add_argument("--sqlite",type=Path,default=Path("web/data/talent-sandbox.sqlite"))
    args=parser.parse_args()
    data=generate(json.loads(args.esco.read_text(encoding="utf-8")))
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding="utf-8")
    write_sqlite(data,args.sqlite)
    print('Created synthetic talent sandbox',data['counts'],'JSON bytes:',args.out.stat().st_size,'SQLite bytes:',args.sqlite.stat().st_size)

if __name__=="__main__":main()