import { SidebarHeader } from './SidebarHeader';
import { SearchBar } from './SearchBar';
import { ChatListItem } from './ChatListItem';
import { useChatStore } from '@/store/chatStore';

export function Sidebar() {
  const { conversations, activeConversationId, setActiveConversation } = useChatStore();

  return (
    <div className="w-[30%] min-w-[300px] max-w-[415px] h-full flex flex-col bg-white border-r border-wa-border">
      <SidebarHeader />
      <SearchBar />
      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-white">
        {conversations.map((chat) => (
          <ChatListItem 
            key={chat.id} 
            id={chat.id}
            name={chat.contact_name}
            avatar={chat.avatar_url}
            lastMessage={chat.last_message}
            time={chat.last_message_time}
            unreadCount={chat.unread_count}
            isActive={chat.id === activeConversationId}
            onClick={() => setActiveConversation(chat.id)}
          />
        ))}
      </div>
    </div>
  );
}
