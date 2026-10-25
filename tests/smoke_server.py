"""End-to-end checks against the real Tsakorpus server, not a search mock."""
import http.cookiejar
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

base = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:7342'
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
html = opener.open(base + '/search', timeout=30).read().decode()
assert 'Кусурский корпус' in html


def query(**kwargs):
    params = dict(n_words=1, lang1='kusur', response_format='json', page_size=10, sort='no')
    params.update(kwargs)
    result = json.load(opener.open(base + '/search_sent?' + urllib.parse.urlencode(params), timeout=60))
    return result


word = query(wf1='rósnusa')
assert word['n_sentences'] == 1, word
assert 'russian' in word['languages'], word
assert 'село' in json.dumps(word, ensure_ascii=False) or 'села' in json.dumps(word, ensure_ascii=False)
assert query(lex1='rósu')['n_sentences'] >= 1
assert query(gloss_index1='PL')['n_sentences'] >= 1
assert query(gr1='noun')['n_sentences'] >= 1
assert query(wf1='zzzznotaword')['n_sentences'] == 0
assert query(lang1='russian', wf1='сестру')['n_sentences'] >= 1
try:
    opener.open(base + '/config', timeout=10)
    raise AssertionError('Configuration UI must be disabled')
except urllib.error.HTTPError as error:
    assert error.code == 404
print('PASS: search page, word, lemma, gloss, grammar, translation, no hits, disabled config')
