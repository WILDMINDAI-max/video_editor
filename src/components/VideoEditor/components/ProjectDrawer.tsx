
import React from 'react';
import { X, Home, User, Settings, Folder } from 'lucide-react';
import { MOCK_PROJECTS } from '@/types';

interface ProjectDrawerProps {
    isOpen: boolean;
    onClose: () => void;
}

const ProjectDrawer: React.FC<ProjectDrawerProps> = ({ isOpen, onClose }) => {
    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onClose}></div>
            )}

            {/* Drawer */}
            <div className={`fixed inset-y-0 left-0 w-80 bg-white shadow-2xl transform transition-transform duration-300 ease-out z-[70] flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="h-14 flex items-center justify-between px-6 border-b border-gray-100">
                    <h2 className="font-bold text-xl text-violet-700">My Workspace</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                <div className="p-4 flex-1 overflow-y-auto">
                    <div className="space-y-1 mb-8">
                        <button className="w-full flex items-center gap-3 px-4 py-3 bg-violet-50 text-violet-700 rounded-lg font-medium">
                            <Home size={20} /> Home
                        </button>
                        <button className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-lg font-medium">
                            <Folder size={20} /> Projects
                        </button>
                        <button className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-lg font-medium">
                            <User size={20} /> Brand Hub
                        </button>
                    </div>

                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-4 mb-2">Recent Designs</h3>
                    <div className="space-y-2">
                        {MOCK_PROJECTS.map(p => (
                            <div key={p.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer group">
                                <img src={p.thumbnail} className="w-12 h-12 rounded object-cover" alt={p.name} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                                    <p className="text-xs text-gray-500">{p.lastModified}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-4 border-t border-gray-100">
                    <button className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-lg font-medium">
                        <Settings size={20} /> Settings
                    </button>
                </div>
            </div>
        </>
    );
};

export default ProjectDrawer;
