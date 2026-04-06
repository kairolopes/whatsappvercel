import { Search, Filter } from 'lucide-react';

export function SearchBar() {
  return (
    <div className="h-[49px] bg-white flex items-center px-3 gap-2 border-b border-wa-border shrink-0">
      <div className="flex-1 bg-wa-search h-[35px] rounded-lg flex items-center px-3 gap-3">
        <Search size={18} className="text-wa-muted" />
        <input 
          type="text" 
          placeholder="Pesquisar ou começar uma nova conversa" 
          className="bg-transparent w-full outline-none text-sm placeholder:text-wa-muted text-wa-text"
        />
      </div>
      <button className="p-1 text-wa-muted hover:bg-wa-header rounded-full transition-colors">
        <Filter size={20} />
      </button>
    </div>
  );
}
