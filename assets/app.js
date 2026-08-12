(function () {
  'use strict'

  const buttons = Array.from(document.querySelectorAll('[data-filter]'))
  const cards = Array.from(document.querySelectorAll('[data-story]'))
  const search = document.getElementById('storySearch')
  const visibleCount = document.getElementById('visibleCount')
  const noResults = document.getElementById('noResults')
  let product = 'all'

  function applyFilters() {
    const query = (search?.value || '').trim().toLowerCase()
    let visible = 0
    cards.forEach(function (card) {
      const productMatches = product === 'all' || card.dataset.product === product
      const queryMatches = !query || (card.dataset.search || '').includes(query)
      card.hidden = !(productMatches && queryMatches)
      if (!card.hidden) visible += 1
    })
    if (visibleCount) visibleCount.textContent = String(visible)
    if (noResults) noResults.hidden = visible !== 0
  }

  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      product = button.dataset.filter
      buttons.forEach(function (candidate) {
        const selected = candidate === button
        candidate.classList.toggle('active', selected)
        candidate.setAttribute('aria-pressed', String(selected))
      })
      applyFilters()
    })
  })
  search?.addEventListener('input', applyFilters)
}())
