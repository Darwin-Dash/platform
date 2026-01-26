/**
 * Documents View Component
 *
 * Query and display platform documents.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { sdkConnection, truncateId } from '../utils/sdk.js';

const h = React.createElement;

const menuItems = [
  { label: 'Query Documents', value: 'query' },
  { label: 'Get Document by ID', value: 'get' },
  { label: 'Back to Main Menu', value: 'back' },
];

const KNOWN_CONTRACTS = {
  dpns: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
  dashpay: 'Bw5B3HzGM9p5BNX6nJDuLHV3Cn7TqVFFLEJxfQqPg6Gv',
};

export default function DocumentsView({ onBack }) {
  const [mode, setMode] = useState('menu');
  const [step, setStep] = useState(0);
  const [contractId, setContractId] = useState('');
  const [docType, setDocType] = useState('');
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
        setContractId('');
        setDocType('');
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
    setContractId('');
    setDocType('');
    setStep(0);
    setResult(null);
    setError(null);
  };

  const handleContractSubmit = () => {
    if (!contractId.trim()) return;
    setStep(1);
  };

  const handleTypeSubmit = async () => {
    if (!docType.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const sdk = await sdkConnection.getSDK();
      const contract = contractId.trim();
      const type = docType.trim();

      if (mode === 'query') {
        const docs = await sdk.documents.query(contract, type, {}, 10);
        setResult({ type: 'query', contractId: contract, docType: type, data: docs });
      } else if (mode === 'get') {
        const doc = await sdk.documents.get(contract, type, docType.trim());
        setResult({ type: 'get', contractId: contract, data: doc });
      }
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderInput = () => {
    if (step === 0) {
      return h(Box, { flexDirection: 'column', paddingX: 2 },
        h(Text, { color: 'cyan' }, 'Enter Data Contract ID:'),
        h(Box, { marginTop: 1 },
          h(Text, { color: 'gray' }, '> '),
          h(TextInput, {
            value: contractId,
            onChange: setContractId,
            onSubmit: handleContractSubmit,
            placeholder: 'e.g., GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
          })
        ),
        h(Box, { marginTop: 1, flexDirection: 'column' },
          h(Text, { color: 'gray' }, 'Known contracts:'),
          h(Text, { color: 'gray' }, `  DPNS:    ${KNOWN_CONTRACTS.dpns}`),
          h(Text, { color: 'gray' }, `  DashPay: ${KNOWN_CONTRACTS.dashpay}`)
        )
      );
    }

    if (step === 1) {
      const prompt = mode === 'get' ? 'Enter Document ID:' : 'Enter Document Type:';
      const placeholder = mode === 'get' ? 'e.g., document ID' : 'e.g., domain, preorder, profile';

      return h(Box, { flexDirection: 'column', paddingX: 2 },
        h(Text, { color: 'gray' }, `Contract: ${truncateId(contractId, 32)}`),
        h(Box, { marginTop: 1 },
          h(Text, { color: 'cyan' }, prompt)
        ),
        h(Box, { marginTop: 1 },
          h(Text, { color: 'gray' }, '> '),
          h(TextInput, {
            value: docType,
            onChange: setDocType,
            onSubmit: handleTypeSubmit,
            placeholder: placeholder
          })
        )
      );
    }

    return null;
  };

  const renderResult = () => {
    if (!result) return null;

    if (result.type === 'query') {
      const docs = result.data || [];
      if (docs.length === 0) {
        return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
          h(Text, { color: 'yellow' }, 'No documents found')
        );
      }
      return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
        h(Text, { color: 'green', bold: true }, `Found ${docs.length} document(s)`),
        h(Box, { marginTop: 1, flexDirection: 'column' },
          ...docs.slice(0, 5).map((doc, i) =>
            h(Box, { key: i, flexDirection: 'column', marginBottom: 1 },
              h(Text, { color: 'cyan' }, `Document ${i + 1}:`),
              h(Text, { color: 'gray' }, `  ID: ${truncateId(doc.getId?.() || doc.id || 'N/A', 32)}`),
              h(Text, { color: 'gray' }, `  Owner: ${truncateId(doc.getOwnerId?.() || doc.ownerId || 'N/A', 32)}`)
            )
          ),
          docs.length > 5 ? h(Text, { key: 'more', color: 'gray' }, `... and ${docs.length - 5} more`) : null
        )
      );
    }

    if (result.type === 'get') {
      if (!result.data) {
        return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
          h(Text, { color: 'yellow' }, 'Document not found')
        );
      }
      const doc = result.data;
      return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
        h(Text, { color: 'green', bold: true }, 'Document Found'),
        h(Box, { marginTop: 1, flexDirection: 'column' },
          h(Text, null,
            h(Text, { color: 'gray' }, 'ID:       '),
            h(Text, null, doc.getId?.() || doc.id || 'N/A')
          ),
          h(Text, null,
            h(Text, { color: 'gray' }, 'Owner:    '),
            h(Text, null, doc.getOwnerId?.() || doc.ownerId || 'N/A')
          ),
          h(Text, null,
            h(Text, { color: 'gray' }, 'Revision: '),
            h(Text, null, String(doc.getRevision?.() || doc.revision || 'N/A'))
          )
        )
      );
    }

    return null;
  };

  const children = [
    h(Box, { key: 'header', marginBottom: 1, paddingX: 2 },
      h(Text, { bold: true, color: 'cyan' }, 'Document Operations')
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
