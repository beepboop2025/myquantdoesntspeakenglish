(function () {
  'use strict'

  const buttons = Array.from(document.querySelectorAll('[data-filter]'))
  const cards = Array.from(document.querySelectorAll('[data-story]'))
  const search = document.getElementById('storySearch')
  const visibleCount = document.getElementById('visibleCount')
  const noResults = document.getElementById('noResults')
  const routeControls = Array.from(document.querySelectorAll('[data-route-filter]'))
  const rangeButtons = Array.from(document.querySelectorAll('[data-window]'))
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

  function selectProduct(nextProduct, moveToWire) {
    product = nextProduct || 'all'
    buttons.forEach(function (candidate) {
      const selected = candidate.dataset.filter === product
      candidate.classList.toggle('active', selected)
      candidate.setAttribute('aria-pressed', String(selected))
    })
    routeControls.forEach(function (control) {
      const selected = control.dataset.routeFilter === product
      control.classList.toggle('active', selected)
      control.setAttribute('aria-pressed', String(selected))
    })
    applyFilters()
    if (moveToWire) {
      document.getElementById('wire')?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      })
    }
  }

  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      selectProduct(button.dataset.filter, false)
    })
  })
  routeControls.forEach(function (control) {
    control.addEventListener('click', function () {
      selectProduct(control.dataset.routeFilter, true)
    })
    control.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      selectProduct(control.dataset.routeFilter, true)
    })
  })
  search?.addEventListener('input', applyFilters)

  const productOrder = ['seiche', 'liquilens', 'liquilens-undertow', 'myquant']
  const productLabels = {
    seiche: 'Seiche',
    liquilens: 'LiquiLens',
    'liquilens-undertow': 'Undertow',
    myquant: 'House',
  }
  const svg = document.getElementById('cadenceChart')
  const pulseDataNode = document.getElementById('signalPulseData')
  let pulseData = null
  try { pulseData = JSON.parse(pulseDataNode?.textContent || 'null') } catch { pulseData = null }

  function renderCadence(windowSize) {
    if (!svg || !pulseData?.days?.length) return
    const days = pulseData.days.slice(-windowSize)
    const width = 760
    const left = 46
    const right = 18
    const top = 22
    const baseline = 198
    const chartHeight = baseline - top
    const step = (width - left - right) / Math.max(1, days.length)
    const barWidth = Math.max(5, step - Math.min(10, step * 0.28))
    const max = Math.max(1, ...days.map(function (day) {
      return Object.values(day.counts).reduce(function (sum, count) { return sum + count }, 0)
    }))
    const labelEvery = Math.max(1, Math.ceil(days.length / 7))
    const grid = [0, .5, 1].map(function (ratio) {
      const y = baseline - ratio * chartHeight
      return '<g class="cadence-grid"><line x1="' + left + '" x2="' + (width - right) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (left - 10) + '" y="' + (y + 4) + '" text-anchor="end">' + Math.round(max * ratio) + '</text></g>'
    }).join('')
    const bars = days.map(function (day, index) {
      const x = left + index * step + (step - barWidth) / 2
      let y = baseline
      const total = Object.values(day.counts).reduce(function (sum, count) { return sum + count }, 0)
      const segments = productOrder.map(function (productId) {
        const count = day.counts[productId] || 0
        if (!count) return ''
        const segmentHeight = Math.max(4, count / max * chartHeight)
        y -= segmentHeight
        return '<rect class="pulse-' + productId + '" x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + barWidth.toFixed(2) + '" height="' + segmentHeight.toFixed(2) + '" rx="2" />'
      }).join('')
      const label = index % labelEvery === 0 || index === days.length - 1
        ? '<text x="' + (x + barWidth / 2).toFixed(2) + '" y="226" text-anchor="middle">' + day.date.slice(5) + '</text>'
        : ''
      const detail = productOrder.map(function (productId) { return productLabels[productId] + ' ' + (day.counts[productId] || 0) }).join(', ')
      return '<g class="cadence-day" data-date="' + day.date + '" tabindex="0"><title>' + day.date + ': ' + total + ' records; ' + detail + '</title>' + segments + label + '</g>'
    }).join('')
    svg.innerHTML = '<desc>Interactive dispatch cadence chart. Use the range controls to show seven, fourteen, or twenty-eight days.</desc>' + grid + bars
    svg.setAttribute('aria-label', 'Published records per day over the latest ' + days.length + ' days, stacked by product')
  }

  rangeButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      const windowSize = Number.parseInt(button.dataset.window || '14', 10)
      rangeButtons.forEach(function (candidate) {
        const selected = candidate === button
        candidate.classList.toggle('active', selected)
        candidate.setAttribute('aria-pressed', String(selected))
      })
      renderCadence(windowSize)
    })
  })

  selectProduct('all', false)
}())
