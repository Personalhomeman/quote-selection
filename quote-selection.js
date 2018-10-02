/* @flow */

import rangeToMarkdown from './markdown-parsing'

const containers = new WeakMap()
let installed = 0

type Subscription = {|
  unsubscribe: () => void
|}

export function subscribe(container: Element): Subscription {
  install(container)
  return {
    unsubscribe: () => {
      uninstall(container)
    }
  }
}

export function install(container: Element) {
  installed += containers.has(container) ? 0 : 1
  containers.set(container, 1)
  document.addEventListener('keydown', quoteSelection)
}

export function uninstall(container: Element) {
  installed -= containers.has(container) ? 1 : 0
  containers.delete(container)
  if (!installed) {
    document.removeEventListener('keydown', quoteSelection)
  }
}

function eventIsNotRelevant(event: KeyboardEvent): boolean {
  return (
    event.defaultPrevented ||
    (event.key !== 'r' || event.metaKey || event.altKey || event.shiftKey || event.ctrlKey) ||
    (event.target instanceof HTMLElement && isFormField(event.target))
  )
}

export function findContainer(el: Element): ?Element {
  let parent = el
  while ((parent = parent.parentElement)) {
    if (containers.has(parent)) {
      return parent
    }
  }
}

export function findTextarea(container: Element): ?HTMLTextAreaElement {
  for (const field of container.querySelectorAll('textarea')) {
    if (field instanceof HTMLTextAreaElement && visible(field)) {
      return field
    }
  }
}

function quoteSelection(event: KeyboardEvent): void {
  if (eventIsNotRelevant(event)) return
  const selection = window.getSelection()
  let range
  try {
    range = selection.getRangeAt(0)
  } catch (err) {
    return
  }
  if (quote(selection.toString(), range)) {
    event.preventDefault()
  }
}

export function quote(text: string, range: Range): boolean {
  let selectionText = text.trim()
  if (!selectionText) return false

  let focusNode = range.startContainer
  if (!focusNode) return false

  if (focusNode.nodeType !== Node.ELEMENT_NODE) focusNode = focusNode.parentNode
  if (!(focusNode instanceof Element)) return false

  const container = findContainer(focusNode)
  if (!container) return false

  const markdownSelector = container.getAttribute('data-quote-markdown')
  if (markdownSelector != null) {
    try {
      selectionText = selectFragment(rangeToMarkdown(range, markdownSelector))
        .replace(/^\n+/, '')
        .replace(/\s+$/, '')
    } catch (error) {
      setTimeout(() => {
        throw error
      })
    }
  }

  const dispatched = container.dispatchEvent(
    new CustomEvent('quote-selection', {
      bubbles: true,
      cancelable: true,
      detail: {range, selectionText}
    })
  )

  if (!dispatched) {
    return true
  }

  const field = findTextarea(container)
  if (!field) return false

  let quotedText = `> ${selectionText.replace(/\n/g, '\n> ')}\n\n`
  if (field.value) {
    quotedText = `${field.value}\n\n${quotedText}`
  }
  field.value = quotedText
  field.focus()
  field.selectionStart = field.value.length
  field.scrollTop = field.scrollHeight

  return true
}

function visible(el: HTMLElement): boolean {
  return !(el.offsetWidth <= 0 && el.offsetHeight <= 0)
}

function selectFragment(fragment: DocumentFragment): string {
  const body = document.body
  if (!body) return ''

  const div = document.createElement('div')
  div.appendChild(fragment)
  div.style.cssText = 'position:absolute;left:-9999px;'
  body.appendChild(div)
  let selectionText = ''
  try {
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(div)
    selection.removeAllRanges()
    selection.addRange(range)
    selectionText = selection.toString()
    selection.removeAllRanges()
    range.detach()
  } finally {
    body.removeChild(div)
  }
  return selectionText
}

function isFormField(element: HTMLElement): boolean {
  const name = element.nodeName.toLowerCase()
  const type = (element.getAttribute('type') || '').toLowerCase()
  return (
    name === 'select' ||
    name === 'textarea' ||
    (name === 'input' && type !== 'submit' && type !== 'reset') ||
    element.isContentEditable
  )
}
