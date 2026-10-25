'use strict';
(async () => {
  const get = async path => {
    const response = await fetch(path, {cache: 'no-cache'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  };
  const stats = get('data/corpus-status.json').then(data => {
    document.getElementById('corpus-stats').textContent = `Текстов: ${data.texts} · сегментов: ${data.segments} · слов: ${data.words} · с морфемным разбором: ${data.words_with_morphemes}`;
    for (const doc of data.documents) {
      const li = document.createElement('li');
      li.textContent = `${doc.title} — ${doc.segments} сегмента, ${doc.words} слов`;
      document.getElementById('corpus-documents').append(li);
    }
  }).catch(() => {
    document.getElementById('corpus-stats').textContent = 'Не удалось загрузить состав корпуса. Попробуйте обновить страницу.';
  });
  const endpoint = get('data/corpus-endpoint.json').then(data => {
    if (!data.search_url) return;
    const url = new URL(data.search_url);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid corpus URL');
    document.getElementById('availability-title').textContent = 'Поиск на платформе Tsakorpus';
    document.getElementById('availability-text').textContent = 'Поиск открывается на отдельном сервере кусурского корпуса.';
    document.getElementById('search-title').textContent = 'Что можно искать';
    const link = document.getElementById('open-corpus');
    link.href = url.href;
    link.hidden = false;
  }).catch(() => {
    document.getElementById('availability-title').textContent = 'Не удалось проверить подключение корпуса';
    document.getElementById('availability-text').textContent = 'Обновите страницу позже. Транскрипции и переводы доступны в разделе «Тексты».';
  });
  await Promise.all([stats, endpoint]);
})();
