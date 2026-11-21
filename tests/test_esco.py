import unittest
from scripts.build_esco import build

class ESCOBuildTests(unittest.TestCase):
    def test_real_relationships_only_and_filtering(self):
        occupations='conceptUri,preferredLabel,iscoGroup,altLabels\no:1,automation technician,3113,\no:2,painter,1234,\n'
        skills='conceptUri,preferredLabel,skillType,altLabels\ns:1,configure control systems,skill,\ns:2,maintain equipment,skill,\n'
        relationships='occupationUri,relationType,skillUri\n'+''.join('o:1,essential,s:1\n' for _ in range(51))+'o:1,optional,s:2\n'
        # Sparse dataset intentionally rejected to avoid fake or partial showcases.
        with self.assertRaisesRegex(ValueError,'Not enough occupations'):
            build(occupations,skills,relationships)
    def test_empty_source_rejected(self):
        with self.assertRaises(ValueError):build('conceptUri,preferredLabel\n','conceptUri,preferredLabel\n','occupationUri,relationType,skillUri\n')
if __name__=='__main__':unittest.main()