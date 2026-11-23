# Кусурский проект

Сайт: https://lillilek.github.io/kusur/

Словарь, транскрипции, глоссированный корпус и глоссарий работают статически на GitHub Pages. Сервер поиска и Docker для новой версии не нужны.

- [Обновление статического корпуса и публикация](docs/STATIC-CORPUS.md).
- Исходники: один или несколько XML/FLExText в `.private/texts/`; каждый может содержать несколько текстов.
- Сборка: `python -X utf8 tools/build_static_corpus.py` или `UPDATE-CORPUS.cmd`.
- Просмотр: `python -X utf8 tools/preview_static.py`, затем http://127.0.0.1:8767/corpus.html.
- Ручные связи: `data/corpus-links.csv`; пояснения глосс: `data/glossary.csv`.

Предыдущий комплект Tsakorpus сохранён в `deploy/`, `tsakorpus/`, `tools/import_flex.py`; [его инструкция](docs/CORPUS.md) относится к серверной версии. Статический `corpus.html` его не использует. Для локального просмотра новой версии используйте `OPEN-STATIC-CORPUS.cmd`.
