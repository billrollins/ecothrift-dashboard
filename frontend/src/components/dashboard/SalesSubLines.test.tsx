import { ThemeProvider, createTheme } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SalesSubLines } from './SalesSubLines';

function renderLines(props: Parameters<typeof SalesSubLines>[0]) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <SalesSubLines {...props} />
    </ThemeProvider>,
  );
}

describe('SalesSubLines', () => {
  it('shows Returns and Thrift+ revenue under the Sales headline', () => {
    renderLines({ returns: '-36.00', thriftplusRevenue: '17.50', period: 'Today' });
    expect(screen.getByText('Returns -$36.00')).toBeInTheDocument();
    expect(screen.getByText('Thrift+ revenue $17.50')).toBeInTheDocument();
  });

  it('shows zero when there are none', () => {
    renderLines({ returns: '0.00', thriftplusRevenue: '0.00' });
    expect(screen.getByText('Returns $0.00')).toBeInTheDocument();
  });

  it('shows nothing from an older server that does not send them', () => {
    const { container } = renderLines({});
    expect(container).toBeEmptyDOMElement();
  });
});
