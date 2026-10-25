# Кусурский проект

Сайт: https://lillilek.github.io/kusur/

Словарь и транскрипции работают на GitHub Pages. Глоссированный корпус подготовлен для отдельного сервера **Tsakorpus + Elasticsearch**.

- [Обновление, размещение и оставшиеся задачи](docs/CORPUS.md)
- Windows: `UPDATE-CORPUS.cmd` → выбрать новые XML FieldWorks.
- Сервер: `git pull --ff-only`, затем `sh deploy/update.sh`.
- После запуска: указать HTTPS-адрес поиска в `data/corpus-endpoint.json`.

Пока сервер не выбран, страница «Корпус» показывает статус подготовки.
