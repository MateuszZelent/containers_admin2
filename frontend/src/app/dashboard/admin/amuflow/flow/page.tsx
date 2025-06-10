"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/registry/new-york-v4/ui/textarea";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { userApi } from "@/lib/api-client";
import { 
  GitBranch, 
  Play, 
  Save,
  Upload,
  Download,
  Plus,
  Trash2,
  Settings,
  FileText,
  Zap,
  Brain,
  Database,
  Cpu,
  MoreVertical,
  MousePointer,
  Hand,
  ArrowRight,
  Circle,
  Square
} from "lucide-react";
import { toast } from "sonner";

// Types for flow elements
interface FlowNode {
  id: string;
  type: 'mx3-template' | 'mx3-parser' | 'fft' | 'spectrum' | 'custom' | 'output';
  position: { x: number; y: number };
  data: {
    label: string;
    inputs?: string[];
    outputs?: string[];
    config?: any;
    uploadedFile?: File | null;
    parsedParameters?: string[];
  };
}

interface FlowConnection {
  id: string;
  source: string;
  target: string;
  sourceOutput: string;
  targetInput: string;
}

interface Flow {
  id: string;
  name: string;
  description: string;
  nodes: FlowNode[];
  connections: FlowConnection[];
  createdAt: string;
  modifiedAt: string;
}

// Node templates
const NODE_TEMPLATES = {
  'mx3-template': {
    type: 'mx3-template',
    data: {
      label: 'MX3 Template',
      inputs: [],
      outputs: ['template_data'],
      config: { file_content: '', parsed_params: [] },
      uploadedFile: null,
      parsedParameters: []
    }
  },
  'mx3-parser': {
    type: 'mx3-parser',
    data: {
      label: 'MX3 Parser',
      inputs: [],
      outputs: ['save_data', 'autosave_data', 'parameters'],
      config: { file_path: '', parse_options: {} }
    }
  },
  'fft': {
    type: 'fft',
    data: {
      label: 'FFT Analysis',
      inputs: ['time_series', 'sampling_rate'],
      outputs: ['frequency_spectrum', 'magnitude', 'phase'],
      config: { window: 'hamming', nperseg: 1024 }
    }
  },
  'spectrum': {
    type: 'spectrum',
    data: {
      label: 'Spectrum Analyzer',
      inputs: ['magnetic_field', 'config'],
      outputs: ['spectrum', 'report', 'visualization'],
      config: { frequency_range: [0, 100], resolution: 0.1 }
    }
  },
  'custom': {
    type: 'custom',
    data: {
      label: 'Custom Module',
      inputs: ['input_data'],
      outputs: ['output_data'],
      config: { script: '', parameters: {} }
    }
  },
  'output': {
    type: 'output',
    data: {
      label: 'Output Node',
      inputs: ['data'],
      outputs: [],
      config: { format: 'json', destination: 'file' }
    }
  }
};

interface User {
  username: string;
  is_admin: boolean;
  is_superuser: boolean;
}

export default function FlowDesignerPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [activeFlow, setActiveFlow] = useState<Flow | null>(null);
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newFlowName, setNewFlowName] = useState("");
  const [newFlowDescription, setNewFlowDescription] = useState("");
  const [canvasMode, setCanvasMode] = useState<'select' | 'pan'>('select');
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStart, setConnectionStart] = useState<{nodeId: string, port: string, type: 'input' | 'output'} | null>(null);
  const [tempConnection, setTempConnection] = useState<{start: {x: number, y: number}, end: {x: number, y: number}} | null>(null);
  
  // MX3 Template configuration modal states
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [configNodeId, setConfigNodeId] = useState<string | null>(null);
  const [selectedOutputs, setSelectedOutputs] = useState<string[]>([]);
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await userApi.getCurrentUser();
        setCurrentUser(response.data);
        
        if (!response.data.is_admin && !response.data.is_superuser) {
          toast.error("Brak uprawnień do tej sekcji");
          router.push("/dashboard");
          return;
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        toast.error("Błąd podczas pobierania danych użytkownika");
        router.push("/dashboard");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, [router]);

  const createNewFlow = () => {
    if (!newFlowName.trim()) {
      toast.error("Nazwa przepływu jest wymagana");
      return;
    }

    const newFlow: Flow = {
      id: Date.now().toString(),
      name: newFlowName.trim(),
      description: newFlowDescription.trim(),
      nodes: [],
      connections: [],
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString()
    };

    setFlows(prev => [...prev, newFlow]);
    setActiveFlow(newFlow);
    setNewFlowName("");
    setNewFlowDescription("");
    setIsCreateDialogOpen(false);
    toast.success("Nowy przepływ został utworzony");
  };

  const addNode = (type: keyof typeof NODE_TEMPLATES, position: { x: number; y: number }) => {
    if (!activeFlow) return;

    const template = NODE_TEMPLATES[type];
    const newNode: FlowNode = {
      id: Date.now().toString(),
      type: type,
      position,
      data: template.data
    };

    setActiveFlow(prev => prev ? {
      ...prev,
      nodes: [...prev.nodes, newNode],
      modifiedAt: new Date().toISOString()
    } : null);
  };

  const deleteSelectedNodes = () => {
    if (!activeFlow || selectedNodes.length === 0) return;

    setActiveFlow(prev => prev ? {
      ...prev,
      nodes: prev.nodes.filter(node => !selectedNodes.includes(node.id)),
      connections: prev.connections.filter(
        conn => !selectedNodes.includes(conn.source) && !selectedNodes.includes(conn.target)
      ),
      modifiedAt: new Date().toISOString()
    } : null);

    setSelectedNodes([]);
    toast.success("Usunięto wybrane węzły");
  };

  const updateNodePosition = (nodeId: string, newPosition: { x: number; y: number }) => {
    if (!activeFlow) return;

    setActiveFlow(prev => prev ? {
      ...prev,
      nodes: prev.nodes.map(node => 
        node.id === nodeId 
          ? { ...node, position: newPosition }
          : node
      ),
      modifiedAt: new Date().toISOString()
    } : null);
  };

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (canvasMode !== 'select') return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const node = activeFlow?.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    setIsDragging(true);
    setDraggedNode(nodeId);
    setDragOffset({
      x: e.clientX - rect.left - node.position.x,
      y: e.clientY - rect.top - node.position.y
    });
    setDragStartPos({ x: e.clientX, y: e.clientY });
    
    // Zaznacz węzeł jeśli nie jest zaznaczony
    if (!selectedNodes.includes(nodeId)) {
      setSelectedNodes([nodeId]);
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !draggedNode || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const newPosition = {
      x: Math.max(0, e.clientX - rect.left - dragOffset.x),
      y: Math.max(0, e.clientY - rect.top - dragOffset.y)
    };
    
    updateNodePosition(draggedNode, newPosition);
    
    // Aktualizuj tymczasowe połączenie jeśli jest aktywne
    if (isConnecting && tempConnection) {
      setTempConnection({
        ...tempConnection,
        end: { x: e.clientX - rect.left, y: e.clientY - rect.top }
      });
    }
  }, [isDragging, draggedNode, dragOffset, isConnecting, tempConnection]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (isDragging && draggedNode) {
      // Sprawdź czy węzeł został przesunięty (minimal drag threshold)
      const dragDistance = Math.sqrt(
        Math.pow(e.clientX - dragStartPos.x, 2) + 
        Math.pow(e.clientY - dragStartPos.y, 2)
      );
      
      if (dragDistance < 5) {
        // To był klik, nie przeciąganie
        console.log('Click detected, not drag');
      }
    }
    
    setIsDragging(false);
    setDraggedNode(null);
    setDragOffset({ x: 0, y: 0 });
    
    // Zakończ połączenie jeśli jest aktywne
    if (isConnecting) {
      setIsConnecting(false);
      setConnectionStart(null);
      setTempConnection(null);
    }
  }, [isDragging, draggedNode, dragStartPos, isConnecting]);

  const handleConnectionStart = (nodeId: string, port: string, type: 'input' | 'output', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    setIsConnecting(true);
    setConnectionStart({ nodeId, port, type });
    
    const startPos = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    
    setTempConnection({
      start: startPos,
      end: startPos
    });
  };

  const handleConnectionEnd = (targetNodeId: string, targetPort: string, targetType: 'input' | 'output') => {
    if (!isConnecting || !connectionStart || !activeFlow) return;
    
    // Sprawdź czy połączenie jest prawidłowe (output -> input)
    if (connectionStart.type === 'output' && targetType === 'input') {
      const newConnection: FlowConnection = {
        id: `conn_${Date.now()}`,
        source: connectionStart.nodeId,
        target: targetNodeId,
        sourceOutput: connectionStart.port,
        targetInput: targetPort
      };
      
      setActiveFlow(prev => prev ? {
        ...prev,
        connections: [...prev.connections, newConnection],
        modifiedAt: new Date().toISOString()
      } : null);
      
      toast.success("Połączenie utworzone");
    } else if (connectionStart.type === 'input' && targetType === 'output') {
      const newConnection: FlowConnection = {
        id: `conn_${Date.now()}`,
        source: targetNodeId,
        target: connectionStart.nodeId,
        sourceOutput: targetPort,
        targetInput: connectionStart.port
      };
      
      setActiveFlow(prev => prev ? {
        ...prev,
        connections: [...prev.connections, newConnection],
        modifiedAt: new Date().toISOString()
      } : null);
      
      toast.success("Połączenie utworzone");
    }
    
    setIsConnecting(false);
    setConnectionStart(null);
    setTempConnection(null);
  };

  // File upload and parsing functions for MX3 Template
  const handleFileUpload = async (nodeId: string, file: File) => {
    if (!activeFlow) return;

    try {
      const fileContent = await file.text();
      const parsedParameters = parseMX3Parameters(fileContent);
      
      setActiveFlow(prev => prev ? {
        ...prev,
        nodes: prev.nodes.map(node => 
          node.id === nodeId 
            ? { 
                ...node, 
                data: {
                  ...node.data,
                  uploadedFile: file,
                  config: { ...node.data.config, file_content: fileContent, parsed_params: parsedParameters },
                  parsedParameters,
                  outputs: ['template_data', ...parsedParameters.map(p => `param_${p}`)]
                }
              }
            : node
        ),
        modifiedAt: new Date().toISOString()
      } : null);

      toast.success(`Załadowano plik ${file.name} z ${parsedParameters.length} parametrami`);
    } catch (error) {
      toast.error("Błąd podczas ładowania pliku MX3");
      console.error(error);
    }
  };

  const parseMX3Parameters = (content: string): string[] => {
    // Simple parser for MX3 files - extract variables that can be parameterized
    const parameters: string[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Look for common MX3 parameters that might be variable
      if (trimmed.startsWith('Nx') || trimmed.startsWith('Ny') || trimmed.startsWith('Nz')) {
        const match = trimmed.match(/^(N[xyz])\s*:?=?\s*(.+)/);
        if (match) parameters.push(match[1]);
      }
      
      if (trimmed.startsWith('setgridsize')) {
        parameters.push('gridsize');
      }
      
      if (trimmed.startsWith('setcellsize')) {
        parameters.push('cellsize');
      }
      
      if (trimmed.match(/^(alpha|Aex|Msat|Ku1|B_ext)\s*:?=?\s*/)) {
        const match = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:?=?\s*/);
        if (match) parameters.push(match[1]);
      }
      
      // Look for variables defined with := or =
      if (trimmed.match(/^[a-zA-Z_][a-zA-Z0-9_]*\s*:?=\s*[0-9.-]+/)) {
        const match = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:?=/);
        if (match) parameters.push(match[1]);
      }
    }
    
    return [...new Set(parameters)]; // Remove duplicates
  };

  const connectToParser = (templateNodeId: string, parserNodeId: string) => {
    if (!activeFlow) return;

    const templateNode = activeFlow.nodes.find(n => n.id === templateNodeId);
    const parserNode = activeFlow.nodes.find(n => n.id === parserNodeId);
    
    if (!templateNode || !parserNode || templateNode.type !== 'mx3-template' || parserNode.type !== 'mx3-parser') {
      return;
    }

    // Update parser node with template data
    if (templateNode.data.parsedParameters && templateNode.data.parsedParameters.length > 0) {
      setActiveFlow(prev => prev ? {
        ...prev,
        nodes: prev.nodes.map(node => 
          node.id === parserNodeId 
            ? { 
                ...node, 
                data: {
                  ...node.data,
                  inputs: templateNode.data.parsedParameters || [],
                  config: { 
                    ...node.data.config, 
                    template_file: templateNode.data.uploadedFile?.name || '',
                    template_content: templateNode.data.config?.file_content || ''
                  }
                }
              }
            : node
        ),
        modifiedAt: new Date().toISOString()
      } : null);

      toast.success("Parser został zaktualizowany na podstawie template");
    }
  };

  // Monitor connections to automatically update parsers when connected to templates
  useEffect(() => {
    if (!activeFlow) return;

    // Check for new connections between mx3-template and mx3-parser
    activeFlow.connections.forEach(connection => {
      const sourceNode = activeFlow.nodes.find(n => n.id === connection.source);
      const targetNode = activeFlow.nodes.find(n => n.id === connection.target);
      
      if (sourceNode?.type === 'mx3-template' && targetNode?.type === 'mx3-parser') {
        if (sourceNode.data.parsedParameters && sourceNode.data.parsedParameters.length > 0) {
          connectToParser(sourceNode.id, targetNode.id);
        }
      }
    });
  }, [activeFlow?.connections, activeFlow?.nodes]);

  useEffect(() => {
    if (isDragging || isConnecting) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isConnecting, handleMouseMove, handleMouseUp]);

  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'mx3-template': return <Upload className="h-4 w-4" />;
      case 'mx3-parser': return <FileText className="h-4 w-4" />;
      case 'fft': return <Zap className="h-4 w-4" />;
      case 'spectrum': return <Brain className="h-4 w-4" />;
      case 'custom': return <Settings className="h-4 w-4" />;
      case 'output': return <Database className="h-4 w-4" />;
      default: return <Circle className="h-4 w-4" />;
    }
  };

  const getNodeColor = (type: string) => {
    switch (type) {
      case 'mx3-template': return 'border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-950';
      case 'mx3-parser': return 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950';
      case 'fft': return 'border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-950';
      case 'spectrum': return 'border-purple-300 bg-purple-50 dark:border-purple-700 dark:bg-purple-950';
      case 'custom': return 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950';
      case 'output': return 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950';
      default: return 'border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-950';
    }
  };

  // MX3 Template configuration functions
  const openConfigModal = (nodeId: string) => {
    if (!activeFlow) return;
    
    const node = activeFlow.nodes.find(n => n.id === nodeId);
    if (!node || node.type !== 'mx3-template') return;
    
    setConfigNodeId(nodeId);
    setSelectedOutputs(node.data.outputs || ['template_data']);
    setIsConfigModalOpen(true);
  };

  const saveOutputConfiguration = () => {
    if (!activeFlow || !configNodeId) return;

    setActiveFlow(prev => prev ? {
      ...prev,
      nodes: prev.nodes.map(node => 
        node.id === configNodeId 
          ? { 
              ...node, 
              data: {
                ...node.data,
                outputs: selectedOutputs
              }
            }
          : node
      ),
      modifiedAt: new Date().toISOString()
    } : null);

    setIsConfigModalOpen(false);
    setConfigNodeId(null);
    setSelectedOutputs([]);
    toast.success("Konfiguracja wyjść została zapisana");
  };

  const toggleOutput = (output: string) => {
    if (output === 'template_data') return; // Always keep template_data

    setSelectedOutputs(prev => 
      prev.includes(output) 
        ? prev.filter(o => o !== output)
        : [...prev, output]
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Ładowanie Flow Designer...</p>
        </div>
      </div>
    );
  }

  if (!currentUser?.is_admin && !currentUser?.is_superuser) {
    return (
      <div className="text-center py-8">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Brak dostępu</h1>
        <p className="text-gray-600 dark:text-gray-400">Nie masz uprawnień do tej sekcji.</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b bg-white dark:bg-gray-900 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <GitBranch className="h-6 w-6 text-blue-600" />
              <h1 className="text-2xl font-bold">Flow Designer</h1>
            </div>
            
            {activeFlow && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400">→</span>
                <span className="font-medium">{activeFlow.name}</span>
                <Badge variant="secondary">
                  {activeFlow.nodes.length} węzłów
                </Badge>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Canvas Tools */}
            <div className="flex items-center gap-1 border rounded-lg p-1">
              <Button
                variant={canvasMode === 'select' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setCanvasMode('select')}
              >
                <MousePointer className="h-4 w-4" />
              </Button>
              <Button
                variant={canvasMode === 'pan' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setCanvasMode('pan')}
              >
                <Hand className="h-4 w-4" />
              </Button>
            </div>

            {/* Node Tools */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Dodaj węzeł
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Typy węzłów</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => addNode('mx3-template', { x: 100, y: 200 })}>
                  <Upload className="h-4 w-4 mr-2" />
                  MX3 Template
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addNode('mx3-parser', { x: 300, y: 200 })}>
                  <FileText className="h-4 w-4 mr-2" />
                  MX3 Parser
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addNode('fft', { x: 400, y: 200 })}>
                  <Zap className="h-4 w-4 mr-2" />
                  FFT Analysis
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addNode('spectrum', { x: 600, y: 200 })}>
                  <Brain className="h-4 w-4 mr-2" />
                  Spectrum Analyzer
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addNode('custom', { x: 800, y: 200 })}>
                  <Settings className="h-4 w-4 mr-2" />
                  Custom Module
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addNode('output', { x: 1000, y: 200 })}>
                  <Database className="h-4 w-4 mr-2" />
                  Output Node
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {selectedNodes.length > 0 && (
              <Button variant="destructive" size="sm" onClick={deleteSelectedNodes}>
                <Trash2 className="h-4 w-4 mr-2" />
                Usuń ({selectedNodes.length})
              </Button>
            )}

            <Button variant="outline" disabled>
              <Save className="h-4 w-4 mr-2" />
              Zapisz
            </Button>

            <Button disabled>
              <Play className="h-4 w-4 mr-2" />
              Uruchom
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex">
        {/* Sidebar - Flow List */}
        <div className="w-80 border-r bg-gray-50 dark:bg-gray-900 flex flex-col">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Przepływy</h2>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Nowy
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Utwórz nowy przepływ</DialogTitle>
                    <DialogDescription>
                      Stwórz nowy przepływ automatyzacji dla zadań Amumax.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="flow-name">Nazwa przepływu</Label>
                      <Input
                        id="flow-name"
                        value={newFlowName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewFlowName(e.target.value)}
                        placeholder="np. Analiza FFT podstawowa"
                      />
                    </div>
                    <div>
                      <Label htmlFor="flow-description">Opis</Label>
                      <Textarea
                        id="flow-description"
                        value={newFlowDescription}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewFlowDescription(e.target.value)}
                        placeholder="Opisz cel i zastosowanie tego przepływu..."
                        rows={3}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                      Anuluj
                    </Button>
                    <Button onClick={createNewFlow}>
                      Utwórz przepływ
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {flows.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Brak przepływów</p>
                <p className="text-xs">Utwórz pierwszy przepływ</p>
              </div>
            ) : (
              flows.map((flow) => (
                <Card 
                  key={flow.id}
                  className={`cursor-pointer transition-colors ${
                    activeFlow?.id === flow.id 
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' 
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                  onClick={() => setActiveFlow(flow)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate">{flow.name}</h3>
                        {flow.description && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mt-1">
                            {flow.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="secondary" className="text-xs">
                            {flow.nodes.length} węzłów
                          </Badge>
                          <span className="text-xs text-gray-500">
                            {new Date(flow.modifiedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                            <MoreVertical className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem>
                            <Settings className="h-4 w-4 mr-2" />
                            Edytuj
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Download className="h-4 w-4 mr-2" />
                            Eksportuj
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Usuń
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* Main Canvas */}
        <div className="flex-1 relative bg-gray-100 dark:bg-gray-800">
          {activeFlow ? (
            <div 
              ref={canvasRef}
              className="w-full h-full relative overflow-auto"
              style={{ 
                backgroundImage: 'radial-gradient(circle, #e5e7eb 1px, transparent 1px)',
                backgroundSize: '20px 20px'
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setSelectedNodes([]);
                }
              }}
            >
              {/* Render connections */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
                {activeFlow.connections.map((connection) => {
                  const sourceNode = activeFlow.nodes.find(n => n.id === connection.source);
                  const targetNode = activeFlow.nodes.find(n => n.id === connection.target);
                  
                  if (!sourceNode || !targetNode) return null;
                  
                  // Calculate source port position
                  const sourceOutputs = sourceNode.data.outputs || [];
                  const sourceOutputIndex = sourceOutputs.indexOf(connection.sourceOutput);
                  const sourceNodeHeight = Math.max(80, Math.max(sourceNode.data.inputs?.length || 0, sourceOutputs.length, 1) * 25 + 40);
                  const sourcePortY = sourceNode.position.y + 32 + (sourceOutputIndex + 0.5) * (sourceNodeHeight - 40) / Math.max(sourceOutputs.length, 1);
                  
                  // Calculate target port position
                  const targetInputs = targetNode.data.inputs || [];
                  const targetInputIndex = targetInputs.indexOf(connection.targetInput);
                  const targetNodeHeight = Math.max(80, Math.max(targetInputs.length, targetNode.data.outputs?.length || 0, 1) * 25 + 40);
                  const targetPortY = targetNode.position.y + 32 + (targetInputIndex + 0.5) * (targetNodeHeight - 40) / Math.max(targetInputs.length, 1);
                  
                  const startX = sourceNode.position.x + 200; // Right side of source node
                  const startY = sourcePortY;
                  const endX = targetNode.position.x; // Left side of target node
                  const endY = targetPortY;
                  
                  const controlX1 = startX + Math.max(50, (endX - startX) / 3);
                  const controlX2 = endX - Math.max(50, (endX - startX) / 3);
                  
                  return (
                    <g key={connection.id}>
                      <path
                        d={`M ${startX},${startY} C ${controlX1},${startY} ${controlX2},${endY} ${endX},${endY}`}
                        stroke="#3b82f6"
                        strokeWidth="2"
                        fill="none"
                        markerEnd="url(#arrowhead)"
                      />
                      {/* Connection label */}
                      <text
                        x={(startX + endX) / 2}
                        y={(startY + endY) / 2 - 10}
                        fontSize="10"
                        fill="#6b7280"
                        textAnchor="middle"
                        className="pointer-events-none select-none"
                      >
                        {connection.sourceOutput} → {connection.targetInput}
                      </text>
                    </g>
                  );
                })}
                
                {/* Temporary connection while dragging */}
                {tempConnection && (
                  <path
                    d={`M ${tempConnection.start.x},${tempConnection.start.y} L ${tempConnection.end.x},${tempConnection.end.y}`}
                    stroke="#3b82f6"
                    strokeWidth="2"
                    fill="none"
                    strokeDasharray="5,5"
                    markerEnd="url(#arrowhead)"
                  />
                )}
                
                {/* Arrow marker definition */}
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="7"
                    refX="9"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon
                      points="0 0, 10 3.5, 0 7"
                      fill="#3b82f6"
                    />
                  </marker>
                </defs>
              </svg>

              {/* Render nodes */}
              {activeFlow.nodes.map((node) => {
                const inputCount = node.data.inputs?.length || 0;
                const outputCount = node.data.outputs?.length || 0;
                const maxPorts = Math.max(inputCount, outputCount, 1);
                const nodeHeight = Math.max(80, maxPorts * 25 + 40);
                
                return (
                  <div
                    key={node.id}
                    className={`absolute border-2 rounded-md transition-all bg-white dark:bg-gray-800 shadow-lg ${
                      selectedNodes.includes(node.id) 
                        ? 'border-blue-500 shadow-blue-200 dark:shadow-blue-800' 
                        : 'border-gray-300 dark:border-gray-600 hover:shadow-xl'
                    } ${isDragging && draggedNode === node.id ? 'cursor-grabbing' : 'cursor-grab'}`}
                    style={{
                      left: node.position.x,
                      top: node.position.y,
                      width: '200px',
                      height: `${nodeHeight}px`,
                      zIndex: selectedNodes.includes(node.id) ? 10 : 5,
                    }}
                    onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isDragging) {
                        if (e.ctrlKey || e.metaKey) {
                          setSelectedNodes(prev => 
                            prev.includes(node.id) 
                              ? prev.filter(id => id !== node.id)
                              : [...prev, node.id]
                          );
                        } else {
                          setSelectedNodes([node.id]);
                        }
                      }
                    }}
                  >
                    {/* Header with title and type color */}
                    <div className={`h-8 flex items-center justify-center rounded-t-md text-white text-sm font-medium ${
                      node.type === 'mx3-template' ? 'bg-orange-500' :
                      node.type === 'mx3-parser' ? 'bg-blue-500' :
                      node.type === 'fft' ? 'bg-yellow-500' :
                      node.type === 'spectrum' ? 'bg-purple-500' :
                      node.type === 'custom' ? 'bg-green-500' :
                      node.type === 'output' ? 'bg-red-500' : 'bg-gray-500'
                    }`}>
                      <div className="flex items-center gap-2">
                        {getNodeIcon(node.type)}
                        <span className="truncate">{node.data.label}</span>
                      </div>
                    </div>

                    {/* Input ports - left side */}
                    {node.data.inputs && node.data.inputs.map((input, idx) => {
                      const portY = 8 + 32 + (idx + 0.5) * (nodeHeight - 40) / Math.max(inputCount, 1);
                      return (
                        <div
                          key={`input-${idx}`}
                          className="absolute group"
                          style={{
                            left: '-6px',
                            top: `${portY}px`,
                            transform: 'translateY(-50%)'
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            handleConnectionStart(node.id, input, 'input', e);
                          }}
                          onMouseUp={(e) => {
                            e.stopPropagation();
                            isConnecting && handleConnectionEnd(node.id, input, 'input');
                          }}
                        >
                          <div className="w-3 h-3 bg-blue-500 border-2 border-white rounded-full cursor-crosshair hover:scale-125 transition-transform shadow-md z-20 relative">
                          </div>
                          <div className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-30">
                            {input}
                          </div>
                        </div>
                      );
                    })}

                    {/* Output ports - right side */}
                    {node.data.outputs && node.data.outputs.map((output, idx) => {
                      const portY = 8 + 32 + (idx + 0.5) * (nodeHeight - 40) / Math.max(outputCount, 1);
                      return (
                        <div
                          key={`output-${idx}`}
                          className="absolute group"
                          style={{
                            right: '-6px',
                            top: `${portY}px`,
                            transform: 'translateY(-50%)'
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            handleConnectionStart(node.id, output, 'output', e);
                          }}
                          onMouseUp={(e) => {
                            e.stopPropagation();
                            isConnecting && handleConnectionEnd(node.id, output, 'output');
                          }}
                        >
                          <div className="w-3 h-3 bg-green-500 border-2 border-white rounded-full cursor-crosshair hover:scale-125 transition-transform shadow-md z-20 relative">
                          </div>
                          <div className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-30">
                            {output}
                          </div>
                        </div>
                      );
                    })}

                    {/* Node content body */}
                    <div className="p-3 pt-2 h-full overflow-hidden" style={{ paddingTop: '8px', paddingBottom: '8px' }}>
                      {/* Special content for MX3 Template */}
                      {node.type === 'mx3-template' && (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                          {!node.data.uploadedFile ? (
                            <div 
                              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-2 w-full h-full flex flex-col items-center justify-center cursor-pointer hover:border-orange-400 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                const input = document.createElement('input');
                                input.type = 'file';
                                input.accept = '.mx3,.txt';
                                input.onchange = (event) => {
                                  const file = (event.target as HTMLInputElement).files?.[0];
                                  if (file) {
                                    handleFileUpload(node.id, file);
                                  }
                                };
                                input.click();
                              }}
                            >
                              <Upload className="h-6 w-6 text-gray-400 mb-2" />
                              <span className="text-xs text-gray-500">Kliknij aby załadować</span>
                              <span className="text-xs text-gray-500">plik MX3</span>
                            </div>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center">
                              <FileText className="h-6 w-6 text-orange-500 mb-1" />
                              <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-full">
                                {node.data.uploadedFile.name}
                              </span>
                              {node.data.parsedParameters && node.data.parsedParameters.length > 0 && (
                                <span className="text-xs text-green-600 dark:text-green-400 mt-1">
                                  {node.data.parsedParameters.length} parametrów
                                </span>
                              )}
                              <button
                                className="text-xs text-blue-500 hover:text-blue-700 mt-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const input = document.createElement('input');
                                  input.type = 'file';
                                  input.accept = '.mx3,.txt';
                                  input.onchange = (event) => {
                                    const file = (event.target as HTMLInputElement).files?.[0];
                                    if (file) {
                                      handleFileUpload(node.id, file);
                                    }
                                  };
                                  input.click();
                                }}
                              >
                                Zmień plik
                              </button>
                              {node.data.parsedParameters && node.data.parsedParameters.length > 0 && (
                                <button
                                  className="text-xs bg-orange-500 text-white px-2 py-1 rounded hover:bg-orange-600 mt-1"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openConfigModal(node.id);
                                  }}
                                >
                                  <Settings className="h-3 w-3 inline mr-1" />
                                  Konfiguruj wyjścia
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Regular content for other node types */}
                      {node.type !== 'mx3-template' && (
                        <div className="flex h-full">
                        <div className="flex-1 pr-2">
                          {node.data.inputs && node.data.inputs.length > 0 && (
                            <div className="text-xs">
                              {node.data.inputs.map((input, idx) => {
                                const portY = (idx + 0.5) * (nodeHeight - 40) / Math.max(inputCount, 1);
                                return (
                                  <div 
                                    key={idx} 
                                    className="flex items-center text-gray-600 dark:text-gray-400 mb-1"
                                    style={{ 
                                      position: 'absolute',
                                      left: '12px',
                                      top: `${32 + portY}px`,
                                      transform: 'translateY(-50%)',
                                      fontSize: '10px'
                                    }}
                                  >
                                    <span className="truncate max-w-[60px]">{input}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        
                        {/* Output labels on the right */}
                        <div className="flex-1 pl-2">
                          {node.data.outputs && node.data.outputs.length > 0 && (
                            <div className="text-xs">
                              {node.data.outputs.map((output, idx) => {
                                const portY = (idx + 0.5) * (nodeHeight - 40) / Math.max(outputCount, 1);
                                return (
                                  <div 
                                    key={idx} 
                                    className="flex items-center justify-end text-gray-600 dark:text-gray-400 mb-1"
                                    style={{ 
                                      position: 'absolute',
                                      right: '12px',
                                      top: `${32 + portY}px`,
                                      transform: 'translateY(-50%)',
                                      fontSize: '10px'
                                    }}
                                  >
                                    <span className="truncate max-w-[60px]">{output}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Welcome message for empty canvas */}
              {activeFlow.nodes.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <GitBranch className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-600 dark:text-gray-400 mb-2">
                      Pusty obszar roboczy
                    </h3>
                    <p className="text-gray-500 mb-4">
                      Rozpocznij projektowanie przepływu dodając pierwszy węzeł.
                    </p>
                    <Button onClick={() => addNode('mx3-parser', { x: 400, y: 300 })}>
                      <Plus className="h-4 w-4 mr-2" />
                      Dodaj węzeł MX3 Parser
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <GitBranch className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-600 dark:text-gray-400 mb-2">
                  Wybierz przepływ
                </h3>
                <p className="text-gray-500 mb-4">
                  Wybierz istniejący przepływ z listy lub utwórz nowy.
                </p>
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Utwórz nowy przepływ
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MX3 Template configuration modal */}
      <Dialog open={isConfigModalOpen} onOpenChange={setIsConfigModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Konfiguracja wyjść dla MX3 Template</DialogTitle>
            <DialogDescription>
              Wybierz które parametry mają być dostępne jako wyjścia węzła
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {configNodeId && activeFlow && (() => {
              const node = activeFlow.nodes.find(n => n.id === configNodeId);
              const availableParams = node?.data.parsedParameters || [];
              
              return (
                <>
                  <div>
                    <Label className="text-sm font-medium">Podstawowe wyjścia</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Badge 
                        variant="secondary" 
                        className="cursor-not-allowed opacity-60"
                      >
                        template_data (zawsze aktywne)
                      </Badge>
                    </div>
                  </div>
                  
                  {availableParams.length > 0 && (
                    <div>
                      <Label className="text-sm font-medium">Sparsowane parametry</Label>
                      <div className="grid grid-cols-2 gap-2 mt-2 max-h-48 overflow-y-auto">
                        {availableParams.map(param => {
                          const outputName = `param_${param}`;
                          const isSelected = selectedOutputs.includes(outputName);
                          
                          return (
                            <div 
                              key={param}
                              className={`p-2 border rounded-lg cursor-pointer transition-colors ${
                                isSelected 
                                  ? 'border-orange-500 bg-orange-50 dark:bg-orange-950' 
                                  : 'border-gray-200 hover:border-gray-300 dark:border-gray-700'
                              }`}
                              onClick={() => toggleOutput(outputName)}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{param}</span>
                                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                                  isSelected 
                                    ? 'border-orange-500 bg-orange-500' 
                                    : 'border-gray-300'
                                }`}>
                                  {isSelected && (
                                    <div className="w-2 h-2 bg-white rounded-full" />
                                  )}
                                </div>
                              </div>
                              <span className="text-xs text-gray-500">Wyjście: {outputName}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                    <Label className="text-sm font-medium">Aktualnie wybrane wyjścia</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedOutputs.length === 0 ? (
                        <span className="text-sm text-gray-500">Brak wybranych wyjść</span>
                      ) : (
                        selectedOutputs.map(output => (
                          <Badge 
                            key={output} 
                            variant={output === 'template_data' ? 'secondary' : 'default'}
                            className={output === 'template_data' ? 'cursor-not-allowed' : 'cursor-pointer'}
                            onClick={output !== 'template_data' ? () => toggleOutput(output) : undefined}
                          >
                            {output}
                            {output !== 'template_data' && (
                              <span className="ml-1">×</span>
                            )}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfigModalOpen(false)}>
              Anuluj
            </Button>
            <Button onClick={saveOutputConfiguration}>
              Zapisz ({selectedOutputs.length} wyjść)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
