import React, { useState } from 'react'

export function PasswordInput({ value, onChange, placeholder, required, minLength, disabled, className, style }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        disabled={disabled}
        className={className}
        style={{ ...style, paddingRight: '38px', width: '100%', boxSizing: 'border-box' }}
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        tabIndex={-1}
        style={{
          position: 'absolute', right: '10px',
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '0', lineHeight: 1, fontSize: '16px', color: '#94a3b8',
        }}
        title={show ? 'Hide password' : 'Show password'}
      >
        {show ? '🙈' : '👁️'}
      </button>
    </div>
  )
}
