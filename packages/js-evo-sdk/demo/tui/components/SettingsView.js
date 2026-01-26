/**
 * Settings View Component
 *
 * Configure network connection settings.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { sdkConnection } from '../utils/sdk.js';

const h = React.createElement;

const networkItems = [
  { label: 'Testnet   - Dash Platform testnet', value: 'testnet' },
  { label: 'Mainnet   - Dash Platform mainnet', value: 'mainnet' },
  { label: 'Local     - Local dashmate network', value: 'local' },
  { label: 'Back to Main Menu', value: 'back' },
];

const settingsItems = [
  { label: 'Change Network', value: 'network' },
  { label: 'Reconnect', value: 'reconnect' },
  { label: 'Disconnect', value: 'disconnect' },
  { label: 'Back to Main Menu', value: 'back' },
];

export default function SettingsView({ onBack, onStatusChange }) {
  const [mode, setMode] = useState('menu');
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState(null);

  useInput((input, key) => {
    if (key.escape) {
      if (mode !== 'menu') {
        setMode('menu');
        setMessage(null);
      } else {
        onBack();
      }
    }
  });

  const handleNetworkSelect = async (value) => {
    if (value === 'back') {
      onBack();
      return;
    }

    sdkConnection.disconnect();
    sdkConnection.setNetwork(value);

    setConnecting(true);
    setMessage(null);

    try {
      await sdkConnection.connect();
      setMessage({ type: 'success', text: `Connected to ${value}` });
      if (onStatusChange) {
        onStatusChange(sdkConnection.getStatus());
      }
    } catch (err) {
      setMessage({ type: 'error', text: `Failed to connect: ${err.message}` });
    } finally {
      setConnecting(false);
    }
  };

  const handleSettingsSelect = async (value) => {
    if (value === 'back') {
      onBack();
      return;
    }

    if (value === 'network') {
      setMode('network');
      setMessage(null);
      return;
    }

    const currentStatus = sdkConnection.getStatus();

    if (value === 'reconnect') {
      sdkConnection.disconnect();
      setConnecting(true);
      setMessage(null);

      try {
        await sdkConnection.connect();
        setMessage({ type: 'success', text: `Reconnected to ${currentStatus.network}` });
        if (onStatusChange) {
          onStatusChange(sdkConnection.getStatus());
        }
      } catch (err) {
        setMessage({ type: 'error', text: `Failed to reconnect: ${err.message}` });
      } finally {
        setConnecting(false);
      }
      return;
    }

    if (value === 'disconnect') {
      sdkConnection.disconnect();
      setMessage({ type: 'success', text: 'Disconnected' });
      if (onStatusChange) {
        onStatusChange(sdkConnection.getStatus());
      }
    }
  };

  const currentStatus = sdkConnection.getStatus();

  const children = [
    h(Box, { key: 'header', marginBottom: 1, paddingX: 2 },
      h(Text, { bold: true, color: 'cyan' }, 'Settings')
    ),
    h(Box, { key: 'divider1', marginBottom: 1, paddingX: 2 },
      h(Text, { color: 'gray' }, '─'.repeat(50))
    ),

    // Current Status
    h(Box, { key: 'status', flexDirection: 'column', paddingX: 2, marginBottom: 1 },
      h(Text, { color: 'gray', bold: true }, 'Current Connection:'),
      h(Box, { marginLeft: 2, flexDirection: 'column' },
        h(Text, null,
          h(Text, { color: 'gray' }, 'Network:  '),
          h(Text, { color: 'cyan' }, currentStatus.network)
        ),
        h(Text, null,
          h(Text, { color: 'gray' }, 'Status:   '),
          h(Text, { color: currentStatus.connected ? 'green' : currentStatus.connecting ? 'yellow' : 'red' },
            currentStatus.connected
              ? 'Connected'
              : currentStatus.connecting
                ? 'Connecting...'
                : 'Disconnected'
          )
        ),
        currentStatus.error ? h(Text, null,
          h(Text, { color: 'gray' }, 'Error:    '),
          h(Text, { color: 'red' }, currentStatus.error)
        ) : null
      )
    ),
    h(Box, { key: 'divider2', marginBottom: 1, paddingX: 2 },
      h(Text, { color: 'gray' }, '─'.repeat(50))
    )
  ];

  if (mode === 'menu') {
    children.push(
      h(Box, { key: 'menu', paddingX: 2 },
        h(SelectInput, {
          items: settingsItems,
          onSelect: (item) => handleSettingsSelect(item.value),
          indicatorComponent: ({ isSelected }) =>
            h(Text, { color: isSelected ? 'cyan' : 'gray' }, isSelected ? '> ' : '  '),
          itemComponent: ({ isSelected, label }) =>
            h(Text, { color: isSelected ? 'white' : 'gray', bold: isSelected }, label)
        })
      )
    );
  }

  if (mode === 'network') {
    children.push(
      h(Box, { key: 'network', flexDirection: 'column', paddingX: 2 },
        h(Text, { color: 'cyan', marginBottom: 1 }, 'Select Network:'),
        h(SelectInput, {
          items: networkItems,
          onSelect: (item) => handleNetworkSelect(item.value),
          indicatorComponent: ({ isSelected }) =>
            h(Text, { color: isSelected ? 'cyan' : 'gray' }, isSelected ? '> ' : '  '),
          itemComponent: ({ isSelected, label }) =>
            h(Text, { color: isSelected ? 'white' : 'gray', bold: isSelected }, label)
        })
      )
    );
  }

  if (connecting) {
    children.push(h(Box, { key: 'connecting', paddingX: 2, marginTop: 1 }, h(Text, { color: 'yellow' }, 'Connecting...')));
  }

  if (message) {
    children.push(
      h(Box, { key: 'message', paddingX: 2, marginTop: 1 },
        h(Text, { color: message.type === 'success' ? 'green' : 'red' }, message.text)
      )
    );
  }

  children.push(h(Box, { key: 'footer', marginTop: 1, paddingX: 2 }, h(Text, { color: 'gray' }, 'Press Escape to go back')));

  return h(Box, { flexDirection: 'column', padding: 1 }, ...children);
}
