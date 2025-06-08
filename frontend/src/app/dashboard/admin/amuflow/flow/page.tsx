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
  type: 'mx3-parser' | 'fft' | 'spectrum' | 'custom' | 'output';
  position: { x: number; y: number };
  data: {
    label: string;
    inputs?: string[];
    outputs?: string[];
    config?: any;
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
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newFlowName, setNewFlowName] = useState("");
  const [newFlowDescription, setNewFlowDescription] = useState("");
  const [canvasMode, setCanvasMode] = useState<'select' | 'pan'>('select');
  
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

  const getNodeIcon = (type: string) => {
    switch (type) {
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
      case 'mx3-parser': return 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950';
      case 'fft': return 'border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-950';
      case 'spectrum': return 'border-purple-300 bg-purple-50 dark:border-purple-700 dark:bg-purple-950';
      case 'custom': return 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950';
      case 'output': return 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950';
      default: return 'border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-950';
    }
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
                <DropdownMenuItem onClick={() => addNode('mx3-parser', { x: 200, y: 200 })}>
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
            >
              {/* Render nodes */}
              {activeFlow.nodes.map((node) => (
                <div
                  key={node.id}
                  className={`absolute border-2 rounded-lg p-3 cursor-pointer transition-all min-w-[160px] ${
                    getNodeColor(node.type)
                  } ${
                    selectedNodes.includes(node.id) 
                      ? 'border-blue-500 shadow-lg transform scale-105' 
                      : 'hover:shadow-md'
                  }`}
                  style={{
                    left: node.position.x,
                    top: node.position.y,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.ctrlKey || e.metaKey) {
                      setSelectedNodes(prev => 
                        prev.includes(node.id) 
                          ? prev.filter(id => id !== node.id)
                          : [...prev, node.id]
                      );
                    } else {
                      setSelectedNodes([node.id]);
                    }
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {getNodeIcon(node.type)}
                    <span className="font-medium text-sm">{node.data.label}</span>
                  </div>
                  
                  {/* Inputs */}
                  {node.data.inputs && node.data.inputs.length > 0 && (
                    <div className="text-xs mb-2">
                      <div className="text-gray-600 dark:text-gray-400 mb-1">Wejścia:</div>
                      {node.data.inputs.map((input, idx) => (
                        <div key={idx} className="flex items-center gap-1 mb-1">
                          <Circle className="h-2 w-2 fill-blue-500 text-blue-500" />
                          <span>{input}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Outputs */}
                  {node.data.outputs && node.data.outputs.length > 0 && (
                    <div className="text-xs">
                      <div className="text-gray-600 dark:text-gray-400 mb-1">Wyjścia:</div>
                      {node.data.outputs.map((output, idx) => (
                        <div key={idx} className="flex items-center gap-1 mb-1">
                          <Square className="h-2 w-2 fill-green-500 text-green-500" />
                          <span>{output}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

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
    </div>
  );
}
