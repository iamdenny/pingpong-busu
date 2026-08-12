import { render, screen } from '@testing-library/react'; import { MemoryRouter } from 'react-router-dom'; import { describe, expect, it } from 'vitest'; import { Layout } from './Layout';
describe('Layout',()=>{it('shows the demo mode banner',()=>{render(<MemoryRouter><Layout/></MemoryRouter>);expect(screen.getByText('현재 화면은 개발용 가상 데이터입니다.')).toBeInTheDocument();});});
