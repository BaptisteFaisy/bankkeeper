// Email login plus captain display name. Social login only:
// no wallet, no seed phrase, no gas. The email maps to a stable
// player id on this device (see the session helper in App code).
import { useState } from 'react';

interface Props {
  onLogin: (email: string, name: string) => void;
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function Auth({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  function submit(): void {
    if (!validEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    if (name.trim().length < 2) {
      setError('Pick a captain name (2+ characters).');
      return;
    }
    setError('');
    onLogin(email.trim(), name.trim());
  }

  return (
    <div className="auth-card">
      <h2>Enter Tidewater</h2>
      <p className="muted">Sign in with email — no wallet needed.</p>
      <label>
        Email
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          type="email"
          data-testid="auth-email"
        />
      </label>
      <label>
        Captain name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Captain of the harbour"
          maxLength={24}
          data-testid="auth-name"
        />
      </label>
      {error !== '' && (
        <p className="error" data-testid="auth-error">
          {error}
        </p>
      )}
      <button onClick={submit} type="button" data-testid="auth-submit">
        Set sail
      </button>
    </div>
  );
}
