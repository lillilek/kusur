import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('import_flex', ROOT / 'tools/import_flex.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

GUID = '00000000-0000-4000-8000-000000000001'
XML = '''<document><interlinear-text guid="%s"><item type="title" lang="ru">Проба</item>
<paragraphs><paragraph><phrases><word><words>
<word><item type="txt" lang="av">rósnusa</item><item type="pos">noun</item><morphemes>
<morph type="stem"><item type="txt" lang="av">rós</item><item type="cf" lang="av">rósu</item><item type="gls" lang="ru">село</item></morph>
<morph type="suffix"><item type="txt" lang="av">-nu</item><item type="gls" lang="ru">IN</item></morph>
<morph type="suffix"><item type="txt" lang="av">-sa</item><item type="gls" lang="ru">EL</item></morph>
</morphemes></word><word><item type="punct">.</item></word></words>
<item type="segnum">1</item><item type="gls" lang="ru">Из села.</item><item type="note" lang="ru">Рабочая заметка</item>
</word></phrases></paragraph></paragraphs></interlinear-text></document>''' % GUID


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'input.xml'
        self.source.write_text(XML, encoding='utf-8')
        conf = self.root / 'tsakorpus/conf/corpus.json'
        conf.parent.mkdir(parents=True)
        conf.write_bytes((ROOT / 'tsakorpus/conf/corpus.json').read_bytes())

    def test_morphology_translation_offsets_and_notes(self):
        doc, report, notes = module.parse_export(self.source)[GUID]
        ana = doc['sentences'][0]['words'][0]['ana'][0]
        self.assertEqual(ana['lex'], 'rósu')
        self.assertEqual(ana['parts'], 'rós-nu-sa')
        self.assertEqual(ana['gloss'], 'село-IN-EL')
        self.assertEqual(ana['gloss_index'], 'STEM{rós}-IN{nu}-EL{sa}-')
        self.assertEqual(ana['gr.gloss_tag'], ['IN', 'EL'])
        self.assertEqual(doc['sentences'][1]['text'], 'Из села.')
        self.assertEqual(doc['sentences'][0]['meta']['note'], '')
        self.assertEqual(len(notes), 1)
        for s in doc['sentences']:
            for w in s['words']:
                self.assertEqual(s['text'][w['off_start']:w['off_end']], w['wf'])
        with_notes = module.parse_export(self.source, True)[GUID][0]
        self.assertEqual(with_notes['sentences'][0]['meta']['note'], 'Рабочая заметка')

    def test_phrase_export_and_missing_gloss_preserve_sequence(self):
        value = XML.replace('<phrases><word>', '<phrases><phrase>').replace('</word></phrases>', '</phrase></phrases>')
        value = value.replace('<item type="gls" lang="ru">IN</item>', '')
        self.source.write_text(value, encoding='utf-8')
        doc, report, _ = module.parse_export(self.source)[GUID]
        self.assertEqual(doc['sentences'][0]['words'][0]['ana'][0]['gloss_index'],
                         'STEM{rós}-UNKNOWN{nu}-EL{sa}-')
        self.assertEqual(report['segments'], 1)
        self.assertTrue(report['warnings'])

    def test_replace_and_retain_other_documents(self):
        module.import_files([self.source], self.root)
        other = self.root / 'other.xml'
        other.write_text(XML.replace(GUID, '00000000-0000-4000-8000-000000000002'), encoding='utf-8')
        module.import_files([other], self.root)
        self.source.write_text(XML.replace('Из села.', 'Новый перевод.'), encoding='utf-8')
        module.import_files([self.source], self.root)
        files = list((self.root / 'tsakorpus/corpus/kusur').glob('*.json'))
        self.assertEqual(len(files), 2)
        doc = json.loads((self.root / 'tsakorpus/corpus/kusur' / (GUID + '.json')).read_text(encoding='utf-8'))
        self.assertEqual(doc['sentences'][1]['text'], 'Новый перевод.')
        self.assertTrue(list((self.root / '.private/backups').glob('*/*.json')))
        self.assertEqual(json.loads((self.root / 'data/corpus-status.json').read_text())['texts'], 2)

    def test_bad_or_duplicate_batch_preserves_existing(self):
        module.import_files([self.source], self.root)
        target = self.root / 'tsakorpus/corpus/kusur' / (GUID + '.json')
        before = target.read_bytes()
        broken = self.root / 'broken.xml'
        broken.write_text('<broken>')
        with self.assertRaises(Exception):
            module.import_files([self.source, broken], self.root)
        with self.assertRaises(ValueError):
            module.import_files([self.source, self.source], self.root)
        self.assertEqual(target.read_bytes(), before)

    def test_empty_and_identityless_exports_rejected(self):
        for value in ['<document/>', XML.replace(' guid="' + GUID + '"', ''), '<!DOCTYPE document><document/>']:
            self.source.write_text(value, encoding='utf-8')
            with self.assertRaises(ValueError):
                module.parse_export(self.source)

    def test_published_data_contract(self):
        categories = json.loads((ROOT / 'tsakorpus/conf/categories.json').read_text(encoding='utf-8'))
        total = 0
        for path in (ROOT / 'tsakorpus/corpus/kusur').glob('*.json'):
            doc = json.loads(path.read_text(encoding='utf-8'))
            for s in doc['sentences']:
                for i, w in enumerate(s['words']):
                    self.assertEqual(s['text'][w['off_start']:w['off_end']], w['wf'])
                    self.assertEqual(w['next_word'], i + 1)
                    if s['lang'] == 0 and w['wtype'] == 'word':
                        total += 1
                    for a in w.get('ana', []):
                        for k, values in a.items():
                            if k.startswith('gr.'):
                                for v in values:
                                    self.assertEqual(categories[module.LANGUAGES[s['lang']]][v], k[3:])
        summary = json.loads((ROOT / 'data/corpus-status.json').read_text(encoding='utf-8'))
        self.assertEqual(total, summary['words'])


if __name__ == '__main__':
    unittest.main()
