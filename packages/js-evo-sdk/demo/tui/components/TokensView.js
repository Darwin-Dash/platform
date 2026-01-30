/**
 * Tokens View Component
 *
 * Token balance, supply, status, and info operations.
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
  { label: 'Get Token Status', value: 'status' },
  { label: 'Get Contract Info', value: 'contract-info' },
  { label: 'Get Purchase Prices', value: 'prices' },
  { label: 'Calculate Token ID', value: 'calculate-id' },
  { label: 'Back to Main Menu', value: 'back' },
];

export default function TokensView({ onBack }) {
  const [mode, setMode] = useState('menu');
  const [step, setStep] = useState(0);
  const [identityId, setIdentityId] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [contractId, setContractId] = useState('');
  const [tokenPosition, setTokenPosition] = useState('0');
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
        resetState();
      }
    }
  });

  const resetState = () => {
    setMode('menu');
    setResult(null);
    setError(null);
    setIdentityId('');
    setTokenId('');
    setContractId('');
    setTokenPosition('0');
    setStep(0);
  };

  const handleSelect = (value) => {
    if (value === 'back') {
      onBack();
      return;
    }
    setMode(value);
    setIdentityId('');
    setTokenId('');
    setContractId('');
    setTokenPosition('0');
    setStep(0);
    setResult(null);
    setError(null);
  };

  const handleIdentitySubmit = () => {
    if (!identityId.trim()) return;
    setStep(1);
  };

  const handleContractSubmit = () => {
    if (!contractId.trim()) return;
    if (mode === 'calculate-id') {
      setStep(1);
    } else {
      executeQuery();
    }
  };

  const handlePositionSubmit = () => {
    executeQuery();
  };

  const handleTokenSubmit = async () => {
    executeQuery();
  };

  const executeQuery = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const sdk = await sdkConnection.getSDK();

      if (mode === 'balances') {
        if (!tokenId.trim()) {
          setError('Token ID is required for balance query');
          setLoading(false);
          return;
        }
        // balances(identityIds: array, tokenId: string) returns Map<Identifier, bigint>
        const balances = await sdk.tokens.balances([identityId.trim()], tokenId.trim());
        // Convert Map to array for display
        const balanceArray = [];
        if (balances instanceof Map) {
          for (const [id, balance] of balances) {
            balanceArray.push({ tokenId: tokenId.trim(), balance: balance.toString() });
          }
        }
        setResult({ type: 'balances', identityId: identityId.trim(), tokenId: tokenId.trim(), data: balanceArray });

      } else if (mode === 'supply') {
        if (!tokenId.trim()) {
          setError('Token ID is required');
          setLoading(false);
          return;
        }
        // totalSupply(tokenId) returns TokenTotalSupply | undefined
        const supply = await sdk.tokens.totalSupply(tokenId.trim());
        setResult({ type: 'supply', tokenId: tokenId.trim(), data: supply?.amount || 0n });

      } else if (mode === 'status') {
        if (!tokenId.trim()) {
          setError('Token ID is required');
          setLoading(false);
          return;
        }
        // statuses(tokenIds) returns Map<Identifier, TokenStatus>
        const statuses = await sdk.tokens.statuses([tokenId.trim()]);
        const statusObj = {};
        if (statuses instanceof Map) {
          for (const [id, status] of statuses) {
            statusObj[id.toString ? id.toString() : id] = status;
          }
        }
        setResult({ type: 'status', tokenId: tokenId.trim(), data: statusObj });

      } else if (mode === 'contract-info') {
        if (!contractId.trim()) {
          setError('Contract ID is required');
          setLoading(false);
          return;
        }
        // contractInfo(contractId) returns TokenContractInfo | undefined
        const info = await sdk.tokens.contractInfo(contractId.trim());
        setResult({ type: 'contract-info', contractId: contractId.trim(), data: info });

      } else if (mode === 'prices') {
        if (!tokenId.trim()) {
          setError('Token ID is required');
          setLoading(false);
          return;
        }
        // directPurchasePrices(tokenIds) returns Map<Identifier, TokenPriceInfo>
        const prices = await sdk.tokens.directPurchasePrices([tokenId.trim()]);
        const pricesObj = {};
        if (prices instanceof Map) {
          for (const [id, price] of prices) {
            pricesObj[id.toString ? id.toString() : id] = price;
          }
        }
        setResult({ type: 'prices', tokenId: tokenId.trim(), data: pricesObj });

      } else if (mode === 'calculate-id') {
        if (!contractId.trim()) {
          setError('Contract ID is required');
          setLoading(false);
          return;
        }
        const pos = parseInt(tokenPosition, 10) || 0;
        // calculateId(contractId, tokenPosition) returns string
        const calculatedId = await sdk.tokens.calculateId(contractId.trim(), pos);
        setResult({ type: 'calculate-id', contractId: contractId.trim(), tokenPosition: pos, data: calculatedId });
      }

      setStep(99); // Results step
    } catch (err) {
      setError(err.message || 'Unknown error');
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
            h(Text, { color: 'cyan' }, 'Enter Token ID:')
          ),
          h(Box, { marginTop: 1 },
            h(Text, { color: 'gray' }, '> '),
            h(TextInput, {
              value: tokenId,
              onChange: setTokenId,
              onSubmit: handleTokenSubmit,
              placeholder: 'Enter token ID'
            })
          )
        );
      }
    }

    if (mode === 'supply' || mode === 'status' || mode === 'prices') {
      return h(Box, { flexDirection: 'column', paddingX: 2 },
        h(Text, { color: 'cyan' }, 'Enter Token ID:'),
        h(Box, { marginTop: 1 },
          h(Text, { color: 'gray' }, '> '),
          h(TextInput, {
            value: tokenId,
            onChange: setTokenId,
            onSubmit: handleTokenSubmit,
            placeholder: 'e.g., Hqyu8WcRwXCTwbNxdga4CN5gsVEGc67wng4TFzceyLUv'
          })
        )
      );
    }

    if (mode === 'contract-info') {
      return h(Box, { flexDirection: 'column', paddingX: 2 },
        h(Text, { color: 'cyan' }, 'Enter Contract ID:'),
        h(Box, { marginTop: 1 },
          h(Text, { color: 'gray' }, '> '),
          h(TextInput, {
            value: contractId,
            onChange: setContractId,
            onSubmit: handleContractSubmit,
            placeholder: 'e.g., ALybvzfcCwMs7sinDwmtumw17NneuW7RgFtFHgjKmF3A'
          })
        )
      );
    }

    if (mode === 'calculate-id') {
      if (step === 0) {
        return h(Box, { flexDirection: 'column', paddingX: 2 },
          h(Text, { color: 'cyan' }, 'Enter Contract ID:'),
          h(Box, { marginTop: 1 },
            h(Text, { color: 'gray' }, '> '),
            h(TextInput, {
              value: contractId,
              onChange: setContractId,
              onSubmit: handleContractSubmit,
              placeholder: 'e.g., ALybvzfcCwMs7sinDwmtumw17NneuW7RgFtFHgjKmF3A'
            })
          )
        );
      }

      if (step === 1) {
        return h(Box, { flexDirection: 'column', paddingX: 2 },
          h(Text, { color: 'gray' }, `Contract: ${truncateId(contractId, 32)}`),
          h(Box, { marginTop: 1 },
            h(Text, { color: 'cyan' }, 'Enter Token Position (default: 0):')
          ),
          h(Box, { marginTop: 1 },
            h(Text, { color: 'gray' }, '> '),
            h(TextInput, {
              value: tokenPosition,
              onChange: setTokenPosition,
              onSubmit: handlePositionSubmit,
              placeholder: '0'
            })
          )
        );
      }
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

    if (result.type === 'status') {
      const statuses = result.data || {};
      const statusKeys = Object.keys(statuses);

      if (statusKeys.length === 0) {
        return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
          h(Text, { color: 'yellow' }, 'No token status found')
        );
      }

      return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
        h(Text, { color: 'green', bold: true }, 'Token Status'),
        h(Box, { marginTop: 1, flexDirection: 'column' },
          h(Text, null,
            h(Text, { color: 'gray' }, 'Token:  '),
            h(Text, null, truncateId(result.tokenId, 32))
          ),
          h(Text, null,
            h(Text, { color: 'gray' }, 'Status: '),
            h(Text, { color: 'cyan' }, String(statuses[statusKeys[0]] || 'Unknown'))
          )
        )
      );
    }

    if (result.type === 'contract-info') {
      const info = result.data;

      if (!info) {
        return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
          h(Text, { color: 'yellow' }, 'Token contract not found')
        );
      }

      return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
        h(Text, { color: 'green', bold: true }, 'Token Contract Info'),
        h(Box, { marginTop: 1, flexDirection: 'column' },
          h(Text, null,
            h(Text, { color: 'gray' }, 'Contract: '),
            h(Text, null, truncateId(result.contractId, 32))
          ),
          info.ownerId && h(Text, null,
            h(Text, { color: 'gray' }, 'Owner:    '),
            h(Text, null, truncateId(info.ownerId, 32))
          ),
          info.tokenCount && h(Text, null,
            h(Text, { color: 'gray' }, 'Tokens:   '),
            h(Text, { color: 'cyan' }, String(info.tokenCount))
          )
        )
      );
    }

    if (result.type === 'prices') {
      const prices = result.data || {};
      const priceKeys = Object.keys(prices);

      if (priceKeys.length === 0) {
        return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
          h(Text, { color: 'yellow' }, 'No price information found')
        );
      }

      return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
        h(Text, { color: 'green', bold: true }, 'Direct Purchase Price'),
        h(Box, { marginTop: 1, flexDirection: 'column' },
          h(Text, null,
            h(Text, { color: 'gray' }, 'Token: '),
            h(Text, null, truncateId(result.tokenId, 32))
          ),
          h(Text, null,
            h(Text, { color: 'gray' }, 'Price: '),
            h(Text, { color: 'yellow' }, String(prices[priceKeys[0]]?.price || 'N/A'))
          )
        )
      );
    }

    if (result.type === 'calculate-id') {
      return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
        h(Text, { color: 'green', bold: true }, 'Calculated Token ID'),
        h(Box, { marginTop: 1, flexDirection: 'column' },
          h(Text, null,
            h(Text, { color: 'gray' }, 'Contract: '),
            h(Text, null, truncateId(result.contractId, 32))
          ),
          h(Text, null,
            h(Text, { color: 'gray' }, 'Position: '),
            h(Text, { color: 'cyan' }, String(result.tokenPosition))
          ),
          h(Text, null,
            h(Text, { color: 'gray' }, 'Token ID: '),
            h(Text, { color: 'yellow' }, result.data || 'Unknown')
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
    if (step < 99) {
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
