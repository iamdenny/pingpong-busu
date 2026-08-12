import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SourceRefreshProgress } from './SourceRefreshProgress';

describe('SourceRefreshProgress', () => {
  it('shows aggregate and per-source live progress', () => {
    render(<SourceRefreshProgress sources={[
      { sourceCode: 'astree', sourceName: '애즈트리', state: 'succeeded', found: 4, inserted: 1 },
      { sourceCode: 'ttadivision', sourceName: '대한탁구협회 디비전', state: 'refreshing' },
      { sourceCode: 'mytt', sourceName: '마이티티', state: 'refreshing' },
    ]} />);
    expect(screen.getByRole('heading', { name: '3곳 중 1곳 완료 · 2곳 조회 중' })).toBeInTheDocument();
    expect(screen.getByText('애즈트리').closest('li')).toHaveTextContent('완료 · 신규·변경 1건');
    expect(screen.getByText('마이티티').closest('li')).toHaveTextContent('조회 중');
  });
});
