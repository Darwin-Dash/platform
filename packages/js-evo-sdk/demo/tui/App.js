/**
 * Main TUI Application Component
 *
 * React-like terminal interface built with Ink.
 */

import React, { useState, useEffect } from 'react';
import { Box, useApp, useInput } from 'ink';
import MainMenu from './components/MainMenu.js';
import IdentityView from './components/IdentityView.js';
import DpnsView from './components/DpnsView.js';
import DocumentsView from './components/DocumentsView.js';
import TokensView from './components/TokensView.js';
import DashPayView from './components/DashPayView.js';
import SystemView from './components/SystemView.js';
import SettingsView from './components/SettingsView.js';
import { sdkConnection } from './utils/sdk.js';

const h = React.createElement;

export default function App({ network = 'testnet' }) {
  const { exit } = useApp();
  const [currentView, setCurrentView] = useState('main');
  const [connectionStatus, setConnectionStatus] = useState({
    connected: false,
    connecting: false,
    network,
    error: null,
  });

  // Initialize connection on mount
  useEffect(() => {
    let mounted = true;

    const initConnection = async () => {
      sdkConnection.setNetwork(network);
      setConnectionStatus({
        connected: false,
        connecting: true,
        network,
        error: null,
      });

      try {
        await sdkConnection.connect();
        if (mounted) {
          setConnectionStatus(sdkConnection.getStatus());
        }
      } catch (err) {
        if (mounted) {
          setConnectionStatus({
            connected: false,
            connecting: false,
            network,
            error: err.message,
          });
        }
      }
    };

    initConnection();

    return () => {
      mounted = false;
    };
  }, [network]);

  // Global keyboard shortcuts
  useInput((input, key) => {
    // Ctrl+C to exit
    if (input === 'c' && key.ctrl) {
      sdkConnection.disconnect();
      exit();
    }
    // Q to quit from main menu
    if (input === 'q' && currentView === 'main') {
      sdkConnection.disconnect();
      exit();
    }
  });

  const handleMenuSelect = (value) => {
    if (value === 'exit') {
      sdkConnection.disconnect();
      exit();
      return;
    }
    setCurrentView(value);
  };

  const handleBack = () => {
    setCurrentView('main');
  };

  const handleStatusChange = (status) => {
    setConnectionStatus(status);
  };

  const renderView = () => {
    switch (currentView) {
      case 'main':
        return h(MainMenu, {
          onSelect: handleMenuSelect,
          connectionStatus: connectionStatus
        });
      case 'identity':
        return h(IdentityView, { onBack: handleBack });
      case 'dpns':
        return h(DpnsView, { onBack: handleBack });
      case 'documents':
        return h(DocumentsView, { onBack: handleBack });
      case 'tokens':
        return h(TokensView, { onBack: handleBack });
      case 'dashpay':
        return h(DashPayView, { onBack: handleBack });
      case 'system':
        return h(SystemView, { onBack: handleBack });
      case 'settings':
        return h(SettingsView, {
          onBack: handleBack,
          onStatusChange: handleStatusChange
        });
      default:
        return h(MainMenu, {
          onSelect: handleMenuSelect,
          connectionStatus: connectionStatus
        });
    }
  };

  return h(Box, { flexDirection: 'column', minHeight: 20 }, renderView());
}
