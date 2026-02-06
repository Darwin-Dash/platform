/**
 * DashPay View Component
 *
 * DashPay profile and contact operations.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { sdkConnection, truncateId } from '../utils/sdk.js';

const h = React.createElement;

const menuItems = [
  { label: 'Get Profile by Identity', value: 'profile' },
  { label: 'Get Profile by DPNS Name', value: 'profileByName' },
  { label: 'Get Contacts', value: 'contacts' },
  { label: 'Back to Main Menu', value: 'back' },
];

export default function DashPayView({ onBack }) {
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

      if (mode === 'profile') {
        const profile = await sdk.dashpay.getProfile(inputValue.trim());
        setResult({ type: 'profile', identityId: inputValue.trim(), data: profile });
      } else if (mode === 'profileByName') {
        const profile = await sdk.dashpay.getProfileByName(inputValue.trim());
        setResult({ type: 'profileByName', name: inputValue.trim(), data: profile });
      } else if (mode === 'contacts') {
        const contacts = await sdk.dashpay.getContacts(inputValue.trim());
        setResult({ type: 'contacts', identityId: inputValue.trim(), data: contacts });
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

    if (mode === 'profile') {
      prompt = 'Enter Identity ID:';
      placeholder = 'e.g., 4EfA9Jrvv3nnCFdSf7fad59851iqjHvRMrBYMgYvj9nPi';
    } else if (mode === 'profileByName') {
      prompt = 'Enter DPNS Name:';
      placeholder = 'e.g., alice.dash or alice';
    } else if (mode === 'contacts') {
      prompt = 'Enter Identity ID:';
      placeholder = 'e.g., 4EfA9Jrvv3nnCFdSf7fad59851iqjHvRMrBYMgYvj9nPi';
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

  const renderProfile = (profile, label = 'Profile') => {
    if (!profile) {
      return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
        h(Text, { color: 'yellow' }, `${label} not found`)
      );
    }

    const displayName = profile.displayName || profile.data?.displayName || 'N/A';
    const avatarUrl = profile.avatarUrl || profile.data?.avatarUrl;
    const publicMessage = profile.publicMessage || profile.data?.publicMessage;
    const ownerId = profile.ownerId || profile.getOwnerId?.() || 'N/A';

    return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
      h(Text, { color: 'green', bold: true }, `${label} Found`),
      h(Box, { marginTop: 1, flexDirection: 'column' },
        h(Text, null,
          h(Text, { color: 'gray' }, 'Display Name: '),
          h(Text, { color: 'cyan' }, displayName)
        ),
        h(Text, null,
          h(Text, { color: 'gray' }, 'Owner:        '),
          h(Text, null, truncateId(ownerId))
        ),
        avatarUrl ? h(Text, null,
          h(Text, { color: 'gray' }, 'Avatar URL:   '),
          h(Text, null, avatarUrl.slice(0, 40) + '...')
        ) : null,
        publicMessage ? h(Text, null,
          h(Text, { color: 'gray' }, 'Message:      '),
          h(Text, null, publicMessage.slice(0, 40) + '...')
        ) : null
      )
    );
  };

  const renderResult = () => {
    if (!result) return null;

    if (result.type === 'profile') {
      return renderProfile(result.data, 'Profile');
    }

    if (result.type === 'profileByName') {
      return h(Box, { flexDirection: 'column' },
        h(Box, { paddingX: 2, marginTop: 1 },
          h(Text, { color: 'gray' }, `Name: ${result.name}`)
        ),
        renderProfile(result.data, 'Profile')
      );
    }

    if (result.type === 'contacts') {
      const contacts = result.data || [];
      if (contacts.length === 0) {
        return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
          h(Text, { color: 'yellow' }, 'No contacts found')
        );
      }

      return h(Box, { flexDirection: 'column', paddingX: 2, marginTop: 1 },
        h(Text, { color: 'green', bold: true }, `Found ${contacts.length} contact(s)`),
        h(Box, { marginTop: 1, flexDirection: 'column' },
          ...contacts.slice(0, 10).map((contact, i) => {
            const toUserId = contact.toUserId || contact.data?.toUserId || 'N/A';
            const alias = contact.alias || contact.data?.alias;
            return h(Box, { key: i, marginBottom: 1, flexDirection: 'column' },
              h(Text, { color: 'cyan' }, `Contact ${i + 1}:`),
              h(Text, { color: 'gray' }, `  To: ${truncateId(toUserId)}`),
              alias ? h(Text, { color: 'gray' }, `  Alias: ${alias}`) : null
            );
          }),
          contacts.length > 10 ? h(Text, { key: 'more', color: 'gray' }, `... and ${contacts.length - 10} more`) : null
        )
      );
    }

    return null;
  };

  const children = [
    h(Box, { key: 'header', marginBottom: 1, paddingX: 2 },
      h(Text, { bold: true, color: 'cyan' }, 'DashPay - Profiles and Contacts')
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
