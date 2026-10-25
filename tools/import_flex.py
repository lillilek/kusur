"""Import FLEx interlinear XML into Tsakorpus. Standard library, Python >=3.10.

Each FieldWorks interlinear-text GUID identifies one document. Existing documents
not present in a new export are retained. Original exports and previous versions
are kept locally under .private, never in the public repository.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LANGUAGES = ['kusur', 'russian']


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temp.replace(path)


def item(node, kind, lang=None):
    for el in node.findall('item'):
        if el.get('type') == kind and (lang is None or el.get('lang', '').split('-')[0] == lang):
            return ''.join(el.itertext()).strip()
    return ''


def add_tag(ana, category, value):
    if not value:
        return
    key = 'gr.' + category
    ana.setdefault(key, [])
    if value not in ana[key]:
        ana[key].append(value)


def convert_word(node, warnings):
    punct = item(node, 'punct')
    if punct:
        return {'wf': punct, 'wtype': 'punct'}
    wf = item(node, 'txt', 'av') or item(node, 'txt')
    if not wf:
        raise ValueError('В экспорте есть токен без словоформы. Проверьте строки экспорта.')
    word = {'wf': wf, 'wtype': 'word'}
    morphs = node.findall('morphemes/morph')
    ana = {}
    pos = item(node, 'pos')
    if pos:
        add_tag(ana, 'pos', pos)
    if morphs:
        parts, glosses, indexes, lemmas, meanings, stem_pos = [], [], [], [], [], []
        for morph in morphs:
            form = item(morph, 'txt', 'av') or item(morph, 'mb') or item(morph, 'txt')
            gloss = item(morph, 'gls', 'ru')
            kind = morph.get('type', 'unknown')
            if not form:
                warnings.append(f'{wf}: морфема без формы; поиск по морфемам неполон')
            if not gloss:
                warnings.append(f'{wf}: морфема {form!r} без русской глоссы')
            parts.append(form or '?')
            separator = '=' if kind in ('enclitic', 'proclitic') else '-'
            label = gloss or '?'
            if kind in ('suffix', 'enclitic') and glosses and not label.startswith(('-', '=')):
                label = separator + label
            if kind in ('prefix', 'proclitic') and not label.endswith(('-', '=')):
                label += separator
            glosses.append(label)
            clean_form = form.strip('-=')
            if kind in ('stem', 'root'):
                lemma = item(morph, 'cf', 'av') or clean_form
                if lemma:
                    lemmas.append(lemma)
                if gloss:
                    meanings.append(gloss)
                if item(morph, 'msa'):
                    stem_pos.append(item(morph, 'msa'))
                index_gloss = 'STEM'
            else:
                # Preserve compound labels, rather than interpreting OBL(GEN), etc.
                index_gloss = gloss.strip('-=') or 'UNKNOWN'
                if gloss:
                    add_tag(ana, 'gloss_tag', gloss.strip('-='))
            # Keep an unknown slot so adjacent-gloss searches cannot jump over it.
            if form:
                if any(c in clean_form + index_gloss for c in '{}'):
                    raise ValueError(f'{wf}: фигурные скобки в морфеме или глоссе требуют проверки')
                indexes.append(f'{index_gloss.replace(" ", ".")}{{{clean_form}}}-')
        ana.update(parts=''.join(parts), gloss=''.join(glosses), gloss_index=''.join(indexes))
        if lemmas:
            ana['lex'] = ' '.join(lemmas)
        if meanings:
            ana['trans_ru'] = '; '.join(meanings)
        if stem_pos:
            ana['stem_pos'] = '; '.join(dict.fromkeys(stem_pos))
            if not pos:
                for value in dict.fromkeys(stem_pos):
                    add_tag(ana, 'pos', value)
            elif any(p != pos for p in stem_pos):
                warnings.append(f'{wf}: часть речи слова {pos}; основы {ana["stem_pos"]}; сохранены обе')
    elif item(node, 'gls', 'ru'):
        ana['trans_ru'] = item(node, 'gls', 'ru')
    if ana:
        word['ana'] = [ana]
    return word


def sentence(words, lang, alignment, segment, notes=''):
    text = ''
    previous = ''
    position = 0
    for i, word in enumerate(words):
        wf = word['wf']
        space = bool(text) and wf[0] not in ',.;:!?…)]}»' and previous not in '([{«'
        text += ' ' if space else ''
        word['off_start'] = len(text)
        text += wf
        word['off_end'] = len(text)
        word['next_word'] = i + 1
        # Punctuation does not count towards the distance between two words.
        if word['wtype'] == 'word':
            word['sentence_index'] = position
            position += 1
        previous = wf
    for word in words:
        if 'sentence_index' in word:
            word['sentence_index_neg'] = position - word['sentence_index']
    return {'text': text, 'words': words, 'lang': lang,
            'meta': {'segment': segment, 'note': notes},
            'para_alignment': [{'off_start': 0, 'off_end': len(text), 'para_id': alignment}]}


def parse_export(path, include_notes=False):
    raw = Path(path).read_bytes()
    if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
        raise ValueError('XML с DTD/ENTITY не поддерживается')
    root = ET.fromstring(raw)
    docs = {}
    for interlinear in root.findall('./interlinear-text'):
        guid = interlinear.get('guid')
        if not guid:
            raise ValueError('У текста нет GUID: повторный экспорт должен сохранять идентификатор')
        doc_id = str(uuid.UUID(guid))
        if doc_id in docs:
            raise ValueError(f'Повтор GUID в одной выгрузке: {doc_id}')
        warnings, originals, translations, private_notes = [], [], [], []
        morph_count = gloss_count = 0
        for container in interlinear.findall('./paragraphs/paragraph/phrases'):
            for phrase in container:
                if phrase.tag not in ('phrase', 'word'):
                    raise ValueError(f'Неизвестный формат сегмента: {phrase.tag}')
                n = len(originals) + 1
                number = item(phrase, 'segnum') or item(phrase, 'ref') or str(n)
                nodes = phrase.findall('./words/word')
                if not nodes:
                    raise ValueError(f'Сегмент {number}: нет слов; проверьте настройки экспорта')
                words = [convert_word(w, warnings) for w in nodes]
                notes = item(phrase, 'note', 'ru') or item(phrase, 'nt', 'ru')
                if notes:
                    private_notes.append({'segment': number, 'note': notes})
                originals.append(sentence(words, 0, n, number, notes if include_notes else ''))
                trans = item(phrase, 'gls', 'ru') or item(phrase, 'ft', 'ru')
                if trans:
                    tokens = re.findall(r'\w+(?:[-’ʼ\']\w+)*|[^\w\s]', trans, re.UNICODE)
                    tw = [{'wf': w, 'wtype': 'word' if re.search(r'\w', w) else 'punct'} for w in tokens]
                    sent = sentence(tw, 1, n, number)
                    # Keep original translation spacing exactly, offsets refer to it.
                    at = 0
                    for word in sent['words']:
                        at = trans.index(word['wf'], at)
                        word['off_start'], word['off_end'] = at, at + len(word['wf'])
                        at = word['off_end']
                    sent['text'] = trans
                    sent['para_alignment'][0]['off_end'] = len(trans)
                    translations.append(sent)
                else:
                    warnings.append(f'Сегмент {number}: нет русского перевода')
                for node in nodes:
                    morph_count += len(node.findall('morphemes/morph'))
                    gloss_count += sum(bool(item(m, 'gls', 'ru')) for m in node.findall('morphemes/morph'))
        if not originals:
            raise ValueError(f'Текст {doc_id} пуст: существующая версия не будет заменена')
        originals[-1]['last'] = True
        if translations:
            translations[-1]['last'] = True
        title = item(interlinear, 'title', 'ru') or item(interlinear, 'title') or doc_id
        words = [w for s in originals for w in s['words'] if w['wtype'] == 'word']
        doc = {'meta': {'title': title, 'text_id': doc_id, 'annotation_status': 'partial'},
               'sentences': originals + translations}
        report = {'id': doc_id, 'title': title, 'segments': len(originals), 'words': len(words),
                  'words_with_morphemes': sum(any('parts' in a for a in w.get('ana', [])) for w in words),
                  'morphemes': morph_count, 'morphemes_with_gloss': gloss_count,
                  'translations': len(translations), 'notes': len(private_notes),
                  'notes_published': include_notes, 'warnings': warnings,
                  'audio_references': len(interlinear.findall('.//media')),
                  'source_sha256': hashlib.sha256(raw).hexdigest()}
        docs[doc_id] = (doc, report, private_notes)
    if not docs:
        raise ValueError('Не найден interlinear-text. Нужен экспорт интерлинеарного текста FieldWorks.')
    return docs


def regenerate(root):
    data_dir = root / 'tsakorpus/corpus/kusur'
    categories = {'kusur': {}, 'russian': {}}
    reports = []
    for path in sorted(data_dir.glob('*.json')):
        doc = json.loads(path.read_text(encoding='utf-8'))
        for sent in doc['sentences']:
            for word in sent['words']:
                for ana in word.get('ana', []):
                    for key, values in ana.items():
                        if key.startswith('gr.'):
                            for value in values if isinstance(values, list) else [values]:
                                categories[LANGUAGES[sent['lang']]][value] = key[3:]
        reports.append(json.loads((root / 'tsakorpus/reports' / path.name).read_text(encoding='utf-8')))
    write_json(root / 'tsakorpus/conf/categories.json', categories)
    conf_path = root / 'tsakorpus/conf/corpus.json'
    conf = json.loads(conf_path.read_text(encoding='utf-8'))
    columns = []
    for category, title in [('pos', 'Части речи'), ('gloss_tag', 'Пометы исходной разметки')]:
        tags = sorted(k for k, v in categories['kusur'].items() if v == category)
        columns.append([{'type': 'header', 'value': title}] + [
            {'type': 'gramm', 'value': tag, 'category': category, 'tooltip': tag} for tag in tags])
    conf['lang_props']['kusur']['gramm_selection'] = {'columns': columns}
    write_json(conf_path, conf)
    write_json(root / 'data/corpus-status.json', {
        'texts': len(reports), 'segments': sum(r['segments'] for r in reports),
        'words': sum(r['words'] for r in reports),
        'words_with_morphemes': sum(r['words_with_morphemes'] for r in reports),
        'documents': [{'id': r['id'], 'title': r['title'], 'segments': r['segments'], 'words': r['words']} for r in reports]})


def import_files(paths, root=ROOT, include_notes=False):
    # Validate every input before touching an existing published document.
    pending = {}
    for path in paths:
        for doc_id, value in parse_export(path, include_notes).items():
            if doc_id in pending:
                raise ValueError(f'Выбраны две версии одного текста ({doc_id}). Выберите только актуальную.')
            pending[doc_id] = (Path(path), value)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    for doc_id, (source, (doc, report, notes)) in pending.items():
        target = root / 'tsakorpus/corpus/kusur' / (doc_id + '.json')
        if target.exists():
            backup = root / '.private/backups' / stamp / target.name
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, backup)
        archive = root / '.private/exports' / stamp / (doc_id + '.xml')
        archive.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, archive)
        write_json(root / '.private/notes' / (doc_id + '.json'), notes)
        write_json(target, doc)
        write_json(root / 'tsakorpus/reports' / (doc_id + '.json'), report)
    regenerate(root)
    return len(pending)


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('files', nargs='*', type=Path)
    parser.add_argument('--pick', action='store_true', help='Выбрать XML в диалоге Windows')
    parser.add_argument('--include-notes', action='store_true', help='Публиковать примечания: только после проверки')
    args = parser.parse_args()
    files = args.files
    if args.pick:
        import tkinter as tk
        from tkinter import filedialog, messagebox
        window = tk.Tk()
        window.withdraw()
        files = [Path(p) for p in filedialog.askopenfilenames(title='Новые или обновлённые тексты FieldWorks', filetypes=[('FieldWorks XML', '*.xml *.flextext')])]
        if not files:
            return
    if not files:
        parser.error('Укажите XML или --pick')
    try:
        count = import_files(files, include_notes=args.include_notes)
        message = f'Готово: добавлено или обновлено текстов — {count}.\nДанные: tsakorpus/corpus/kusur\nСледующий шаг — публикация изменений и переиндексация на сервере (см. docs/CORPUS.md).'
        print(message)
        if args.pick:
            messagebox.showinfo('Корпус обновлён локально', message)
    except Exception as error:
        if args.pick:
            messagebox.showerror('Импорт не завершён', str(error))
        raise


if __name__ == '__main__':
    main()
