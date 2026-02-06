/**
 * System View Component
 *
 * Platform status and system information.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { sdkConnection, formatDate } from '../utils/sdk.js';

const h = React.createElement;

const menuItems = [
  { label: 'Platform Status', value: 'status' },
  { label: 'Current Epoch', value: 'epoch' },
  { label: 'Protocol Version', value: 'version' },
  { label: 'Refresh All', value: 'refresh' },
  { label: 'Back to Main Menu', value: 'back' },
];

export default function SystemView({ onBack }) {
  const [mode, setMode] = useState('menu');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useInput((input, key) => {
    if (key.escape) {
      if (mode === 'menu') {
        onBack();
      } else {
        setMode('menu');
        setResult(null);
        setError(null);
      }
    }
  });

  const fetchData = async (type) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const sdk = await sdkConnection.getSDK();

      if (type === 'status' || type === 'refresh') {
        const status = await sdk.system.getStatus();
        setResult({ type: 'status', data: status });
      } else if (type === 'epoch') {
        const epoch = await sdk.epoch.getCurrent();
        setResult({ type: 'epoch', data: epoch });
      } else if (type === 'version') {
        const version = sdk.version();
        setResult({ type: 'version', data: version });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (value) => {
    if (value === 'back') {
      onBack();
      return;
    }
    setMode(value);
    await fetchData(value);
  };

  const renderResult = () => {
    if (!result) return null;

    if (result.type === 'status') {
      const status = result.data;
      return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
        h(Text, { color: 'green', bold: true }, 'Platform Status'),
        h(Box, { marginTop: 1, flexDirection: 'column' },
          h(Text, null,
            h(Text, { color: 'gray' }, 'Chain:         '),
            h(Text, { color: 'cyan' }, status?.chain || 'N/A')
          ),
          h(Text, null,
            h(Text, { color: 'gray' }, 'Network:       '),
            h(Text, null, status?.network || sdkConnection.network)
          ),
          h(Text, null,
            h(Text, { color: 'gray' }, 'Block Height:  '),
            h(Text, { color: 'yellow' }, String(status?.blocks?.toLocaleString() || 'N/A'))
          ),
          h(Text, null,
            h(Text, { color: 'gray' }, 'Headers:       '),
            h(Text, null, String(status?.headers?.toLocaleString() || 'N/A'))
          ),
          h(Text, null,
            h(Text, { color: 'gray' }, 'Difficulty:    '),
            h(Text, null, String(status?.difficulty?.toFixed(2) || 'N/A'))
          ),
          h(Text, null,
            h(Text, { color: 'gray' }, 'Connections:   '),
            h(Text, null, String(status?.connections || 'N/A'))
          ),
          h(Text, null,
            h(Text, { color: 'gray' }, 'Sync Progress: '),
            h(Text, { color: status?.verificationProgress >= 0.99 ? 'green' : 'yellow' },
              status?.verificationProgress
                ? `${(status.verificationProgress * 100).toFixed(2)}%`
                : 'N/A'
            )
          )
        )
      );
    }

    if (result.type === 'epoch') {
      const epoch = result.data;
      return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
        h(Text, { color: 'green', bold: true }, 'Current Epoch'),
        h(Box, { marginTop: 1, flexDirection: 'column' },
          h(Text, null,
            h(Text, { color: 'gray' }, 'Epoch Index:  '),
            h(Text, { color: 'cyan' }, String(epoch?.index ?? epoch?.epochIndex ?? 'N/A'))
          ),
          h(Text, null,
            h(Text, { color: 'gray' }, 'Start Time:   '),
            h(Text, null, epoch?.startTime ? formatDate(epoch.startTime) : 'N/A')
          ),
          h(Text, null,
            h(Text, { color: 'gray' }, 'Start Height: '),
            h(Text, null, String(epoch?.startBlockHeight?.toLocaleString() || 'N/A'))
          ),
          h(Text, null,
            h(Text, { color: 'gray' }, 'Fee Multiplier:'),
            h(Text, { color: 'yellow' }, String(epoch?.feeMultiplier || 'N/A'))
          )
        )
      );
    }

    if (result.type === 'version') {
      return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
        h(Text, { color: 'green', bold: true }, 'Protocol Version'),
        h(Box, { marginTop: 1, flexDirection: 'column' },
          h(Text, null,
            h(Text, { color: 'gray' }, 'Version: '),
            h(Text, { color: 'cyan' }, String(result.data))
          )
        )
      );
    }

    return null;
  };

  const children = [
    h(Box, { key: 'header', marginBottom: 1, paddingX: 2 },
      h(Text, { bold: true, color: 'cyan' }, 'System Information')
    ),
    h(Box, { key: 'divider', marginBottom: 1, paddingX: 2 },
      h(Text, { color: 'gray' }, '─'.repeat(50))
    )
  ];

  if (mode === 'menu') {
    children.push(
      h(Box, { key: 'menu', paddingX: 2 },
        h(SelectInput, {
          items: menuItems,
          onSelect: (item) => handleSelect(item.value),
          indicatorComponent: ({ isSelected }) =>
            h(Text, { color: isSelected ? 'cyan' : 'gray' }, isSelected ? '> ' : '  '),
          itemComponent: ({ isSelected, label }) =>
            h(Text, { color: isSelected ? 'white' : 'gray', bold: isSelected }, label)
        })
      )
    );
  } else {
    if (loading) {
      children.push(h(Box, { key: 'loading', paddingX: 2 }, h(Text, { color: 'yellow' }, 'Loading...')));
    }
    if (error) {
      children.push(h(Box, { key: 'error', paddingX: 2 }, h(Text, { color: 'red' }, `Error: ${error}`)));
    }
    const resultElement = renderResult();
    if (resultElement) {
      children.push(h(React.Fragment, { key: 'result' }, resultElement));
    }
  }

  children.push(h(Box, { key: 'footer', marginTop: 1, paddingX: 2 }, h(Text, { color: 'gray' }, 'Press Escape to go back')));

  return h(Box, { flexDirection: 'column', padding: 1 }, ...children);
}
