import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from scripts.build_talent import generate,write_sqlite,family_for

TEST_CATALOG={
 'source':'European Commission ESCO','version':'fixture',
 'skills':[{'id':f's{i}','name':n} for i,n in enumerate(['Python','SQL','quality control','maintain electrical equipment','program industrial robots','automation'])],
 'occupations':[{'id':'o1','name':'Industrial automation engineer','skills':[{'id':f's{i}','type':'essential'} for i in range(6)]},
                {'id':'o2','name':'Data engineer','skills':[{'id':'s0','type':'essential'},{'id':'s1','type':'essential'}]}]
}
class TalentSandboxTests(unittest.TestCase):
 def test_derived_profiles_deterministic_and_fictional(self):
  a=generate(TEST_CATALOG)
  b=generate(TEST_CATALOG)
  self.assertEqual(a,b)
  self.assertEqual(a['counts']['profiles'],6)
  self.assertTrue(all(p['source']=='synthetic_esco' for p in a['profiles']))
  self.assertTrue(all('Fictional' in p['summary'] for p in a['profiles']))
  self.assertTrue(any('Python' in p['skills'] for p in a['profiles']))
  self.assertFalse(any('email' in p for p in a['profiles']))
 def test_db_has_queryable_profile_and_skill_tables(self):
  with tempfile.TemporaryDirectory() as tmp:
   path=Path(tmp)/'sandbox.sqlite';data=generate(TEST_CATALOG)
   write_sqlite(data,path)
   db=sqlite3.connect(path)
   self.assertEqual(db.execute('select count(*) from profiles').fetchone()[0],6)
   self.assertGreater(db.execute("select count(*) from profile_skills where lower(skill)='python'").fetchone()[0],0)
   db.close()
 def test_reject_invalid_esco_origin(self):
  with self.assertRaises(ValueError):generate({'source':'Unknown','occupations':[],'skills':[]})
 def test_unknown_occupation_has_general_focus(self):
  self.assertEqual(family_for('Mystery role')[0],'Cross-functional')
if __name__=='__main__':unittest.main()