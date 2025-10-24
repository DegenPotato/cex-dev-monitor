import React, { useState, useEffect } from 'react';
import { Plus, Save, Play, Pause, Zap, Filter, Eye, Bell, X } from 'lucide-react';
import { config } from '../config';

interface CampaignNode {
    node_id: string;
    node_type: 'trigger' | 'filter' | 'monitor' | 'action';
    parent_node_id?: string;
    config: any;
}

interface Campaign {
    id?: number;
    name: string;
    description?: string;
    enabled?: boolean;
    tags?: string[];
    lifetime_ms?: number;
    nodes?: CampaignNode[];
}

const CampaignBuilder: React.FC = () => {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
    const [templates, setTemplates] = useState<any[]>([]);
    const [nodes, setNodes] = useState<CampaignNode[]>([]);
    const [selectedNode, setSelectedNode] = useState<CampaignNode | null>(null);
    const [activeTab, setActiveTab] = useState<'builder' | 'monitor'>('builder');
    const [instances, setInstances] = useState<any[]>([]);

    useEffect(() => {
        loadCampaigns();
        loadTemplates();
    }, []);

    const loadCampaigns = async () => {
        try {
            const response = await fetch(`${config.apiUrl}/api/campaigns`, {
                credentials: 'include'
            });
            const data = await response.json();
            if (data.success) setCampaigns(data.campaigns);
        } catch (error) {
            console.error('Failed to load campaigns:', error);
        }
    };

    const loadTemplates = async () => {
        try {
            const response = await fetch(`${config.apiUrl}/api/campaigns/templates`, {
                credentials: 'include'
            });
            const data = await response.json();
            if (data.success) setTemplates(data.templates);
        } catch (error) {
            console.error('Failed to load templates:', error);
        }
    };

    const loadInstances = async () => {
        if (!selectedCampaign?.id) return;
        try {
            const response = await fetch(`${config.apiUrl}/api/campaigns/${selectedCampaign.id}/logs`, {
                credentials: 'include'
            });
            const data = await response.json();
            if (data.success) setInstances(data.instances);
        } catch (error) {
            console.error('Failed to load instances:', error);
        }
    };

    const createCampaign = async (template?: any) => {
        const campaign = template ? {
            name: `${template.name} (New)`,
            description: template.description,
            tags: template.tags,
            nodes: template.nodes
        } : {
            name: 'New Campaign',
            description: '',
            nodes: []
        };

        try {
            const response = await fetch(`${config.apiUrl}/api/campaigns`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(campaign)
            });
            const data = await response.json();
            if (data.success) {
                await loadCampaigns();
                setSelectedCampaign(data.campaign);
                setNodes(data.campaign.nodes || []);
            }
        } catch (error) {
            console.error('Failed to create campaign:', error);
        }
    };

    const saveCampaign = async () => {
        if (!selectedCampaign) return;
        try {
            const response = await fetch(`${config.apiUrl}/api/campaigns/${selectedCampaign.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ ...selectedCampaign, nodes })
            });
            if (response.ok) {
                alert('Campaign saved!');
                loadCampaigns();
            }
        } catch (error) {
            console.error('Failed to save campaign:', error);
        }
    };

    const toggleCampaign = async (campaign: Campaign) => {
        const endpoint = campaign.enabled ? 'deactivate' : 'activate';
        try {
            const response = await fetch(`${config.apiUrl}/api/campaigns/${campaign.id}/${endpoint}`, {
                method: 'POST',
                credentials: 'include'
            });
            if (response.ok) loadCampaigns();
        } catch (error) {
            console.error(`Failed to ${endpoint} campaign:`, error);
        }
    };

    const addNode = (type: string) => {
        const newNode: CampaignNode = {
            node_id: `${type[0]}${Date.now()}`,
            node_type: type as any,
            config: getDefaultConfig(type)
        };
        
        // Set parent to last node if exists
        if (nodes.length > 0) {
            newNode.parent_node_id = nodes[nodes.length - 1].node_id;
        }
        
        setNodes([...nodes, newNode]);
    };

    const getDefaultConfig = (type: string) => {
        switch (type) {
            case 'trigger':
                return { trigger_type: 'transfer_credited', lamports_exact: 1000000000 };
            case 'filter':
                return { filter_type: 'account_age', expression: 'account_age_seconds <= 300' };
            case 'monitor':
                return { window_ms: 3600000, events: ['InitializeMint'] };
            case 'action':
                return { action_type: 'create_alert', alert_title: 'Alert' };
            default:
                return {};
        }
    };

    const deleteNode = (nodeId: string) => {
        setNodes(nodes.filter(n => n.node_id !== nodeId));
        if (selectedNode?.node_id === nodeId) setSelectedNode(null);
    };

    const getNodeIcon = (type: string) => {
        switch (type) {
            case 'trigger': return <Zap className="w-4 h-4" />;
            case 'filter': return <Filter className="w-4 h-4" />;
            case 'monitor': return <Eye className="w-4 h-4" />;
            case 'action': return <Bell className="w-4 h-4" />;
            default: return null;
        }
    };

    const getNodeColor = (type: string) => {
        switch (type) {
            case 'trigger': return 'bg-yellow-600';
            case 'filter': return 'bg-blue-600';
            case 'monitor': return 'bg-purple-600';
            case 'action': return 'bg-green-600';
            default: return 'bg-gray-600';
        }
    };

    return (
        <div className="h-full flex flex-col bg-gray-900 text-gray-100">
            {/* Header */}
            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-bold">Campaign Builder</h2>
                    {selectedCampaign && (
                        <input
                            type="text"
                            value={selectedCampaign.name}
                            onChange={(e) => setSelectedCampaign({...selectedCampaign, name: e.target.value})}
                            className="px-2 py-1 bg-gray-800 border border-gray-600 rounded"
                        />
                    )}
                </div>
                <div className="flex gap-2">
                    {selectedCampaign && (
                        <>
                            <button onClick={saveCampaign} className="px-3 py-1 bg-blue-600 rounded flex items-center gap-1">
                                <Save className="w-4 h-4" /> Save
                            </button>
                            <button 
                                onClick={() => toggleCampaign(selectedCampaign)}
                                className={`px-3 py-1 rounded flex items-center gap-1 ${
                                    selectedCampaign.enabled ? 'bg-red-600' : 'bg-green-600'
                                }`}
                            >
                                {selectedCampaign.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                {selectedCampaign.enabled ? 'Pause' : 'Activate'}
                            </button>
                        </>
                    )}
                    <button onClick={() => createCampaign()} className="px-3 py-1 bg-purple-600 rounded flex items-center gap-1">
                        <Plus className="w-4 h-4" /> New
                    </button>
                </div>
            </div>

            <div className="flex-1 flex">
                {/* Sidebar */}
                <div className="w-64 border-r border-gray-700 p-4 overflow-y-auto">
                    <h3 className="font-semibold mb-2">Campaigns</h3>
                    {campaigns.map(c => (
                        <div
                            key={c.id}
                            onClick={() => {
                                setSelectedCampaign(c);
                                setNodes(c.nodes || []);
                            }}
                            className={`p-2 mb-2 rounded cursor-pointer hover:bg-gray-800 ${
                                selectedCampaign?.id === c.id ? 'bg-gray-800' : ''
                            }`}
                        >
                            <div className="flex justify-between items-center">
                                <span className="text-sm">{c.name}</span>
                                {c.enabled && <span className="w-2 h-2 bg-green-400 rounded-full" />}
                            </div>
                        </div>
                    ))}
                    
                    <h3 className="font-semibold mt-6 mb-2">Templates</h3>
                    {templates.map((t, idx) => (
                        <div
                            key={idx}
                            onClick={() => createCampaign(t)}
                            className="p-2 mb-2 rounded cursor-pointer hover:bg-gray-800"
                        >
                            <span className="text-sm">{t.name}</span>
                        </div>
                    ))}
                </div>

                {/* Main Content */}
                {selectedCampaign ? (
                    <div className="flex-1 flex flex-col">
                        {/* Tabs */}
                        <div className="flex border-b border-gray-700">
                            <button
                                onClick={() => setActiveTab('builder')}
                                className={`px-4 py-2 ${activeTab === 'builder' ? 'bg-gray-800' : ''}`}
                            >
                                Builder
                            </button>
                            <button
                                onClick={() => { setActiveTab('monitor'); loadInstances(); }}
                                className={`px-4 py-2 ${activeTab === 'monitor' ? 'bg-gray-800' : ''}`}
                            >
                                Monitor
                            </button>
                        </div>

                        {/* Builder Tab */}
                        {activeTab === 'builder' && (
                            <div className="flex-1 flex">
                                <div className="flex-1 p-4">
                                    <div className="mb-4 flex gap-2">
                                        {['trigger', 'filter', 'monitor', 'action'].map(type => (
                                            <button
                                                key={type}
                                                onClick={() => addNode(type)}
                                                className={`px-3 py-2 rounded flex items-center gap-2 text-white ${getNodeColor(type)}`}
                                            >
                                                {getNodeIcon(type)}
                                                Add {type}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="space-y-2">
                                        {nodes.map((node, idx) => (
                                            <div key={node.node_id} className="flex items-center gap-2">
                                                {idx > 0 && <div className="w-8 h-0.5 bg-gray-600" />}
                                                <div
                                                    onClick={() => setSelectedNode(node)}
                                                    className={`flex-1 p-3 rounded border ${
                                                        selectedNode?.node_id === node.node_id ? 'border-blue-500' : 'border-gray-600'
                                                    } ${getNodeColor(node.node_type)} cursor-pointer`}
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <div className="flex items-center gap-2">
                                                            {getNodeIcon(node.node_type)}
                                                            <span className="font-semibold">{node.node_id}</span>
                                                        </div>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                deleteNode(node.node_id);
                                                            }}
                                                            className="text-white hover:text-red-300"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Config Panel */}
                                {selectedNode && (
                                    <div className="w-80 p-4 bg-gray-800 border-l border-gray-700">
                                        <h3 className="font-semibold mb-3">Configuration</h3>
                                        <pre className="text-xs bg-gray-900 p-2 rounded overflow-auto">
                                            {JSON.stringify(selectedNode.config, null, 2)}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Monitor Tab */}
                        {activeTab === 'monitor' && (
                            <div className="flex-1 p-4">
                                <h3 className="font-semibold mb-3">Runtime Instances</h3>
                                <div className="space-y-2">
                                    {instances.map(inst => (
                                        <div key={inst.id} className="p-3 bg-gray-800 rounded">
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm">Instance #{inst.id}</span>
                                                <span className={`px-2 py-1 rounded text-xs ${
                                                    inst.status === 'running' ? 'bg-blue-600' :
                                                    inst.status === 'completed' ? 'bg-green-600' :
                                                    'bg-red-600'
                                                }`}>
                                                    {inst.status}
                                                </span>
                                            </div>
                                            {inst.trigger_wallet && (
                                                <div className="text-xs text-gray-400 mt-1">
                                                    Wallet: {inst.trigger_wallet.slice(0, 8)}...
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex-1 p-8">
                        <div className="max-w-4xl mx-auto">
                            <h2 className="text-2xl font-bold text-cyan-400 mb-6">Welcome to Campaign Builder</h2>
                            
                            <div className="bg-gray-900/50 rounded-lg p-6 mb-6 border border-cyan-500/20">
                                <h3 className="text-lg font-semibold text-white mb-4">🚀 Quick Start</h3>
                                <p className="text-gray-300 mb-4">
                                    Campaigns let you track Solana blockchain events and take automated actions.
                                </p>
                                
                                <div className="space-y-4">
                                    <div className="flex items-start gap-3">
                                        <span className="text-cyan-400 font-bold">1.</span>
                                        <div>
                                            <p className="text-white font-medium">Create from Template</p>
                                            <p className="text-gray-400 text-sm">Click on a template in the left sidebar to start with a pre-built campaign</p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-start gap-3">
                                        <span className="text-cyan-400 font-bold">2.</span>
                                        <div>
                                            <p className="text-white font-medium">Or Build Custom</p>
                                            <p className="text-gray-400 text-sm">Click "+ New" to create a blank campaign</p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-start gap-3">
                                        <span className="text-cyan-400 font-bold">3.</span>
                                        <div>
                                            <p className="text-white font-medium">Add Nodes</p>
                                            <p className="text-gray-400 text-sm">
                                                • <span className="text-yellow-400">Trigger</span>: What starts the campaign (e.g., wallet receives SOL)<br/>
                                                • <span className="text-blue-400">Filter</span>: Conditions to check (e.g., new wallet, amount {'>'} 2 SOL)<br/>
                                                • <span className="text-purple-400">Monitor</span>: Watch for follow-up activity (e.g., token creation)<br/>
                                                • <span className="text-green-400">Action</span>: What to do (e.g., alert, add to database)
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="bg-gray-900/50 rounded-lg p-6 border border-purple-500/20">
                                <h3 className="text-lg font-semibold text-white mb-4">💡 Example: Track Fresh Wallet Token Launches</h3>
                                <p className="text-gray-300 mb-4">
                                    This campaign detects when a new wallet receives exactly 2 SOL and then creates a token:
                                </p>
                                <ol className="space-y-2 text-gray-400">
                                    <li>1. <span className="text-yellow-400">Trigger</span>: Wallet receives 2 SOL</li>
                                    <li>2. <span className="text-blue-400">Filter</span>: Account age {'<'} 5 minutes</li>
                                    <li>3. <span className="text-purple-400">Monitor</span>: Watch for token creation (1 hour window)</li>
                                    <li>4. <span className="text-green-400">Action</span>: Create alert {'&'} add to database</li>
                                </ol>
                                
                                <button 
                                    onClick={() => createCampaign(templates[0])}
                                    className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-white font-medium"
                                >
                                    Try This Template →
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CampaignBuilder;
