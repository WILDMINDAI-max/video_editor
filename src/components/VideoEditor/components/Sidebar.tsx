
import React from 'react';
import {
    Type, UploadCloud, FolderKanban,
    Image, Video, Sparkles, Music, Library
} from 'lucide-react';
import { Tab } from '@/types';

interface SidebarProps {
    activeTab: Tab;
    setActiveTab: (tab: Tab) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
    const tools = [
        { id: 'library', icon: Library, label: 'Library' },
        { id: 'text', icon: Type, label: 'Text' },
        { id: 'uploads', icon: UploadCloud, label: 'Uploads' },
        { id: 'images', icon: Image, label: 'Photos' },
        { id: 'videos', icon: Video, label: 'Videos' },
        { id: 'audio', icon: Music, label: 'Audio' },
    ];

    return (
        <div className="w-[72px] bg-[#0e1318] text-gray-400 flex flex-col h-full z-30 shrink-0 overflow-y-auto custom-scrollbar">
            <div className="flex flex-col py-2">
                {tools.map((tool) => {
                    const isActive = activeTab === tool.id;
                    return (
                        <button
                            key={tool.id}
                            onClick={() => setActiveTab(tool.id as Tab)}
                            className={`flex flex-col items-center justify-center py-4 w-full transition-all relative shrink-0 ${isActive ? 'bg-[#252627] text-white' : 'hover:text-gray-100 hover:bg-[#1f2021]'
                                }`}
                        >
                            {isActive && (
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-r"></div>
                            )}
                            <tool.icon size={24} className="mb-1.5" strokeWidth={1.5} />
                            <span className="text-[10px] font-medium">{tool.label}</span>
                        </button>
                    );
                })}
            </div>

            <div className="flex-1 min-h-[20px]"></div>

        </div>
    );
};

export default Sidebar;
