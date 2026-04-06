import { Search, MoreVertical } from 'lucide-react';

interface ChatHeaderProps {
  name: string;
  avatar: string;
  status?: string;
}

export function ChatHeader({ name, avatar, status = 'visto por último hoje às 14:30' }: ChatHeaderProps) {
  return (
    <div className="h-[59px] bg-wa-header flex items-center justify-between px-4 border-b border-wa-border shrink-0">
      <div className="flex items-center gap-3 cursor-pointer">
        <img 
          src={avatar} 
          alt={name} 
          className="w-10 h-10 rounded-full object-cover"
        />
        <div className="flex flex-col">
          <span className="text-[16px] text-wa-text font-normal">{name}</span>
          <span className="text-[13px] text-wa-muted">{status}</span>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[#54656f]">
        <button className="p-2 rounded-full hover:bg-gray-200 transition-colors">
          <Search size={20} />
        </button>
        <button className="p-2 rounded-full hover:bg-gray-200 transition-colors">
          <MoreVertical size={20} />
        </button>
      </div>
    </div>
  );
}
