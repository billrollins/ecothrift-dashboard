/**
 * The apply form's inputs in the phone look (W4). Same kinds and same values as the live form's QuestionField:
 * yes/no sends 'yes' | 'no', a pick-one sends the option text ('' = none), a pick-many sends a list of option texts.
 * Here yes/no is two big buttons and a pick-one is a column of buttons (the live form used a <select>).
 */
import type { Question } from '../../../careers/api'
import type { Answer } from './steps'

export function QuestionField({
  name,
  question,
  value,
  error,
  onChange,
}: {
  name: string
  question: Question
  value: Answer | undefined
  error?: string
  onChange: (value: Answer) => void
}) {
  const id = `q-${name.replace(/[^a-z0-9]/gi, '-')}`
  const grouped = question.type === 'yes_no' || question.type === 'multi' || question.type === 'choice'
  const text = typeof value === 'string' ? value : ''
  let input
  switch (question.type) {
    case 'yes_no':
      input = (
        <div className="cr-yn" role="radiogroup" aria-labelledby={`${id}-l`}>
          {['yes', 'no'].map((option) => (
            <button key={option} type="button" role="radio" aria-checked={value === option} onClick={() => onChange(option)}>
              {option === 'yes' ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      )
      break
    case 'multi': {
      const picked = Array.isArray(value) ? value : []
      input = (
        <div className="cr-pick" role="group" aria-labelledby={`${id}-l`}>
          {(question.options ?? []).map((option) => {
            const on = picked.includes(option)
            return (
              <button
                key={option}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(on ? picked.filter((p) => p !== option) : [...picked, option])}
              >
                {option}
              </button>
            )
          })}
        </div>
      )
      break
    }
    case 'choice':
      input = (
        <div className="cr-pick cr-one" role="radiogroup" aria-labelledby={`${id}-l`}>
          {(question.options ?? []).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={text === option}
              onClick={() => onChange(text === option && !question.required ? '' : option)}
            >
              {option}
            </button>
          ))}
        </div>
      )
      break
    case 'long_text':
      input = <textarea id={id} value={text} onChange={(e) => onChange(e.target.value)} />
      break
    default:
      input = (
        <input
          id={id}
          type={question.type === 'number' ? 'number' : question.type === 'date' ? 'date' : question.type === 'time' ? 'time' : 'text'}
          inputMode={question.type === 'number' ? 'numeric' : undefined}
          value={text}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
  return (
    <div className={`cr-q${error ? ' cr-bad' : ''}`} data-field={`answers.${name}`}>
      <label className="cr-label" id={`${id}-l`} htmlFor={grouped ? undefined : id}>
        {question.label} {!question.required && <span className="cr-opt">(optional)</span>}
      </label>
      {question.help && <div className="cr-help">{question.help}</div>}
      {input}
      <div className="cr-err" aria-live="polite">
        {error}
      </div>
    </div>
  )
}

export function TextField({
  name,
  label,
  type = 'text',
  value,
  error,
  autoComplete,
  onChange,
}: {
  name: string
  label: string
  type?: string
  value: string
  error?: string
  autoComplete?: string
  onChange: (value: string) => void
}) {
  return (
    <div className={`cr-q${error ? ' cr-bad' : ''}`} data-field={name}>
      <label className="cr-label" htmlFor={`f-${name}`}>
        {label}
      </label>
      <input
        id={`f-${name}`}
        type={type}
        autoComplete={autoComplete}
        inputMode={type === 'tel' ? 'tel' : type === 'email' ? 'email' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="cr-err" aria-live="polite">
        {error}
      </div>
    </div>
  )
}
