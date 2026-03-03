import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import AuthScreen from '../src/screens/AuthScreen';
import { getSupabaseClient } from '../src/lib/supabase';

jest.mock('../src/lib/supabase', () => ({
  getSupabaseClient: jest.fn(() => ({
    auth: {
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
    },
  })),
}));

describe('AuthScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    (getSupabaseClient as jest.Mock).mockReturnValue({
      auth: {
        signInWithPassword: jest.fn(),
        signUp: jest.fn(),
      },
    });
  });

  afterEach(() => {
    (Alert.alert as jest.Mock).mockRestore?.();
  });

  test('normalizes email before sign in', async () => {
    const client = getSupabaseClient() as {
      auth: {
        signInWithPassword: jest.Mock;
        signUp: jest.Mock;
      };
    };
    client.auth.signInWithPassword.mockResolvedValue({
      error: null,
    });

    const { getByPlaceholderText, getByText } = render(
      <AuthScreen activeProfileLabel="Test Project" />
    );

    fireEvent.changeText(getByPlaceholderText('Email'), '  USER@Example.com  ');
    fireEvent.changeText(getByPlaceholderText('Password'), 'secret123');
    fireEvent.press(getByText('Sign In'));

    await waitFor(() =>
      expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'secret123',
      })
    );
  });

  test('shows required fields error when email/password missing', () => {
    const { getByText } = render(<AuthScreen activeProfileLabel="Test Project" />);

    fireEvent.press(getByText('Sign In'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Sign in failed',
      'Email and password are required.'
    );
    const client = getSupabaseClient() as {
      auth: {
        signInWithPassword: jest.Mock;
        signUp: jest.Mock;
      };
    };
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  test('maps invalid login credentials to actionable message', async () => {
    const client = getSupabaseClient() as {
      auth: {
        signInWithPassword: jest.Mock;
        signUp: jest.Mock;
      };
    };
    client.auth.signInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    });

    const { getByPlaceholderText, getByText } = render(
      <AuthScreen activeProfileLabel="Test Project" />
    );

    fireEvent.changeText(getByPlaceholderText('Email'), 'user@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'wrong-password');
    fireEvent.press(getByText('Sign In'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Sign in failed',
        "Incorrect password, or user doesn't exist in this project yet. If new, sign up first."
      )
    );
  });
});
