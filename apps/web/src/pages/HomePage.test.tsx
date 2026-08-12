import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('keeps source details compact and reveals statuses with URLs', async () => {
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><HomePage /></MemoryRouter></QueryClientProvider>);
    const summary = await screen.findByText('검색 출처');
    const details = summary.closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(screen.getByText('4곳 검색 중 · 전체 8곳')).toBeInTheDocument();
    fireEvent.click(screen.getByText('상세'));
    expect(details).toHaveAttribute('open');
    expect(screen.getByText('애즈트리').closest('li')).toHaveTextContent('검색 중');
    expect(screen.getByText('마이티티').closest('li')).toHaveTextContent('검색 중');
    expect(screen.getByText('에어핑퐁').closest('li')).toHaveTextContent('운영 설정 필요');
    expect(screen.getByText('오케이핑퐁').closest('li')).toHaveTextContent('운영 설정 필요');
    expect(screen.getByText('슈퍼스타탁구').closest('li')).toHaveTextContent('검색 중');
    expect(screen.getByText('아이핑').closest('li')).toHaveTextContent('서버 계정 설정 필요');
    expect(screen.getByText('용인탁구협회 다음 카페').closest('li')).toHaveTextContent('무료 API 키 설정 필요');
    expect(screen.queryByText('밴드')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '마이티티 사이트 열기' })).toHaveAttribute('href', 'https://mytt.kr/');
  });
});
