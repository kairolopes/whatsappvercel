import { SidebarHeader } from './SidebarHeader';
import { SearchBar } from './SearchBar';
import { ChatListItem } from './ChatListItem';
import { useChatStore } from '@/store/chatStore';
import { ImportContactsModal } from './ImportContactsModal';
import { useState } from 'react';

export function Sidebar() {
  const { conversations, activeConversationId, setActiveConversation, importContacts } = useChatStore();
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const openImport = () => {
    setImportedCount(null);
    setImportError(null);
    setImportOpen(true);
  };

  const runImport = async () => {
    setImporting(true);
    setImportError(null);
    setImportedCount(null);
    try {
      const res = await importContacts();
      setImportedCount(res.imported);
    } catch {
      const msg = useChatStore.getState().error || 'Falha ao importar contatos';
      setImportError(msg);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="w-[30%] min-w-[300px] max-w-[415px] h-full flex flex-col bg-white border-r border-wa-border">
      <SidebarHeader onImportContacts={openImport} />
      <SearchBar />
      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-white">
        {conversations.map((chat) => (
          <ChatListItem 
            key={chat.id} 
            id={chat.id}
            name={chat.contact_name}
            avatar={chat.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(chat.contact_name || chat.phone || chat.id)}&background=random`}
            lastMessage={chat.last_message || 'Sem mensagens'}
            time={chat.last_message_time || ''}
            unreadCount={chat.unread_count}
            isActive={chat.id === activeConversationId}
            onClick={() => setActiveConversation(chat.id)}
          />
        ))}
      </div>

      <ImportContactsModal
        open={importOpen}
        loading={importing}
        importedCount={importedCount}
        error={importError}
        onClose={() => setImportOpen(false)}
        onImport={runImport}
      />
    </div>
  );
}
