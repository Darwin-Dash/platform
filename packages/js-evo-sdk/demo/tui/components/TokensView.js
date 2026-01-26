/**
 * Tokens View Component
 *
 * Token balance and supply operations.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { sdkConnection, truncateId } from '../utils/sdk.js';

const h = React.createElement;

const menuItems = [
  { label: 'Get Token Balances', value: 'balances' },
  { label: 'Get Token Supply', value: 'supply' },
  { label: 'Back to Main Menu', value: 'back' },
];

export default function TokensView({ onBack }) {
  const [mode, setMode] = useState('menu');
  const [step, setStep] = useState(0);
  const [identityId, setIdentityId] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useInput((input, key) => {
    if (key.escape) {
      if (mode === 'menu') {
        onBack();
      } else if (step > 0) {
        setStep(step - 1);
      } else {
        setMode('menu');
        setResult(null);
        setError(null);
        setIdentityId('');
        setTokenId('');
        setStep(0);
      }
    }
  });

  const handleSelect = (value) => {
    if (value === 'back') {
      onBack();
      return;
    }
    setMode(value);
    setIdentityId('');
    setTokenId('');
    setStep(0);
    setResult(null);
    setError(null);
  };

  const handleIdentitySubmit = () => {
    if (!identityId.trim()) return;
    setStep(1);
  };

  const handleTokenSubmit = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const sdk = await sdkConnection.getSDK();

      if (mode === 'balances') {
        const balances = await sdk.tokens.getBalances(identityId.trim(), tokenId.trim() || null);
        setResult({ type: 'balances', identityId: identityId.trim(), tokenId: tokenId.trim(), data: balances });
      } else if (mode === 'supply') {
        if (!tokenId.trim()) {
          setError('Token ID is required');
          setLoading(false);
          return;
        }
        const supply = await sdk.tokens.getSupply(tokenId.trim());
        setResult({ type: 'supply', tokenId: tokenId.trim(), data: supply });
      }
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderInput = () => {
    if (mode === 'balances') {
      if (step === 0) {
        return h(Box, { flexDirection: 'column', paddingX: 2 },
          h(Text, { color: 'cyan' }, 'Enter Identity ID:'),
          h(Box, { marginTop: 1 },
            h(Text, { color: 'gray' }, '> '),
            h(TextInput, {
              value: identityId,
              onChange: setIdentityId,
              onSubmit: handleIdentitySubmit,
              placeholder: 'e.g., 4EfA9Jrvv3nnCFdSf7fad59851iqjHvRMrBYMgYvj9nPi'
            })
          )
        );
      }

      if (step === 1) {
        return h(Box, { flexDirection: 'column', paddingX: 2 },
          h(Text, { color: 'gray' }, `Identity: ${truncateId(identityId, 32)}`),
          h(Box, { marginTop: 1 },
            h(Text, { color: 'cyan' }, 'Enter Token ID (optional, leave empty for all):')
          ),
          h(Box, { marginTop: 1 },
            h(Text, { color: 'gray' }, '> '),
            h(TextInput, {
              value: tokenId,
              onChange: setTokenId,
              onSubmit: handleTokenSubmit,
              placeholder: 'Press Enter without input for all tokens'
            })
          )
        );
      }
    }

    if (mode === 'supply') {
      return h(Box, { flexDirection: 'column', paddingX: 2 },
        h(Text, { color: 'cyan' }, 'Enter Token ID:'),
        h(Box, { marginTop: 1 },
          h(Text, { color: 'gray' }, '> '),
          h(TextInput, {
            value: tokenId,
            onChange: setTokenId,
            onSubmit: handleTokenSubmit,
            placeholder: 'e.g., token contract ID'
          })
        )
      );
    }

    return null;
  };

  const renderResult = () => {
    if (!result) return null;

    if (result.type === 'balances') {
      const balances = result.data;
      if (!balances || (Array.isArray(balances) && balances.length === 0)) {
        return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
          h(Text, { color: 'yellow' }, 'No token balances found')
        );
      }

      const balanceList = Array.isArray(balances) ? balances : [balances];
      return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
        h(Text, { color: 'green', bold: true }, 'Token Balances'),
        h(Box, { marginTop: 1, flexDirection: 'column' },
          h(Text, { color: 'gray' }, `Identity: ${truncateId(result.identityId)}`),
          ...balanceList.map((bal, i) =>
            h(Box, { key: i, marginTop: 1, flexDirection: 'column' },
              h(Text, null,
                h(Text, { color: 'cyan' }, 'Token: '),
                h(Text, null, truncateId(bal.tokenId || bal.id || `Token ${i + 1}`, 32))
              ),
              h(Text, null,
                h(Text, { color: 'gray' }, 'Balance: '),
                h(Text, { color: 'yellow' }, String((bal.balance || bal.amount || 0).toLocaleString()))
              )
            )
          )
        )
      );
    }

    if (result.type === 'supply') {
      return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
        h(Text, { color: 'green', bold: true }, 'Token Supply'),
        h(Box, { marginTop: 1, flexDirection: 'column' },
          h(Text, null,
            h(Text, { color: 'gray' }, 'Token:  '),
            h(Text, null, truncateId(result.tokenId, 32))
          ),
          h(Text, null,
            h(Text, { color: 'gray' }, 'Supply: '),
            h(Text, { color: 'yellow' }, String((result.data || 0).toLocaleString()))
          )
        )
      );
    }

    return null;
  };

  const children = [
    h(Box, { key: 'header', marginBottom: 1, paddingX: 2 },
      h(Text, { bold: true, color: 'cyan' }, 'Token Operations')
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
    if (step < 2) {
      const inputElement = renderInput();
      if (inputElement) {
        children.push(h(React.Fragment, { key: 'input' }, inputElement));
      }
    }
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
