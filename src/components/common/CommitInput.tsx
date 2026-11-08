import { useEffect, useState } from 'react';
import type { InputHTMLAttributes } from 'react';

interface CommitInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onCommit: (value: string) => void;
  validate?: (value: string) => string | null;
}

export function CommitInput({ value, onCommit, validate, className, ...rest }: CommitInputProps) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(value);
    setError(null);
  }, [value]);

  const commit = () => {
    const message = validate ? validate(draft) : null;
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    if (draft !== value) onCommit(draft);
  };

  return (
    <span className="commit-input-wrap">
      <input
        {...rest}
        className={`commit-input ${error ? 'has-error' : ''} ${className ?? ''}`}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          if (error) setError(null);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            setDraft(value);
            setError(null);
          }
        }}
      />
      {error ? <span className="field-error">{error}</span> : null}
    </span>
  );
}
