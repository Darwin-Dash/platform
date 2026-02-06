/**
 * DPNS View Component
 *
 * Dash Platform Naming Service operations.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { sdkConnection, truncateId } from '../utils/sdk.js';

const h = React.createElement;

const menuItems = [
  { label: 'Resolve Name', value: 'resolve' },
  { label: 'Search Names', value: 'search' },
  { label: 'Back to Main Menu', value: 'back' },
];

export default function DpnsView({ onBack }) {
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

      if (mode === 'resolve') {
        const identity = await sdk.dpns.resolve(inputValue.trim());
        setResult({ type: 'resolve', name: inputValue.trim(), data: identity });
      } else if (mode === 'search') {
        const names = await sdk.dpns.search(inputValue.trim(), 10);
        setResult({ type: 'search', prefix: inputValue.trim(), data: names });
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

    if (mode === 'resolve') {
      prompt = 'Enter DPNS Name:';
      placeholder = 'e.g., alice.dash or alice';
    } else if (mode === 'search') {
      prompt = 'Enter Search Prefix:';
      placeholder = 'e.g., ali (will match alice, alix, etc.)';
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

    if (result.type === 'resolve') {
      if (!result.data) {
        return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
          h(Text, { color: 'yellow' }, `Name not found: ${result.name}`)
        );
      }
      return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
        h(Text, { color: 'green', bold: true }, 'Name Resolved'),
        h(Box, { marginTop: 1, flexDirection: 'column' },
          h(Text, null,
            h(Text, { color: 'gray' }, 'Name:      '),
            h(Text, { color: 'cyan' }, result.name)
          ),
          h(Text, null,
            h(Text, { color: 'gray' }, 'Identity:  '),
            h(Text, null, result.data.getId?.() || result.data.identityId || 'N/A')
          )
        )
      );
    }

    if (result.type === 'search') {
      const names = result.data || [];
      if (names.length === 0) {
        return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
          h(Text, { color: 'yellow' }, `No names found matching: ${result.prefix}`)
        );
      }
      return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
        h(Text, { color: 'green', bold: true }, `Found ${names.length} name(s)`),
        h(Box, { marginTop: 1, flexDirection: 'column' },
          ...names.slice(0, 10).map((name, i) =>
            h(Text, { key: i },
              h(Text, { color: 'gray' }, `${i + 1}. `),
              h(Text, { color: 'cyan' }, name.label || name.name || name),
              name.ownerId ? h(Text, { color: 'gray' }, ` (${truncateId(name.ownerId)})`) : null
            )
          ),
          names.length > 10 ? h(Text, { key: 'more', color: 'gray' }, `... and ${names.length - 10} more`) : null
        )
      );
    }

    return null;
  };

  const children = [
    h(Box, { key: 'header', marginBottom: 1, paddingX: 2 },
      h(Text, { bold: true, color: 'cyan' }, 'DPNS - Dash Platform Naming Service')
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
      children.push(h(Box, { key: 'loading', paddingX: 2, marginTop: 1 }, h(Text, { color: 'yellow' }, 'Loading...')));
    }
    if (error) {
      children.push(h(Box, { key: 'error', paddingX: 2, marginTop: 1 }, h(Text, { color: 'red' }, `Error: ${error}`)));
    }
    const resultElement = renderResult();
    if (resultElement) {
      children.push(h(React.Fragment, { key: 'result' }, resultElement));
    }
  }

  children.push(h(Box, { key: 'footer', marginTop: 1, paddingX: 2 }, h(Text, { color: 'gray' }, 'Press Escape to go back')));

  return h(Box, { flexDirection: 'column', padding: 1 }, ...children);
}
