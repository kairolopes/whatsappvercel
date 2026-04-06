import { cn } from "@/lib/utils";

interface ChatListItemProps {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unreadCount?: number;
  isActive?: boolean;
  onClick?: () => void;
}

export function ChatListItem({
  name,
  avatar,
  lastMessage,
  time,
  unreadCount = 0,
  isActive = false,
  onClick
}: ChatListItemProps) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "flex items-center h-[72px] hover:bg-wa-header cursor-pointer transition-colors group",
        isActive ? "bg-wa-header" : "bg-white"
      )}
    >
      <div className="px-3">
        <img 
          src={avatar} 
          alt={name} 
          className="w-[49px] h-[49px] rounded-full object-cover"
        />
      </div>
      <div className="flex-1 flex flex-col justify-center pr-4 border-b border-wa-border h-full min-w-0">
        <div className="flex justify-between items-baseline mb-0.5">
          <span className="text-[17px] text-wa-text font-normal truncate">{name}</span>
          <span className={cn(
            "text-xs ml-2 whitespace-nowrap",
            unreadCount > 0 ? "text-wa-secondary font-medium" : "text-wa-muted"
          )}>
            {time}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[14px] text-wa-muted truncate">{lastMessage}</span>
          {unreadCount > 0 && (
            <span className="bg-wa-secondary text-white text-[11px] font-medium rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1.5 ml-2">
              {unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
