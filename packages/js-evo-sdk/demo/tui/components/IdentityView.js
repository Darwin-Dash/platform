/**
 * Identity View Component
 *
 * Displays identity management options and information.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { sdkConnection, formatCredits, truncateId } from '../utils/sdk.js';

const h = React.createElement;

const menuItems = [
  { label: 'Get Identity by ID', value: 'get' },
  { label: 'Get Identity Balance', value: 'balance' },
  { label: 'Lookup by DPNS Name', value: 'lookup' },
  { label: 'Back to Main Menu', value: 'back' },
];

export default function IdentityView({ onBack }) {
  const [mode, setMode] = useState('menu');
  const [inputValue, setInputValue] = useState('');
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
        setInputValue('');
      }
    }
  });

  const handleSelect = (value) => {
    if (value === 'back') {
      onBack();
      return;
    }
    setMode(value);
    setInputValue('');
    setResult(null);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!inputValue.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const sdk = await sdkConnection.getSDK();

      if (mode === 'get') {
        const identity = await sdk.identities.get(inputValue.trim());
        setResult({ type: 'identity', data: identity });
      } else if (mode === 'balance') {
        const balance = await sdk.identities.getBalance(inputValue.trim());
        setResult({ type: 'balance', identityId: inputValue.trim(), data: balance });
      } else if (mode === 'lookup') {
        const identity = await sdk.dpns.resolve(inputValue.trim());
        setResult({ type: 'dpns', name: inputValue.trim(), data: identity });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderInput = () => {
    let prompt = '';
    let placeholder = '';

    if (mode === 'get') {
      prompt = 'Enter Identity ID:';
      placeholder = 'e.g., 4EfA9Jrvv3nnCFdSf7fad59851iqjHvRMrBYMgYvj9nPi';
    } else if (mode === 'balance') {
      prompt = 'Enter Identity ID:';
      placeholder = 'e.g., 4EfA9Jrvv3nnCFdSf7fad59851iqjHvRMrBYMgYvj9nPi';
    } else if (mode === 'lookup') {
      prompt = 'Enter DPNS Name:';
      placeholder = 'e.g., alice.dash or alice';
    }

    return h(Box, { flexDirection: 'column', paddingX: 2 },
      h(Text, { color: 'cyan' }, prompt),
      h(Box, { marginTop: 1 },
        h(Text, { color: 'gray' }, '> '),
        h(TextInput, {
          value: inputValue,
          onChange: setInputValue,
          onSubmit: handleSubmit,
          placeholder: placeholder
        })
      ),
      h(Box, { marginTop: 1 },
        h(Text, { color: 'gray' }, 'Press Enter to search, Escape to go back')
      )
    );
  };

  const renderResult = () => {
    if (!result) return null;

    if (result.type === 'identity') {
      const id = result.data;
      return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
        h(Text, { color: 'green', bold: true }, 'Identity Found'),
        h(Box, { marginTop: 1, flexDirection: 'column' },
          h(Text, null,
            h(Text, { color: 'gray' }, 'ID:        '),
            h(Text, null, id.getId?.() || 'N/A')
          ),
          h(Text, null,
            h(Text, { color: 'gray' }, 'Balance:   '),
            h(Text, { color: 'yellow' }, formatCredits(id.getBalance?.() || 0))
          ),
          h(Text, null,
            h(Text, { color: 'gray' }, 'Revision:  '),
            h(Text, null, String(id.getRevision?.() || 'N/A'))
          ),
          h(Text, null,
            h(Text, { color: 'gray' }, 'Keys:      '),
            h(Text, null, `${id.getPublicKeys?.()?.length || 0} public keys`)
          )
        )
      );
    }

    if (result.type === 'balance') {
      return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
        h(Text, { color: 'green', bold: true }, 'Balance Retrieved'),
        h(Box, { marginTop: 1, flexDirection: 'column' },
          h(Text, null,
            h(Text, { color: 'gray' }, 'Identity:  '),
            h(Text, null, truncateId(result.identityId))
          ),
          h(Text, null,
            h(Text, { color: 'gray' }, 'Balance:   '),
            h(Text, { color: 'yellow' }, formatCredits(result.data))
          )
        )
      );
    }

    if (result.type === 'dpns') {
      if (!result.data) {
        return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
          h(Text, { color: 'yellow' }, `Name not found: ${result.name}`)
        );
      }
      return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
        h(Text, { color: 'green', bold: true }, 'DPNS Name Found'),
        h(Box, { marginTop: 1, flexDirection: 'column' },
          h(Text, null,
            h(Text, { color: 'gray' }, 'Name:      '),
            h(Text, null, result.name)
          ),
          h(Text, null,
            h(Text, { color: 'gray' }, 'Identity:  '),
            h(Text, null, result.data.getId?.() || 'N/A')
          )
        )
      );
    }

    return null;
  };

  const children = [
    // Header
    h(Box, { key: 'header', marginBottom: 1, paddingX: 2 },
      h(Text, { bold: true, color: 'cyan' }, 'Identity Management')
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
    children.push(h(React.Fragment, { key: 'input' }, renderInput()));
    if (loading) {
      children.push(
        h(Box, { key: 'loading', paddingX: 2, marginTop: 1 },
          h(Text, { color: 'yellow' }, 'Loading...')
        )
      );
    }
    if (error) {
      children.push(
        h(Box, { key: 'error', paddingX: 2, marginTop: 1 },
          h(Text, { color: 'red' }, `Error: ${error}`)
        )
      );
    }
    const resultElement = renderResult();
    if (resultElement) {
      children.push(h(React.Fragment, { key: 'result' }, resultElement));
    }
  }

  children.push(
    h(Box, { key: 'footer', marginTop: 1, paddingX: 2 },
      h(Text, { color: 'gray' }, 'Press Escape to go back')
    )
  );

  return h(Box, { flexDirection: 'column', padding: 1 }, ...children);
}
