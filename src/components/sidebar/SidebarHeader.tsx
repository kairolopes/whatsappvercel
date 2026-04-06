import { Users, MessageSquare, MoreVertical, CircleDashed, Download } from 'lucide-react';

export function SidebarHeader({ onImportContacts }: { onImportContacts?: () => void }) {
  return (
    <div className="h-[59px] bg-wa-header flex items-center justify-between px-4 border-b border-wa-border shrink-0">
      <div className="w-10 h-10 rounded-full bg-gray-300 overflow-hidden cursor-pointer">
        <img 
          src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&h=150&fit=crop&crop=faces" 
          alt="User Avatar" 
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex items-center gap-3 text-[#54656f]">
        <button
          type="button"
          onClick={onImportContacts}
          title="Importar contatos (Z-API)"
          className="p-2 rounded-full hover:bg-gray-200 transition-colors"
        >
          <Download size={20} />
        </button>
        <button className="p-2 rounded-full hover:bg-gray-200 transition-colors">
          <Users size={20} />
        </button>
        <button className="p-2 rounded-full hover:bg-gray-200 transition-colors">
          <CircleDashed size={20} />
        </button>
        <button className="p-2 rounded-full hover:bg-gray-200 transition-colors">
          <MessageSquare size={20} />
        </button>
        <button className="p-2 rounded-full hover:bg-gray-200 transition-colors">
          <MoreVertical size={20} />
        </button>
      </div>
    </div>
  );
}
