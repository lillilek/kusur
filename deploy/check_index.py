"""Fail the deployment if the indexer silently produced incomplete indexes."""
import json
from pathlib import Path
from elasticsearch import Elasticsearch

conf = json.loads(Path('../conf/corpus.json').read_text())
docs = [json.loads(p.read_text()) for p in Path('../corpus/kusur').glob('*.json')]
es = Elasticsearch(conf['elastic_url'])
es.indices.refresh(index='kusur.*')
expected = sum(len(doc['sentences']) for doc in docs)
actual = es.count(index='kusur.sentences')['count']
assert actual == expected, (actual, expected)
assert es.count(index='kusur.docs')['count'] == len(docs)
assert es.count(index='kusur.words')['count'] > 0
print(f'Index verified: {len(docs)} documents, {expected} aligned segments')
