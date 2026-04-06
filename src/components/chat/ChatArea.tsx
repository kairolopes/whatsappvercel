import { useEffect, useRef } from 'react';
import { MessageCircle } from 'lucide-react';
import { ChatHeader } from './ChatHeader';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { useChatStore } from '@/store/chatStore';

export function ChatArea() {
  const { messages, activeConversationId, conversations } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find(c => c.id === activeConversationId);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  if (!activeConversation) {
    return (
      <div className="flex-1 flex flex-col h-full bg-wa-panel items-center justify-center border-b-[6px] border-wa-secondary">
        <div className="w-[320px] h-[320px] rounded-full bg-white/50 flex items-center justify-center mb-8">
          <MessageCircle size={120} className="text-[#41525d] opacity-20" />
        </div>
        <h1 className="text-[32px] font-light text-[#41525d] mb-4">WhatsApp Web</h1>
        <p className="text-[14px] text-[#667781] text-center max-w-[560px] leading-5">
          Envie e receba mensagens sem precisar manter seu celular conectado à internet.<br/>
          Use o WhatsApp em até 4 aparelhos conectados e 1 celular ao mesmo tempo.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-wa-chat relative">
      {/* Background Pattern */}
      <div 
        className="absolute inset-0 z-0 opacity-40 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(rgba(0,0,0,0.06) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          backgroundPosition: '0 0'
        }}
      />
      
      <div className="relative z-10 flex flex-col h-full">
        <ChatHeader 
          name={activeConversation.contact_name} 
          avatar={activeConversation.avatar_url}
        />
        
        <div className="flex-1 overflow-y-auto px-16 py-4 flex flex-col">
          {messages.map((msg) => (
            <MessageBubble 
              key={msg.client_id ?? msg.id} 
              id={msg.id}
              text={msg.text}
              sender={msg.sender}
              time={msg.timestamp}
              status={msg.status}
              kind={msg.kind}
              meta={msg.meta}
              externalId={msg.external_id}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        <ChatInput />
      </div>
    </div>
  );
}
