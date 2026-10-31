(() => {
  'use strict';
  const articles = [...document.querySelectorAll('article')];
  const links = [...document.querySelectorAll('nav a')];
  const firstId = articles[0].id;

  function showTopic(id) {
    const chosen = articles.find(article => article.id === id) || articles[0];
    articles.forEach(article => { article.hidden = article !== chosen; });
    links.forEach(link => {
      if (link.hash === `#${chosen.id}`) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.title = `${chosen.querySelector('h1').textContent} | AWS さっと復習`;
  }

  function currentId() {
    try { return decodeURIComponent(location.hash.slice(1)) || firstId; }
    catch { return firstId; }
  }

  links.forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    const id = link.hash.slice(1);
    // Native hash navigation works when opened directly as a local file, too.
    if (location.hash !== link.hash) location.hash = id;
    showTopic(id);
  }));
  document.querySelector('.brand').addEventListener('click', () => showTopic(firstId));
  window.addEventListener('hashchange', () => {
    const id = currentId();
    // In-page links such as "本文へ" must not switch the selected topic.
    if (articles.some(article => article.id === id)) showTopic(id);
  });
  showTopic(currentId());
})();
