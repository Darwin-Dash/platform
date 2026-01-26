/**
 * Main Menu Component
 *
 * Primary navigation for the TUI application.
 */

import React from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';

const h = React.createElement;

const menuItems = [
  { label: 'Identity   - Manage identities and keys', value: 'identity' },
  { label: 'DPNS       - Dash Platform Naming Service', value: 'dpns' },
  { label: 'Documents  - Query and manage documents', value: 'documents' },
  { label: 'Tokens     - Token operations', value: 'tokens' },
  { label: 'DashPay    - Profiles and contacts', value: 'dashpay' },
  { label: 'System     - Platform status and info', value: 'system' },
  { label: 'Settings   - Configure connection', value: 'settings' },
  { label: 'Exit       - Quit application', value: 'exit' },
];

const banner = `
  ____            _       ____  _       _    __
 |  _ \\  __ _ ___| |__   |  _ \\| | __ _| |_ / _| ___  _ __ _ __ ___
 | | | |/ _\` / __| '_ \\  | |_) | |/ _\` | __| |_ / _ \\| '__| '_ \` _ \\
 | |_| | (_| \\__ \\ | | | |  __/| | (_| | |_|  _| (_) | |  | | | | | |
 |____/ \\__,_|___/_| |_| |_|   |_|\\__,_|\\__|_|  \\___/|_|  |_| |_| |_|
`;

export default function MainMenu({ onSelect, connectionStatus }) {
  const statusColor = connectionStatus?.connected
    ? 'green'
    : connectionStatus?.connecting
      ? 'yellow'
      : 'red';

  const statusText = connectionStatus?.connected
    ? `Connected (${connectionStatus.network})`
    : connectionStatus?.connecting
      ? 'Connecting...'
      : connectionStatus?.error
        ? `Disconnected: ${connectionStatus.error}`
        : 'Disconnected';

  return h(Box, { flexDirection: 'column', padding: 1 },
    // Header
    h(Box, { marginBottom: 1 },
      h(Text, { bold: true, color: 'cyan' }, banner)
    ),

    // Status bar
    h(Box, { marginBottom: 1, paddingX: 2 },
      h(Text, null, 'Status: '),
      h(Text, { color: statusColor }, statusText)
    ),

    // Divider
    h(Box, { marginBottom: 1, paddingX: 2 },
      h(Text, { color: 'gray' }, '─'.repeat(50))
    ),

    // Menu
    h(Box, { paddingX: 2 },
      h(SelectInput, {
        items: menuItems,
        onSelect: (item) => onSelect(item.value),
        indicatorComponent: ({ isSelected }) =>
          h(Text, { color: isSelected ? 'cyan' : 'gray' },
            isSelected ? '> ' : '  '
          ),
        itemComponent: ({ isSelected, label }) =>
          h(Text, { color: isSelected ? 'white' : 'gray', bold: isSelected },
            label
          )
      })
    ),

    // Footer
    h(Box, { marginTop: 1, paddingX: 2 },
      h(Text, { color: 'gray' }, 'Use arrow keys to navigate, Enter to select, Q to quit')
    )
  );
}
