import { useEffect } from 'react';
import { Sidebar } from './components/sidebar/Sidebar';
import { ChatArea } from './components/chat/ChatArea';
import { useChatStore } from '@/store/chatStore';
import { zapi } from '@/lib/zapi';

function App() {
  const { fetchConversations, startPolling, stopPolling, startRealtime, stopRealtime } = useChatStore();

  useEffect(() => {
    fetchConversations();
    startPolling();
    startRealtime();

    zapi.setReadReceipts('enable').catch(() => {
    });

    return () => {
      stopPolling();
      stopRealtime();
    };
  }, [fetchConversations, startPolling, stopPolling, startRealtime, stopRealtime]);

  return (
    <div className="w-screen h-screen bg-wa-bg flex items-center justify-center relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-[127px] bg-wa-primary z-0" />

      <div className="w-full max-w-[1600px] h-[calc(100vh-38px)] min-h-[500px] mt-5 mb-5 mx-auto bg-white rounded shadow-md z-10 flex overflow-hidden xl:w-[calc(100vw-38px)]">
        <Sidebar />
        <ChatArea />
      </div>
    </div>
  );
}

export default App;
