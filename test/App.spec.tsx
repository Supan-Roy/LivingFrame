import 'react-native';
import {render} from '@testing-library/react-native';
import * as React from 'react';

import {App} from '../src/App';

describe('LivingFrame App', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the header and vega branding', () => {
    const screen = render(<App />);
    expect(screen.getByTestId('header-vega-logo')).toBeTruthy();
  });

  it('renders prominent hero action buttons', () => {
    const screen = render(<App />);
    expect(screen.getByTestId('hero-btn-explore')).toBeTruthy();
    expect(screen.getByTestId('hero-btn-more-info')).toBeTruthy();
    expect(screen.getByTestId('hero-btn-room-recap')).toBeTruthy();
  });

  it('renders content rows and cards', () => {
    const screen = render(<App />);
    expect(
      screen.getByTestId('card-trending-featured-amazon-dev-hackathon'),
    ).toBeTruthy();
  });
});
