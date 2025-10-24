import React, { useState, useEffect } from 'react';
import { Plus, Save, Play, Pause, Zap, Filter, Eye, Bell, Trash2, CheckCircle, AlertCircle, Loader, Wallet, ChevronDown, ChevronUp } from 'lucide-react';
import { config } from '../config';

interface TriggerConfig {
    trigger_type: 'transfer_credited' | 'signature_to_address' | 'program_log' | 'account_created' | 'token_mint';
    wallets?: string[];
    lamports_exact?: number;
    lamports_min?: number;
    lamports_max?: number;
    sender_list?: string[];
    program_id?: string;
    log_pattern?: string;
}

interface FilterConfig {
    filter_type: 'account_age' | 'prior_balance' | 'inbound_sources' | 'token_interaction' | 'custom';
    expression?: string;
    max_age_seconds?: number;
    min_balance?: number;
    max_balance?: number;
}

interface MonitorConfig {
    window_ms: number;
    programs_to_watch?: string[];
    events?: string[];
    min_events?: number;
    max_events?: number;
}

interface ActionConfig {
    action_type: 'webhook' | 'tag_db' | 'send_to_fetcher' | 'create_alert';
    webhook_url?: string;
    tag_name?: string;
    alert_message?: string;
}

interface CampaignNode {
    node_id: string;
    node_type: 'trigger' | 'filter' | 'monitor' | 'action';
    parent_node_id?: string;
    config: TriggerConfig | FilterConfig | MonitorConfig | ActionConfig;
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
    const [activeTab, setActiveTab] = useState<'builder' | 'monitor'>('builder');
    const [instances, setInstances] = useState<any[]>([]);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

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
        
        // Validate that trigger nodes have wallets
        const triggerNodes = nodes.filter(n => n.node_type === 'trigger');
        for (const node of triggerNodes) {
            const config = node.config as TriggerConfig;
            if (!config.wallets || config.wallets.length === 0) {
                alert('Please add at least one wallet to monitor in the trigger node');
                return;
            }
        }

        setSaveStatus('saving');
        try {
            const response = await fetch(`${config.apiUrl}/api/campaigns/${selectedCampaign.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ ...selectedCampaign, nodes })
            });
            if (response.ok) {
                setSaveStatus('saved');
                setTimeout(() => setSaveStatus('idle'), 3000);
                loadCampaigns();
            } else {
                setSaveStatus('error');
            }
        } catch (error) {
            console.error('Failed to save campaign:', error);
            setSaveStatus('error');
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
        const defaultConfigs: Record<string, any> = {
            trigger: {
                trigger_type: 'transfer_credited',
                wallets: [],
            },
            filter: {
                filter_type: 'account_age',
                max_age_seconds: 300,
            },
            monitor: {
                window_ms: 3600000, // 1 hour
                events: [],
            },
            action: {
                action_type: 'create_alert',
                alert_message: 'Campaign triggered!',
            }
        };

        const newNode: CampaignNode = {
            node_id: `node_${Date.now()}`,
            node_type: type as any,
            config: defaultConfigs[type] || {},
            parent_node_id: nodes.length > 0 ? nodes[nodes.length - 1].node_id : undefined
        };
        setNodes([...nodes, newNode]);
        setEditingNodeId(newNode.node_id);
        setExpandedNodes(new Set([...expandedNodes, newNode.node_id]));
    };


    const updateNodeConfig = (nodeId: string, config: any) => {
        setNodes(nodes.map(node => 
            node.node_id === nodeId ? { ...node, config } : node
        ));
    };

    const deleteNode = (nodeId: string) => {
        setNodes(nodes.filter(node => node.node_id !== nodeId));
        if (editingNodeId === nodeId) setEditingNodeId(null);
    };

    const toggleNodeExpanded = (nodeId: string) => {
        const newExpanded = new Set(expandedNodes);
        if (newExpanded.has(nodeId)) {
            newExpanded.delete(nodeId);
        } else {
            newExpanded.add(nodeId);
        }
        setExpandedNodes(newExpanded);
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

    const getNodeTextColor = (type: string) => {
        switch (type) {
            case 'trigger': return 'text-yellow-400';
            case 'filter': return 'text-blue-400';
            case 'monitor': return 'text-purple-400';
            case 'action': return 'text-green-400';
            default: return 'text-gray-400';
        }
    };

    const renderNodeConfig = (node: CampaignNode) => {
        const config = node.config as any;
        
        switch (node.node_type) {
            case 'trigger':
                return (
                    <div className="space-y-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">
                                <Wallet className="w-4 h-4 inline mr-1" />
                                Wallets to Monitor
                            </label>
                            <textarea
                                value={(config.wallets || []).join('\n')}
                                onChange={(e) => {
                                    const wallets = e.target.value.split('\n').filter(w => w.trim());
                                    updateNodeConfig(node.node_id, { ...config, wallets });
                                }}
                                placeholder="Enter wallet addresses (one per line)\n\nExample:\n7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs\nDezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"
                                className="w-full h-24 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-white placeholder-gray-500"
                            />
                            {config.wallets && config.wallets.length > 0 && (
                                <p className="text-xs text-gray-500 mt-1">Monitoring {config.wallets.length} wallet{config.wallets.length !== 1 ? 's' : ''}</p>
                            )}
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Trigger Type</label>
                            <select
                                value={config.trigger_type || 'transfer_credited'}
                                onChange={(e) => updateNodeConfig(node.node_id, { ...config, trigger_type: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm"
                            >
                                <option value="transfer_credited">SOL Received</option>
                                <option value="signature_to_address">Any Transaction</option>
                                <option value="token_mint">Token Minted</option>
                                <option value="account_created">Account Created</option>
                                <option value="program_log">Program Log</option>
                            </select>
                        </div>
                        
                        {config.trigger_type === 'transfer_credited' && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">Amount (SOL)</label>
                                    <input
                                        type="number"
                                        value={(config.lamports_exact || 0) / 1e9}
                                        onChange={(e) => updateNodeConfig(node.node_id, { 
                                            ...config, 
                                            lamports_exact: parseFloat(e.target.value) * 1e9 
                                        })}
                                        placeholder="Leave empty for any amount"
                                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm"
                                        step="0.001"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">From Specific Wallets (optional)</label>
                                    <textarea
                                        value={(config.sender_list || []).join('\n')}
                                        onChange={(e) => {
                                            const senders = e.target.value.split('\n').filter(w => w.trim());
                                            updateNodeConfig(node.node_id, { ...config, sender_list: senders });
                                        }}
                                        placeholder="Enter sender addresses (one per line)"
                                        className="w-full h-20 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm"
                                    />
                                </div>
                            </>
                        )}
                    </div>
                );
                
            case 'filter':
                return (
                    <div className="space-y-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Filter Type</label>
                            <select
                                value={config.filter_type || 'account_age'}
                                onChange={(e) => updateNodeConfig(node.node_id, { ...config, filter_type: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm"
                            >
                                <option value="account_age">Account Age</option>
                                <option value="prior_balance">Balance Check</option>
                                <option value="custom">Custom Expression</option>
                            </select>
                        </div>
                        
                        {config.filter_type === 'account_age' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Max Age (seconds)</label>
                                <input
                                    type="number"
                                    value={config.max_age_seconds || 300}
                                    onChange={(e) => updateNodeConfig(node.node_id, { 
                                        ...config, 
                                        max_age_seconds: parseInt(e.target.value) 
                                    })}
                                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm"
                                />
                                <p className="text-xs text-gray-500 mt-1">Only process if account is younger than {config.max_age_seconds || 300} seconds</p>
                            </div>
                        )}
                        
                        {config.filter_type === 'prior_balance' && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">Min Balance (SOL)</label>
                                    <input
                                        type="number"
                                        value={(config.min_balance || 0) / 1e9}
                                        onChange={(e) => updateNodeConfig(node.node_id, { 
                                            ...config, 
                                            min_balance: parseFloat(e.target.value) * 1e9 
                                        })}
                                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm"
                                        step="0.001"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">Max Balance (SOL)</label>
                                    <input
                                        type="number"
                                        value={(config.max_balance || 0) / 1e9}
                                        onChange={(e) => updateNodeConfig(node.node_id, { 
                                            ...config, 
                                            max_balance: parseFloat(e.target.value) * 1e9 
                                        })}
                                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm"
                                        step="0.001"
                                    />
                                </div>
                            </>
                        )}
                    </div>
                );
                
            case 'monitor':
                return (
                    <div className="space-y-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Monitor Duration</label>
                            <select
                                value={config.window_ms || 3600000}
                                onChange={(e) => updateNodeConfig(node.node_id, { ...config, window_ms: parseInt(e.target.value) })}
                                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm"
                            >
                                <option value={300000}>5 minutes</option>
                                <option value={900000}>15 minutes</option>
                                <option value={1800000}>30 minutes</option>
                                <option value={3600000}>1 hour</option>
                                <option value={7200000}>2 hours</option>
                                <option value={14400000}>4 hours</option>
                            </select>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Watch for Events</label>
                            <textarea
                                value={(config.events || []).join('\n')}
                                onChange={(e) => {
                                    const events = e.target.value.split('\n').filter(e => e.trim());
                                    updateNodeConfig(node.node_id, { ...config, events });
                                }}
                                placeholder="Enter events to watch (one per line)\n\nExample:\nInitializeMint\nMintTo\nTransfer"
                                className="w-full h-20 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm"
                            />
                        </div>
                    </div>
                );
                
            case 'action':
                return (
                    <div className="space-y-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Action Type</label>
                            <select
                                value={config.action_type || 'create_alert'}
                                onChange={(e) => updateNodeConfig(node.node_id, { ...config, action_type: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm"
                            >
                                <option value="create_alert">Create Alert</option>
                                <option value="tag_db">Add Database Tag</option>
                                <option value="send_to_fetcher">Send to Fetcher</option>
                                <option value="webhook">Call Webhook</option>
                            </select>
                        </div>
                        
                        {config.action_type === 'create_alert' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Alert Message</label>
                                <textarea
                                    value={config.alert_message || ''}
                                    onChange={(e) => updateNodeConfig(node.node_id, { ...config, alert_message: e.target.value })}
                                    placeholder="Enter alert message"
                                    className="w-full h-20 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm"
                                />
                            </div>
                        )}
                        
                        {config.action_type === 'webhook' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Webhook URL</label>
                                <input
                                    type="url"
                                    value={config.webhook_url || ''}
                                    onChange={(e) => updateNodeConfig(node.node_id, { ...config, webhook_url: e.target.value })}
                                    placeholder="https://your-webhook.com/endpoint"
                                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm"
                                />
                            </div>
                        )}
                        
                        {config.action_type === 'tag_db' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Tag Name</label>
                                <input
                                    type="text"
                                    value={config.tag_name || ''}
                                    onChange={(e) => updateNodeConfig(node.node_id, { ...config, tag_name: e.target.value })}
                                    placeholder="e.g., suspicious, dev_wallet, etc."
                                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm"
                                />
                            </div>
                        )}
                    </div>
                );
                
            default:
                return null;
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
                <div className="flex items-center gap-3">
                    {saveStatus !== 'idle' && (
                        <div className={`flex items-center gap-2 px-3 py-1 rounded text-sm ${
                            saveStatus === 'saving' ? 'bg-yellow-500/20 text-yellow-400' :
                            saveStatus === 'saved' ? 'bg-green-500/20 text-green-400' :
                            'bg-red-500/20 text-red-400'
                        }`}>
                            {saveStatus === 'saving' && <><Loader className="w-3 h-3 animate-spin" /> Saving...</>}
                            {saveStatus === 'saved' && <><CheckCircle className="w-3 h-3" /> Saved!</>}
                            {saveStatus === 'error' && <><AlertCircle className="w-3 h-3" /> Error saving</>}
                        </div>
                    )}
                    {selectedCampaign && (
                        <>
                            <button 
                                onClick={saveCampaign} 
                                disabled={saveStatus === 'saving'}
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded flex items-center gap-1"
                            >
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

                                    <div className="space-y-4">
                                        {nodes.length === 0 ? (
                                            <div className="text-center py-8 text-gray-500">
                                                <p className="mb-2">No nodes added yet</p>
                                                <p className="text-sm">Click the buttons above to add trigger, filter, monitor, or action nodes</p>
                                            </div>
                                        ) : (
                                            nodes.map((node, idx) => {
                                                const isExpanded = expandedNodes.has(node.node_id);
                                                const config = node.config as any;
                                                
                                                return (
                                                    <div key={node.node_id} className="relative">
                                                        {idx > 0 && (
                                                            <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 w-0.5 h-4 bg-gray-600" />
                                                        )}
                                                        <div className={`border rounded-lg p-4 ${isExpanded ? 'border-cyan-500/50 bg-gray-900/50' : 'border-gray-700 bg-gray-800/50'}`}>
                                                            <div className="flex justify-between items-start mb-3">
                                                                <div className="flex items-center gap-3">
                                                                    {getNodeIcon(node.node_type)}
                                                                    <div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className={`font-bold text-lg capitalize ${getNodeTextColor(node.node_type)}`}>
                                                                                {node.node_type} Node
                                                                            </span>
                                                                            {node.node_type === 'trigger' && (!config.wallets || config.wallets.length === 0) && (
                                                                                <span className="text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded flex items-center gap-1">
                                                                                    <AlertCircle className="w-3 h-3" />
                                                                                    No wallets
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <span className="text-xs text-gray-500">ID: {node.node_id}</span>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        onClick={() => toggleNodeExpanded(node.node_id)}
                                                                        className="p-1 hover:bg-gray-700 rounded"
                                                                    >
                                                                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => deleteNode(node.node_id)}
                                                                        className="p-1 hover:bg-red-500/20 rounded text-red-400"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            
                                                            {isExpanded && (
                                                                <div className="space-y-3 mt-4 pt-4 border-t border-gray-700">
                                                                    {renderNodeConfig(node)}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>

                                {/* Removed old config panel since we now have inline editing */}
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
