from pathlib import Path

base = Path('/app/search/web_app')
for lang, title, language in [('ru', 'Кусурский корпус', 'Кусурский'), ('en', 'Kusur corpus', 'Kusur')]:
    folder = base / 'translations' / lang
    (folder / 'corpus-specific.txt').write_text('corpus_title\t' + title + '\n', encoding='utf-8')
    with (folder / 'languages.txt').open('a', encoding='utf-8') as f:
        f.write('\nkusur\t' + language + '\n')
    with (folder / 'word_fields.txt').open('a', encoding='utf-8') as f:
        f.write('\nstem_pos\tЧасть речи основы\n')
    with (folder / 'metadata_fields.txt').open('a', encoding='utf-8') as f:
        f.write('\ntext_id\tID текста\nannotation_status\tРазметка\nsegment\tНомер сегмента\nnote\tПримечание\n')
    with (folder / 'metadata_values.txt').open('a', encoding='utf-8') as f:
        f.write('\npartial\tЧастичная разметка\n')
(base / 'templates/index/greeting_ru.html').write_text('''
<p><strong>Кусурский корпус</strong> — глоссированные тексты кусурского диалекта аварского языка.</p>
<p>Выберите «Кусурский» для поиска по словам, словарным формам и глоссам или «Русский» для поиска в переводах.
В поле «Глоссы» можно ввести <code>PL</code> или <code>APUD</code>.
Нажмите «Поиск предложений», чтобы увидеть контексты с параллельным переводом.</p>
<p>Разметка частичная. Отсутствие разбора не означает отсутствие грамматического признака.
Пометы в меню грамматики переданы из FieldWorks без восстановления невыраженных категорий.
«Лемма» — словарная форма основы из экспорта, при её отсутствии — сама основа.</p>
<p><a href="https://lillilek.github.io/kusur/corpus.html">О корпусе</a> ·
<a href="https://lillilek.github.io/kusur/">Словарь</a> ·
<a href="https://lillilek.github.io/kusur/texts.html">Тексты</a></p>
''', encoding='utf-8')
(base / 'templates/header.html').write_text('<p><a href="https://lillilek.github.io/kusur/">← Кусурский проект</a></p>', encoding='utf-8')
