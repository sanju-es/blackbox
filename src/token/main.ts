import './token.css'

/**
 * The gate (`D-65`): the only page served at `/` in configuration mode. It
 * loads no application code, keeps no state and hands the accepted token to the
 * application in the URL fragment.
 */
const MESSAGES = {
  title: 'Blackbox',
  subtitle: 'Configuration access',
  body: 'This file is protected. Enter the token defined in the service configuration.',
  label: 'Token',
  submit: 'Open configuration',
  empty: 'Enter the token.',
  wrong: 'That token is not valid.',
  failed: 'The service could not be reached.',
} as const

const root = document.getElementById('gate')
if (root === null) throw new Error('gate element missing')

root.innerHTML = `
  <main class="gate">
    <h1>${MESSAGES.title}</h1>
    <p class="subtitle">${MESSAGES.subtitle}</p>
    <p class="body">${MESSAGES.body}</p>
    <form class="form">
      <label>
        <span>${MESSAGES.label}</span>
        <input type="password" autocomplete="off" spellcheck="false" />
      </label>
      <button type="submit">${MESSAGES.submit}</button>
      <p class="error" role="alert"></p>
    </form>
  </main>
`

const form = root.querySelector('form')
const input = root.querySelector('input')
const error = root.querySelector('.error')

function show(message: string): void {
  if (error !== null) error.textContent = message
}

if (form !== null && input !== null) {
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const token = input.value.trim()
    if (token === '') {
      show(MESSAGES.empty)
      return
    }
    show('')
    void (async () => {
      try {
        const response = await fetch('/api/config', { headers: { authorization: `Bearer ${token}` } })
        if (response.status === 403) {
          show(MESSAGES.wrong)
          return
        }
        if (!response.ok) {
          show(MESSAGES.failed)
          return
        }
        window.location.replace(`/app#t=${encodeURIComponent(token)}`)
      } catch {
        show(MESSAGES.failed)
      }
    })()
  })
}
