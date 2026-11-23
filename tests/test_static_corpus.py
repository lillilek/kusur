import csv
import io
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from tools.build_static_corpus import build, parse, csv_text

G1 = '11111111-1111-4111-8111-111111111111'
G2 = '22222222-2222-4222-8222-222222222222'

def text(guid=G1, word='son', gloss='год', lang='ru', title='01. son', extra=''):
    return f'''<interlinear-text guid="{guid}"><item type="title" lang="av">{title}</item><paragraphs><paragraph><phrases><phrase>
    <item type="segnum" lang="en">1</item><item type="gls" lang="{lang}">Это год.</item><words><word><item type="txt" lang="av">{word}</item><item type="pos" lang="en">noun</item>
    <morphemes><morph type="root"><item type="txt" lang="av">son</item><item type="cf" lang="av">son</item><item type="gls" lang="ru">{gloss}</item></morph><morph type="suffix"><item type="txt" lang="av">=al</item><item type="gls" lang="ru">PL</item></morph></morphemes>{extra}</word></words></phrase></phrases></paragraph></paragraphs></interlinear-text>'''

class StaticImportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / 'data').mkdir()
        self.dictionary = [{'pos':'n','latin orthography':'son','cyrillic orthography':'сон','variant':'','forms':'','meaning_1_rus':'год'}]
        self.write_dictionary()

    def write_dictionary(self):
        (self.root / 'data/Kusur_dict.csv').write_text(csv_text(self.dictionary, list(self.dictionary[0])),encoding='utf-8')

    def export(self, name, content):
        path=self.root/name
        path.write_text('<document>'+content+'</document>',encoding='utf-8')
        return path

    def payload(self):
        return json.loads((self.root/'data/static-corpus.json').read_text(encoding='utf-8'))

    def snapshot(self):
        return {p.relative_to(self.root).as_posix():p.read_bytes() for folder in ('data','reports') for p in (self.root/folder).glob('*')}

    def test_one_file_many_texts_and_language_labels(self):
        report=build([self.export('all.xml',text()+text(G2,lang='en'))],self.root)
        self.assertEqual(report['total']['texts'],2)
        self.assertEqual(report['total']['sentences'],2)
        self.assertEqual(report['files'][0]['counts']['russian_translation_other_label'],1)
        self.assertEqual(self.payload()['texts'][0]['title'],'son')
        self.assertEqual(self.payload()['texts'][1]['sentences'][0]['r'],'Это год.')

    def test_two_files_duplicate_deduplicated_and_order_stable(self):
        a=self.export('a.xml',text());b=self.export('b.flextext',text()+text(G2))
        report=build([a,b],self.root);before=self.payload()
        self.assertEqual(report['total']['texts'],2)
        self.assertEqual(sum(f['duplicates'] for f in report['files']),1)
        build([b,a],self.root)
        self.assertEqual(before,self.payload())
        c=self.root/'renamed.xml';a.rename(c);build([b,c],self.root)
        self.assertEqual(before,self.payload())

    def test_guid_conflict_preserves_all_outputs(self):
        a=self.export('a.xml',text());build([a],self.root);before=self.snapshot()
        b=self.export('b.xml',text(word='different'))
        with self.assertRaisesRegex(ValueError,'a.xml.*b.xml'):
            build([a,b],self.root)
        self.assertEqual(before,self.snapshot())

    def test_bad_or_missing_file_preserves_build(self):
        a=self.export('a.xml',text());build([a],self.root);before=self.snapshot()
        with self.assertRaises(ValueError):build([a,self.root/'missing.xml'],self.root)
        self.assertEqual(before,self.snapshot())
        b=self.export('bad.xml','<broken>')
        with self.assertRaises(Exception):build([a,b],self.root)
        self.assertEqual(before,self.snapshot())

    def test_rebuild_removes_deleted_texts_and_examples(self):
        a=self.export('a.xml',text()+text(G2));build([a],self.root)
        a=self.export('a.xml',text(G2));build([a],self.root)
        payload=self.payload()
        self.assertEqual([t['id'] for t in payload['texts']],[G2])
        self.assertTrue(all(not sid.startswith(G1) for ids in payload['examples'].values() for sid in ids))

    def test_boundaries_missing_fields_and_alternatives(self):
        alt='<morphemes><morph type="root"><item type="gls" lang="ru">ALT</item></morph></morphemes>'
        a=self.export('a.xml',text(extra=alt).replace('<item type="gls" lang="ru">PL</item>',''))
        docs,report=parse(a);word=docs[0]['sentences'][0]['w'][0]
        self.assertEqual(len(word['a']),2)
        self.assertEqual(word['a'][0][1]['f'],'=al')
        self.assertEqual(word['a'][0][1]['g'],'?')
        self.assertEqual(word['a'][1][0]['f'],'?')
        self.assertEqual(word['a'][0][0]['f'],'son')
        self.assertEqual(report['counts']['missing_gloss'],1)

    def test_duplicate_sentence_number_and_no_guid_rejected(self):
        a=self.export('a.xml',text().replace('guid="'+G1+'"',''))
        with self.assertRaises(ValueError):build([a],self.root)
        a=self.export('a.xml',text().replace('</phrases>','<phrase><item type="segnum">1</item><words><word><item type="txt">x</item></word></words></phrase></phrases>'))
        with self.assertRaisesRegex(ValueError,'идентификатора'):build([a],self.root)

    def test_glossary_explanations_survive(self):
        a=self.export('a.xml',text());build([a],self.root)
        (self.root/'data/glossary.csv').write_text('глосса,пояснение\nPL,Множественное число\nOLD,Старая помета\n',encoding='utf-8')
        a=self.export('a.xml',text(gloss='NEW'));build([a],self.root)
        gloss={r['глосса']:r['пояснение'] for r in self.payload()['glossary']}
        self.assertEqual(gloss,{'NEW':'','OLD':'Старая помета','PL':'Множественное число'})

    def test_dictionary_ids_survive_reorder_and_edit(self):
        self.dictionary.append({**self.dictionary[0],'latin orthography':'other','meaning_1_rus':'другое'})
        self.write_dictionary();a=self.export('a.xml',text());build([a],self.root)
        path=self.root/'data/Kusur_dict.csv'
        with path.open(encoding='utf-8',newline='') as f:rows=list(csv.DictReader(f))
        expected=rows[0]['entry_id'];rows[0]['meaning_1_rus']='год; годик';rows.reverse()
        path.write_text(csv_text(rows,list(rows[0])),encoding='utf-8');build([a],self.root)
        self.assertIn(expected,self.payload()['examples'])

    def test_ambiguous_link_and_manual_override(self):
        self.dictionary.append({**self.dictionary[0],'cyrillic orthography':'сон2'})
        self.write_dictionary();a=self.export('a.xml',text());build([a],self.root)
        self.assertEqual(self.payload()['examples'],{})
        with (self.root/'data/Kusur_dict.csv').open(encoding='utf-8') as f:eid=list(csv.DictReader(f))[0]['entry_id']
        path=self.root/'data/corpus-links.csv';path.write_text('lemma,pos,gloss,homograph,entry_id\nson,noun,год,,'+eid+'\n',encoding='utf-8')
        before=path.read_bytes();build([a],self.root)
        self.assertIn(eid,self.payload()['examples']);self.assertEqual(path.read_bytes(),before)

    def test_similar_word_or_shared_translation_not_linked(self):
        a=self.export('a.xml',text().replace('>son<','>sone<'));build([a],self.root)
        self.assertEqual(self.payload()['examples'],{})

    def test_io_failure_rolls_back(self):
        a=self.export('a.xml',text());build([a],self.root);before=self.snapshot()
        a=self.export('a.xml',text()+text(G2));original=Path.replace;calls=0
        def fail_once(path,target):
            nonlocal calls
            calls+=1
            if calls==3:raise OSError('simulated disk failure')
            return original(path,target)
        with patch.object(Path,'replace',fail_once):
            with self.assertRaises(OSError):build([a],self.root)
        self.assertEqual(before,self.snapshot())

if __name__=='__main__':unittest.main()
