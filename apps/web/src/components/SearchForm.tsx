import { Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';

export function SearchForm({ initialQuery = '', onSearch, compact = false }: { initialQuery?: string; onSearch: (query: string) => void; compact?: boolean }) {
  const [query, setQuery] = useState(initialQuery); const [error, setError] = useState('');
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const value = query.trim(); if (!value) { setError('선수 이름이나 소속을 입력해 주세요.'); return; } setError(''); onSearch(value); };
  return <form className={`search-form ${compact ? 'search-form--compact' : ''}`} action="#/search" method="get" role="search" onSubmit={submit} noValidate>
    <label htmlFor={compact ? 'header-search' : 'home-search'}>선수 검색</label>
    <div className="search-form__row"><Search aria-hidden="true" size={21} /><input id={compact ? 'header-search' : 'home-search'} name="q" value={query} onChange={(event) => { setQuery(event.target.value); if (error) setError(''); }} placeholder="선수 이름, 소속 또는 지역을 입력하세요" autoComplete="off" enterKeyHint="search" required aria-describedby={error ? 'search-error' : undefined} /><button type="submit">검색</button></div>
    {error && <p id="search-error" className="field-error" role="alert">{error}</p>}
  </form>;
}
