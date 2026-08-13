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

  const reel = document.querySelector('[data-hero-reel]')
  if (!reel) return

  const video = reel.querySelector('#heroReel')
  const tapeButtons = Array.from(reel.querySelectorAll('[data-reel-tape]'))
  const toggle = reel.querySelector('[data-reel-toggle]')
  const status = reel.querySelector('[data-reel-status]')
  const bug = reel.querySelector('[data-reel-bug]')
  if (!video || tapeButtons.length === 0) return

  const toggleIcon = toggle?.querySelector('[data-reel-icon]')
  const toggleLabel = toggle?.querySelector('[data-reel-toggle-label]')
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  let prefersReducedMotion = reducedMotion?.matches || false
  let activeTape = Math.max(0, tapeButtons.findIndex(function (button) {
    return button.getAttribute('aria-pressed') === 'true'
  }))
  let wantsPlayback = !prefersReducedMotion
  let userPlaybackChoice = null
  let isInViewport = true
  let playRequest = 0
  let playIsPending = false

  video.muted = true
  video.defaultMuted = true
  video.playsInline = true
  video.autoplay = false
  video.controls = false
  video.setAttribute('muted', '')
  video.setAttribute('playsinline', '')

  function tapeCounter() {
    return `${String(activeTape + 1).padStart(2, '0')} / ${String(tapeButtons.length).padStart(2, '0')}`
  }

  function updateState(state, statusLabel) {
    const isPlaying = state === 'playing' || state === 'loading'
    const action = state === 'ended' ? 'Replay' : isPlaying ? 'Pause' : 'Play'

    reel.dataset.state = state
    reel.dataset.activeTape = tapeButtons[activeTape]?.dataset.index || String(activeTape)
    if (status) status.textContent = `${statusLabel || state.toUpperCase()} ${tapeCounter()}`
    if (bug) bug.textContent = `MQDSE / COPY ${String(activeTape + 1).padStart(2, '0')}`
    if (toggle) {
      toggle.dataset.state = state
      toggle.setAttribute('aria-label', `${action} desk tape`)
      toggle.setAttribute('aria-pressed', String(isPlaying))
    }
    if (toggleIcon) toggleIcon.textContent = isPlaying ? 'Ⅱ' : '▶'
    if (toggleLabel) toggleLabel.textContent = action
  }

  function environmentAllowsPlayback() {
    return document.visibilityState !== 'hidden' && isInViewport
  }

  function stopPlayback(options) {
    const settings = options || {}
    playRequest += 1
    playIsPending = false
    if (settings.clearIntent) wantsPlayback = false
    video.pause()
    updateState(settings.state || 'paused', settings.status || 'PAUSED')
  }

  function handlePlayRejection(requestId, error) {
    if (requestId !== playRequest) return
    playIsPending = false
    wantsPlayback = false
    const wasInterrupted = error?.name === 'AbortError'
    updateState(wasInterrupted ? 'paused' : 'blocked', wasInterrupted ? 'PAUSED' : 'PRESS PLAY')
  }

  function startPlayback() {
    wantsPlayback = true
    if (!environmentAllowsPlayback()) {
      updateState('paused', 'PAUSED')
      return
    }

    if (video.ended) video.currentTime = 0
    const requestId = ++playRequest
    playIsPending = true
    updateState('loading', 'LOADING')

    try {
      const playPromise = video.play()
      if (playPromise?.then) {
        playPromise.then(function () {
          if (requestId !== playRequest) return
          playIsPending = false
          if (!wantsPlayback || !environmentAllowsPlayback()) {
            stopPlayback({ status: 'PAUSED' })
            return
          }
          updateState('playing', 'PLAYING')
        }).catch(function (error) {
          handlePlayRejection(requestId, error)
        })
      } else {
        playIsPending = false
        updateState('playing', 'PLAYING')
      }
    } catch (error) {
      handlePlayRejection(requestId, error)
    }
  }

  function loadTape(index, shouldPlay) {
    const tape = tapeButtons[index]
    if (!tape) return

    playRequest += 1
    playIsPending = false
    activeTape = index
    tapeButtons.forEach(function (button, buttonIndex) {
      button.setAttribute('aria-pressed', String(buttonIndex === activeTape))
    })

    video.pause()
    video.src = tape.dataset.src
    if (tape.dataset.poster) video.poster = tape.dataset.poster
    video.load()
    updateState('paused', shouldPlay ? 'LOADING' : prefersReducedMotion ? 'MOTION OFF' : 'READY')
    if (shouldPlay) startPlayback()
  }

  tapeButtons.forEach(function (button, index) {
    button.addEventListener('click', function () {
      userPlaybackChoice = 'play'
      wantsPlayback = true
      loadTape(index, true)
    })
  })

  toggle?.addEventListener('click', function () {
    if ((!video.paused && !video.ended) || playIsPending) {
      userPlaybackChoice = 'pause'
      stopPlayback({ clearIntent: true, status: 'PAUSED' })
      return
    }

    userPlaybackChoice = 'play'
    startPlayback()
  })

  video.addEventListener('play', function () {
    if (!wantsPlayback || !environmentAllowsPlayback()) {
      stopPlayback({ status: 'PAUSED' })
      return
    }
    updateState('playing', 'PLAYING')
  })

  video.addEventListener('playing', function () {
    playIsPending = false
    updateState('playing', 'PLAYING')
  })

  video.addEventListener('waiting', function () {
    if (wantsPlayback) updateState('loading', 'LOADING')
  })

  video.addEventListener('pause', function () {
    if (!video.ended && !playIsPending && reel.dataset.state !== 'blocked') {
      updateState('paused', prefersReducedMotion && userPlaybackChoice !== 'play' ? 'MOTION OFF' : 'PAUSED')
    }
  })

  video.addEventListener('ended', function () {
    playIsPending = false
    if (prefersReducedMotion || !wantsPlayback) {
      wantsPlayback = false
      updateState('ended', 'COMPLETE')
      return
    }
    loadTape((activeTape + 1) % tapeButtons.length, true)
  })

  video.addEventListener('error', function () {
    playRequest += 1
    playIsPending = false
    wantsPlayback = false
    updateState('error', 'UNAVAILABLE')
  })

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      if (!video.paused || playIsPending) stopPlayback({ status: 'PAUSED' })
    } else if (wantsPlayback && isInViewport) {
      startPlayback()
    }
  })

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(function (entries) {
      const entry = entries.find(function (candidate) {
        return candidate.target === reel
      })
      if (!entry) return

      const wasInViewport = isInViewport
      isInViewport = entry.isIntersecting && entry.intersectionRatio > 0
      if (!isInViewport && wasInViewport && (!video.paused || playIsPending)) {
        stopPlayback({ status: 'PAUSED' })
      } else if (isInViewport && !wasInViewport && wantsPlayback && document.visibilityState !== 'hidden') {
        startPlayback()
      }
    }, { threshold: [0, 0.15] })
    observer.observe(reel)
  }

  function handleMotionPreference(event) {
    prefersReducedMotion = event.matches
    if (prefersReducedMotion) {
      stopPlayback({ clearIntent: true, status: 'MOTION OFF' })
    } else if (userPlaybackChoice !== 'pause') {
      wantsPlayback = true
      startPlayback()
    } else {
      updateState('paused', 'PAUSED')
    }
  }

  if (reducedMotion?.addEventListener) {
    reducedMotion.addEventListener('change', handleMotionPreference)
  } else {
    reducedMotion?.addListener?.(handleMotionPreference)
  }

  loadTape(activeTape, !prefersReducedMotion)
}())
