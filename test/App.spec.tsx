import 'react-native';
import {render} from '@testing-library/react-native';
import * as React from 'react';
import {
  useTVEventHandler,
  useKeplerBackHandler,
} from '@amazon-devices/react-native-kepler';

import {App} from '../src/App';

describe('LivingFrame App', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the header brand and room sensor status', () => {
    const screen = render(<App />);
    expect(screen.getByTestId('header-brand-title')).toBeTruthy();
    expect(screen.getByTestId('header-room-pill')).toBeTruthy();
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
      screen.getByTestId('card-trending-featured-behind-the-screams'),
    ).toBeTruthy();
  });

  it('registers TV event handler for remote home button and exits app', () => {
    render(<App />);

    expect(useTVEventHandler).toHaveBeenCalled();
    const eventHandler = (useTVEventHandler as unknown as jest.Mock).mock.calls[0][0];
    const mockBackHandler = (useKeplerBackHandler as unknown as jest.Mock).mock.results[0].value;

    // Trigger remote home button event
    eventHandler({eventType: 'home'});
    expect(mockBackHandler.exitApp).toHaveBeenCalled();
  });

  it('exits app when back button is pressed at root screen', () => {
    render(<App />);

    const mockBackHandler = (useKeplerBackHandler as unknown as jest.Mock).mock.results[0].value;
    expect(mockBackHandler.addEventListener).toHaveBeenCalledWith(
      'hardwareBackPress',
      expect.any(Function),
    );

    const backCallback = mockBackHandler.addEventListener.mock.calls[0][1];
    backCallback();
    expect(mockBackHandler.exitApp).toHaveBeenCalled();
  });
});
