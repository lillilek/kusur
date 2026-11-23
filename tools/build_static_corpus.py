"""Rebuild the static reader from the COMPLETE current set of FLEx exports.

No dependencies. Explicit morpheme boundaries only. Originals stay in .private.
See docs/STATIC-CORPUS.md for identities, linking and update semantics.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import io
import json
import re
import sys
import unicodedata as ud
import uuid
from collections import Counter, defaultdict
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
POS = {'n': 'noun', 'v': 'verb', 'pro': 'pron', 'pronoun': 'pron', 'pron': 'pron',
       'a': 'adj', 'adjective': 'adj', 'adverb': 'adv', 'ptcl': 'part', 'particle': 'part',
       'numeral': 'num', 'interjection': 'interj', 'conjunction': 'conj'}

def norm(s):
    s = ud.normalize('NFD', s.casefold())
    s = ''.join(c for c in s if c not in '\u0300\u0301\u0340\u0341')
    s = ud.normalize('NFC', s).replace('ё', 'е')
    return re.sub(r"[-=()\[\]{}'’‘ʼʹ′＇`´\s]", '', s).translate(str.maketrans('1Ӏ', 'ӏӏ'))

def category(s):
    return POS.get(s.strip().casefold(), s.strip().casefold())

def values(node, kinds, langs=()):
    items = [i for i in node.findall('item') if i.get('type') in kinds and ''.join(i.itertext()).strip()]
    items.sort(key=lambda i: langs.index(i.get('lang', '').split('-')[0]) if i.get('lang', '').split('-')[0] in langs else len(langs))
    return [(ud.normalize('NFC', ''.join(i.itertext()).strip()), i.get('lang', '')) for i in items]

def val(node, *kinds, langs=()):
    found = values(node, kinds, langs)
    return found[0][0] if found else ''

def translation(node):
    candidates = values(node, ('gls', 'ft'), ('ru', 'en'))
    russian = [x for x in candidates if x[1].split('-')[0] == 'ru']
    mislabeled = [x for x in candidates if re.search('[А-Яа-яЁё]', x[0])]
    chosen = (russian or mislabeled or [('', '')])[0]
    return chosen

def canonical(node):
    # Formatting, attribute order and export timestamps do not change content.
    if node.tag == 'item' and node.get('type') in ('date-created', 'date-modified'):
        return None
    return [node.tag, sorted(node.attrib.items()), ud.normalize('NFC', (node.text or '').strip()), ud.normalize('NFC', (node.tail or '').strip()),
            [x for child in node if (x := canonical(child)) is not None]]

def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()

def parse(path):
    raw = path.read_bytes()
    if path.suffix.lower() not in ('.xml', '.flextext'):
        raise ValueError(f'{path.name}: нужен .xml или .flextext')
    if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
        raise ValueError(f'{path.name}: DTD и ENTITY не поддерживаются')
    root = ET.fromstring(raw)
    for node in root.iter():
        node.tag = node.tag.split('}')[-1]
    texts = [root] if root.tag == 'interlinear-text' else root.findall('.//interlinear-text')
    if not texts:
        raise ValueError(f'{path.name}: не найден interlinear-text')
    docs, stats = [], Counter()
    languages = Counter((i.get('type', '') + ':' + i.get('lang', '')) for i in root.iter('item'))
    for text in texts:
        try:
            guid = str(uuid.UUID(text.get('guid', '')))
        except ValueError:
            raise ValueError(f'{path.name}: у текста отсутствует корректный GUID') from None
        title = val(text, 'title', langs=('av', 'kus', 'ru')) or guid
        title = re.sub(r'^\s*\d+\s*[.)]\s*', '', title)
        sentences, ids = [], set()
        for container in text.findall('paragraphs/paragraph/phrases'):
            for phrase in container:
                if phrase.tag not in ('phrase', 'word'):
                    raise ValueError(f'{path.name}: неизвестная структура предложения {phrase.tag}')
                nodes = phrase.findall('words/word')
                if not nodes:
                    raise ValueError(f'{path.name}: предложение без слов в {guid}')
                number = val(phrase, 'segnum', 'ref')
                phrase_guid = phrase.get('guid')
                if phrase_guid:
                    sid = guid + '-p-' + str(uuid.UUID(phrase_guid))
                elif number:
                    sid = guid + '-' + number
                else:
                    raise ValueError(f'{path.name}: нет GUID или номера предложения в {guid}; постоянная ссылка невозможна')
                if sid in ids:
                    raise ValueError(f'{path.name}: повтор идентификатора предложения {sid}')
                ids.add(sid)
                words = []
                for node in nodes:
                    punct = val(node, 'punct')
                    wf = val(node, 'txt', langs=('av', 'kus')) or punct
                    pos = val(node, 'pos')
                    alternatives = []
                    # Each morphemes element is an alternative, never concatenate analyses.
                    for analysis in node.findall('morphemes'):
                        parts = []
                        for morph in analysis.findall('morph'):
                            form = val(morph, 'txt', 'mb', langs=('av', 'kus'))
                            gloss = val(morph, 'gls', langs=('ru', 'en'))
                            lemma = val(morph, 'cf', langs=('av', 'kus'))
                            parts.append({'f': form or '?', 'g': gloss or '?', 'l': lemma,
                                          'p': val(morph, 'msa'), 'type': morph.get('type', ''),
                                          'homograph': val(morph, 'hn'), 'entry': ''})
                            stats['morphemes'] += 1
                            stats['missing_morph_form'] += not bool(form)
                            stats['missing_gloss'] += not bool(gloss)
                            stats['missing_lemma'] += not bool(lemma)
                        if parts:
                            alternatives.append(parts)
                    if not punct:
                        stats['words'] += 1
                        stats['missing_word_form'] += not bool(wf)
                        stats['missing_pos'] += not bool(pos)
                        stats['words_without_analysis'] += not bool(alternatives)
                    words.append({'f': wf or '?', 'p': pos, 'a': alternatives, 'punct': bool(punct)})
                tr, lang = translation(phrase)
                stats['missing_translation'] += not bool(tr)
                stats['russian_translation_other_label'] += bool(tr and lang.split('-')[0] != 'ru')
                source_line = val(phrase, 'txt', langs=('av', 'kus'))
                sentences.append({'id': sid, 'n': number or str(len(sentences) + 1), 'w': words,
                                  'r': tr, 'translationLang': lang, 's': source_line or ' '.join(w['f'] for w in words)})
                stats['sentences'] += 1
        if not sentences:
            raise ValueError(f'{path.name}: пустой текст {guid}; сборка сохранена')
        docs.append({'id': guid, 'title': title, 'sentences': sentences, '_fingerprint': digest(canonical(text))})
        stats['texts'] += 1
    return docs, {'file': path.name, 'sha256': hashlib.sha256(raw).hexdigest(), 'counts': dict(stats), 'languageLabels': dict(languages)}

def csv_text(rows, columns):
    out = io.StringIO(newline='')
    writer = csv.DictWriter(out, fieldnames=columns, lineterminator='\n')
    writer.writeheader()
    writer.writerows(rows)
    return out.getvalue()

def read_csv(path):
    if not path.exists():
        return [], []
    with path.open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        return list(reader), reader.fieldnames or []

def dictionary(root):
    path = root / 'data/Kusur_dict.csv'
    rows, columns = read_csv(path)
    if not rows or 'latin orthography' not in columns:
        raise ValueError('Не найдены ожидаемые данные словаря')
    if 'entry_id' not in columns:
        columns.append('entry_id')
    ids, duplicates = set(), Counter()
    for row in rows:
        if not row.get('entry_id'):
            fingerprint = digest({k: v for k, v in row.items() if k != 'entry_id'})[:18]
            duplicates[fingerprint] += 1
            row['entry_id'] = 'kus-' + fingerprint + ('-' + str(duplicates[fingerprint]) if duplicates[fingerprint] > 1 else '')
        if row['entry_id'] in ids:
            raise ValueError('Повтор entry_id словаря: ' + row['entry_id'])
        ids.add(row['entry_id'])
    return rows, csv_text(rows, columns)

def link_entries(root, docs, entries):
    index = defaultdict(set)
    byid = {r['entry_id']: r for r in entries}
    # Existing paired Latin/Cyrillic spellings are the only transliteration witnesses.
    for row in entries:
        for field in ('latin orthography', 'cyrillic orthography', 'variant', 'forms'):
            for form in re.split(r'[,;\n]', row.get(field, '')):
                if form.strip():
                    index[norm(form)].add(row['entry_id'])
    manual_rows, _ = read_csv(root / 'data/corpus-links.csv')
    manual = {}
    for row in manual_rows:
        key = (norm(row['lemma']), category(row['pos']), row['gloss'].strip(), row.get('homograph', '').strip())
        entry = row['entry_id'].strip()
        if entry and entry not in byid:
            raise ValueError('Ручное соответствие указывает на отсутствующий entry_id: ' + entry)
        if key in manual and manual[key] != entry:
            raise ValueError('Конфликт ручных соответствий: ' + str(key))
        manual[key] = entry
    pending, examples = {}, defaultdict(set)
    for doc in docs:
        for sentence in doc['sentences']:
            for word in sentence['w']:
                for analysis in word['a']:
                    stems = [m for m in analysis if m['type'] in ('root', 'stem')]
                    for m in stems:
                        lemma, pos, gloss = m['l'], category(word['p'] or m['p']), m['g']
                        key = (norm(lemma), pos, gloss.strip(), m['homograph'])
                        if not lemma:
                            continue
                        candidates = set(index.get(norm(lemma), set()))
                        if len(stems) == 1:
                            candidates |= index.get(norm(word['f']), set())
                        compatible = set()
                        for eid in candidates:
                            row = byid[eid]
                            meanings = [v.strip(' «»‘’\"') for field in ('meaning_1_rus', 'meaning_2_rus') for v in re.split('[,;]', row.get(field, ''))]
                            if pos and category(row['pos']) == pos and gloss != '?' and any(norm(gloss) == norm(v) for v in meanings if v):
                                compatible.add(eid)
                        if key in manual:
                            m['entry'] = manual[key]
                        elif len(compatible) == 1 and not m['homograph']:
                            m['entry'] = next(iter(compatible))
                        else:
                            pending[key] = {'lemma': lemma, 'pos': pos, 'gloss': gloss, 'homograph': m['homograph'],
                                            'candidates': ';'.join(sorted(compatible or candidates)),
                                            'reason': 'homograph' if m['homograph'] else 'ambiguous' if len(compatible) > 1 else 'needs_review'}
                        if m['entry']:
                            examples[m['entry']].add(sentence['id'])
    return dict(sorted((k, sorted(v)) for k, v in examples.items())), sorted(pending.values(), key=lambda x: (x['lemma'], x['pos'], x['gloss'], x['homograph']))

def publish(files):
    """Validate everything first; stage all files; rollback ordinary I/O failures."""
    previous, staged, changed = {}, {}, []
    try:
        for path, content in files.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            previous[path] = path.read_bytes() if path.exists() else None
            stage = path.with_name(path.name + '.pending')
            staged[path] = stage
            stage.write_text(content, encoding='utf-8', newline='')
        for path, stage in staged.items():
            stage.replace(path)
            changed.append(path)
    except BaseException:
        for path in reversed(changed):
            if previous[path] is None:
                path.unlink(missing_ok=True)
            else:
                path.write_bytes(previous[path])
        raise
    finally:
        for stage in staged.values():
            stage.unlink(missing_ok=True)

def build(paths, root=ROOT):
    if not paths:
        raise ValueError('Нет экспортов: положите XML/FLExText в .private/texts/')
    seen, reports, sources = {}, [], {}
    for path in sorted(paths, key=lambda p: str(p)):
        if not path.is_file():
            raise ValueError(f'Отсутствует экспорт: {path}. Последняя сборка сохранена.')
        docs, report = parse(path)
        report['duplicates'] = 0
        for doc in docs:
            guid = doc['id']
            if guid in seen:
                if seen[guid]['_fingerprint'] != doc['_fingerprint']:
                    raise ValueError(f'Конфликт GUID {guid}: {sources[guid]} и {path.name}. Содержимое различается; сборка сохранена.')
                report['duplicates'] += 1
            else:
                seen[guid] = doc
                sources[guid] = path.name
        reports.append(report)
    docs = [seen[k] for k in sorted(seen)]
    for doc in docs:
        del doc['_fingerprint']
    entries, dict_csv = dictionary(root)
    examples, unresolved = link_entries(root, docs, entries)
    old_glossary, _ = read_csv(root / 'data/glossary.csv')
    glossary = {}
    for row in old_glossary:
        label = row['глосса']
        if label in glossary and glossary[label] != row['пояснение']:
            raise ValueError('Разные пояснения одной глоссы: ' + label)
        glossary[label] = row['пояснение']
    for doc in docs:
        for s in doc['sentences']:
            for w in s['w']:
                for a in w['a']:
                    for m in a:
                        label = m['g'].strip('-=')
                        if re.match(r'^[A-Z0-9]', label):
                            glossary.setdefault(label, '')
    glossrows = [{'глосса': k, 'пояснение': v} for k, v in sorted(glossary.items())]
    counts = Counter(texts=len(docs))
    for doc in docs:
        for s in doc['sentences']:
            counts['sentences'] += 1
            counts['missing_translation'] += not bool(s['r'])
            for w in s['w']:
                if w['punct']:
                    continue
                counts['words'] += 1
                counts['missing_word_form'] += w['f'] == '?'
                counts['missing_pos'] += not bool(w['p'])
                counts['words_without_analysis'] += not bool(w['a'])
                for a in w['a']:
                    for m in a:
                        counts['morphemes'] += 1
                        counts['missing_morph_form'] += m['f'] == '?'
                        counts['missing_gloss'] += m['g'] == '?'
                        counts['missing_lemma'] += not bool(m['l'])
    corpus = {'version': 1, 'texts': docs, 'stats': dict(counts), 'examples': examples, 'glossary': glossrows}
    corpus['build'] = digest(corpus)[:20]
    report = {'files': reports, 'total': dict(counts), 'linked_entries': len(examples), 'unresolved_lemmas': len(unresolved), 'build': corpus['build']}
    js = lambda x: json.dumps(x, ensure_ascii=False, indent=2) + '\n'
    files = {root / 'data/Kusur_dict.csv': dict_csv,
             root / 'data/glossary.csv': csv_text(glossrows, ['глосса', 'пояснение']),
             root / 'reports/corpus-import.json': js(report),
             root / 'reports/corpus-unresolved.csv': csv_text(unresolved, ['lemma', 'pos', 'gloss', 'homograph', 'candidates', 'reason'])}
    if not (root / 'data/corpus-links.csv').exists():
        files[root / 'data/corpus-links.csv'] = csv_text([], ['lemma', 'pos', 'gloss', 'homograph', 'entry_id'])
    # Single reader bundle switched last, never partial texts or stale removed examples.
    files[root / 'data/static-corpus.json'] = js(corpus)
    publish(files)
    return report

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('exports', nargs='*', type=Path)
    parser.add_argument('--refresh-inputs', action='store_true', help='Подтвердить изменение набора файлов в .private/texts')
    args = parser.parse_args()
    manifest = ROOT / '.private/texts/inputs.json'
    try:
        paths = args.exports or sorted(p for p in manifest.parent.glob('*') if p.suffix.lower() in ('.xml', '.flextext'))
        if not args.exports and manifest.exists() and not args.refresh_inputs:
            expected = json.loads(manifest.read_text(encoding='utf-8'))
            missing = [name for name in expected if not (manifest.parent / name).is_file()]
            if missing:
                raise ValueError('Пропали ожидаемые экспорты: ' + ', '.join(missing) + '. Восстановите файлы или подтвердите новый набор через --refresh-inputs.')
        report = build(paths)
        if not args.exports:
            manifest.write_text(json.dumps([p.name for p in paths], ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(report, ensure_ascii=False, indent=2))
    except (ValueError, OSError, ET.ParseError, KeyError) as e:
        print('Сборка остановлена: ' + str(e), file=sys.stderr)
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
