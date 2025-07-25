"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  type: 'mx3-file-loader' | 'mx3-parser' | 'linspace' | 'sims-gen' | 'download-scripts' | 'sim-runner' | 'output';
  position: { x: number; y: number };
  data: {
    label: string;
    inputs?: string[];
    outputs?: string[];
    config?: any;
    uploadedFile?: File | null;
    parsedParameters?: string[];
    selectedParameters?: string[];
    inputCount?: number;
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
  'mx3-file-loader': {
    type: 'mx3-file-loader',
    data: {
      label: 'MX3 File Loader',
      inputs: [],
      outputs: ['file_content'],
      config: { file_path: '' },
      uploadedFile: null
    }
  },
  'mx3-parser': {
    type: 'mx3-parser',
    data: {
      label: 'MX3 Parser',
      inputs: ['file_content'],
      outputs: [],
      config: { selected_params: [] },
      parsedParameters: [],
      selectedParameters: []
    }
  },
  'linspace': {
    type: 'linspace',
    data: {
      label: 'LinSpace Generator',
      inputs: ['parameter_name'],
      outputs: ['parameter_values'],
      config: { min: 0, max: 1, steps: 10, parameter_name: '' }
    }
  },
  'sims-gen': {
    type: 'sims-gen',
    data: {
      label: 'Simulations Generator',
      inputs: ['param1'],
      outputs: ['simulation_scripts'],
      config: { output_folder: '', base_template: '' },
      inputCount: 1
    }
  },
  'download-scripts': {
    type: 'download-scripts',
    data: {
      label: 'Download Scripts',
      inputs: ['simulation_scripts'],
      outputs: [],
      config: { download_format: 'zip', include_metadata: true }
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
  
  // MX3 Parser configuration modal states
  const [configNodeId, setConfigNodeId] = useState<string>('');
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [selectedOutputs, setSelectedOutputs] = useState<string[]>([]);
  
  // LinSpace configuration modal states
  const [linspaceModalOpen, setLinspaceModalOpen] = useState(false);
  const [linspaceConfig, setLinspaceConfig] = useState({ min: 0, max: 1, steps: 10 });
  const [currentLinspaceNodeId, setCurrentLinspaceNodeId] = useState<string | null>(null);
  
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
      
      // Check if we need to update parser with file loader data
      const sourceNode = activeFlow.nodes.find(n => n.id === connectionStart.nodeId);
      const targetNode = activeFlow.nodes.find(n => n.id === targetNodeId);
      
      if (sourceNode?.type === 'mx3-file-loader' && targetNode?.type === 'mx3-parser') {
        // Delay the parser update to avoid state conflicts
        setTimeout(() => {
          connectToParser(connectionStart.nodeId, targetNodeId);
        }, 100);
      }
      
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
      
      // Check if we need to update parser with file loader data
      const sourceNode = activeFlow.nodes.find(n => n.id === targetNodeId);
      const targetNode = activeFlow.nodes.find(n => n.id === connectionStart.nodeId);
      
      if (sourceNode?.type === 'mx3-file-loader' && targetNode?.type === 'mx3-parser') {
        // Delay the parser update to avoid state conflicts
        setTimeout(() => {
          connectToParser(targetNodeId, connectionStart.nodeId);
        }, 100);
      }
      
      toast.success("Połączenie utworzone");
    }
    
    setIsConnecting(false);
    setConnectionStart(null);
    setTempConnection(null);
  };

  // Function to handle SimsGen input count changes
  const updateSimsGenInputs = (nodeId: string, newInputCount: number) => {
    if (!activeFlow) return;

    setActiveFlow(prev => prev ? {
      ...prev,
      nodes: prev.nodes.map(node => 
        node.id === nodeId 
          ? { 
              ...node, 
              data: {
                ...node.data,
                inputCount: newInputCount,
                inputs: Array.from({length: newInputCount}, (_, i) => `param${i + 1}`)
              }
            }
          : node
      ),
      modifiedAt: new Date().toISOString()
    } : null);
  };

  // Updated file upload function for file loader
  const handleFileUpload = async (nodeId: string, file: File) => {
    if (!activeFlow) return;

    try {
      const fileContent = await file.text();
      
      setActiveFlow(prev => prev ? {
        ...prev,
        nodes: prev.nodes.map(node => 
          node.id === nodeId 
            ? { 
                ...node, 
                data: {
                  ...node.data,
                  uploadedFile: file,
                  config: { ...node.data.config, file_content: fileContent }
                }
              }
            : node
        ),
        modifiedAt: new Date().toISOString()
      } : null);

      toast.success(`Załadowano plik ${file.name}`);
    } catch (error) {
      toast.error("Błąd podczas ładowania pliku");
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

  const connectToParser = (fileLoaderId: string, parserId: string) => {
    if (!activeFlow) return;

    const fileLoader = activeFlow.nodes.find(n => n.id === fileLoaderId);
    const parserNode = activeFlow.nodes.find(n => n.id === parserId);
    
    if (!fileLoader || !parserNode || fileLoader.type !== 'mx3-file-loader' || parserNode.type !== 'mx3-parser') {
      return;
    }

    // Update parser node with template data
    if (fileLoader.data.config?.file_content) {
      const parsedParameters = parseMX3Parameters(fileLoader.data.config.file_content);
      
      // Only update if parameters have actually changed
      const currentParams = parserNode.data.parsedParameters || [];
      const parametersChanged = JSON.stringify(currentParams.sort()) !== JSON.stringify(parsedParameters.sort());
      
      if (parametersChanged) {
        setActiveFlow(prev => prev ? {
          ...prev,
          nodes: prev.nodes.map(node => 
            node.id === parserId 
              ? { 
                  ...node, 
                  data: {
                    ...node.data,
                    parsedParameters,
                    selectedParameters: [],
                    outputs: []
                  }
                }
              : node
          ),
          modifiedAt: new Date().toISOString()
        } : null);

        toast.success("Parser został zaktualizowany na podstawie file loader");
      }
    }
  };

  // Monitor connections to automatically update parsers when connected to file loaders
  // This is now handled manually when connections are created

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
      case 'mx3-file-loader': return <Upload className="h-4 w-4" />;
      case 'mx3-parser': return <FileText className="h-4 w-4" />;
      case 'linspace': return <ArrowRight className="h-4 w-4" />;
      case 'sims-gen': return <Cpu className="h-4 w-4" />;
      case 'download-scripts': return <Download className="h-4 w-4" />;
      case 'output': return <Database className="h-4 w-4" />;
      default: return <Circle className="h-4 w-4" />;
    }
  };

  const getNodeColor = (type: string) => {
    switch (type) {
      case 'mx3-file-loader': return 'border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-950';
      case 'mx3-parser': return 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950';
      case 'linspace': return 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950';
      case 'sims-gen': return 'border-purple-300 bg-purple-50 dark:border-purple-700 dark:bg-purple-950';
      case 'download-scripts': return 'border-cyan-300 bg-cyan-50 dark:border-cyan-700 dark:bg-cyan-950';
      case 'output': return 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950';
      default: return 'border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-950';
    }
  };

  // MX3 Parser configuration functions
  const openConfigModal = (nodeId: string) => {
    if (!activeFlow) return;
    
    const node = activeFlow.nodes.find(n => n.id === nodeId);
    if (!node || node.type !== 'mx3-parser') return;
    
    setConfigNodeId(nodeId);
    setSelectedOutputs(node.data.selectedParameters || []);
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
    setConfigNodeId('');
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

  // LinSpace configuration functions
  const openLinspaceModal = (nodeId: string) => {
    if (!activeFlow) return;
    
    const node = activeFlow.nodes.find(n => n.id === nodeId);
    if (!node || node.type !== 'linspace') return;
    
    setCurrentLinspaceNodeId(nodeId);
    setLinspaceConfig({
      min: node.data.config?.min || 0,
      max: node.data.config?.max || 1,
      steps: node.data.config?.steps || 10
    });
    setLinspaceModalOpen(true);
  };

  const saveLinspaceConfig = () => {
    if (!activeFlow || !currentLinspaceNodeId) return;

    setActiveFlow(prev => prev ? {
      ...prev,
      nodes: prev.nodes.map(node =>
        node.id === currentLinspaceNodeId
          ? {
              ...node,
              data: {
                ...node.data,
                config: {
                  ...node.data.config,
                  ...linspaceConfig
                }
              }
            }
          : node
      ),
      modifiedAt: new Date().toISOString()
    } : null);

    setLinspaceModalOpen(false);
    setCurrentLinspaceNodeId(null);
    toast.success("Konfiguracja LinSpace została zapisana");
  };

  // Professional pipeline execution and script generation
  const executeFullPipeline = (downloadNodeId: string): { success: boolean; files: Array<{name: string, content: string}> } => {
    if (!activeFlow) return { success: false, files: [] };

    // 1. Find the download node and trace back the pipeline
    const downloadNode = activeFlow.nodes.find(n => n.id === downloadNodeId);
    if (!downloadNode || downloadNode.type !== 'download-scripts') {
      toast.error("Błąd: Nieprawidłowy węzeł pobierania");
      return { success: false, files: [] };
    }

    // 2. Find connected SimsGen node
    const simsGenConnection = activeFlow.connections.find(
      conn => conn.target === downloadNodeId && conn.targetInput === 'simulation_scripts'
    );
    
    if (!simsGenConnection) {
      toast.error("Błąd: Brak połączonego węzła SimsGen");
      return { success: false, files: [] };
    }

    const simsGenNode = activeFlow.nodes.find(n => n.id === simsGenConnection.source);
    if (!simsGenNode || simsGenNode.type !== 'sims-gen') {
      toast.error("Błąd: Nieprawidłowy węzeł SimsGen");
      return { success: false, files: [] };
    }

    // 3. Collect parameter values from connected LinSpace nodes
    const parameterValues: Record<string, number[]> = {};
    const parameterConnections = activeFlow.connections.filter(
      conn => conn.target === simsGenNode.id
    );

    for (const conn of parameterConnections) {
      const sourceNode = activeFlow.nodes.find(n => n.id === conn.source);
      if (sourceNode?.type === 'linspace') {
        const config = sourceNode.data.config;
        const values = generateLinspaceValues(config.min, config.max, config.steps);
        parameterValues[conn.targetInput] = values;
      }
    }

    // 4. Find base template from connected MX3 Parser
    let baseTemplate = '';
    let selectedParameters: string[] = [];
    
    // Try to find MX3 Parser connected to any LinSpace
    for (const conn of parameterConnections) {
      const linspaceNode = activeFlow.nodes.find(n => n.id === conn.source);
      if (linspaceNode?.type === 'linspace') {
        // Find MX3 Parser connected to this LinSpace
        const parserConnection = activeFlow.connections.find(
          c => c.target === linspaceNode.id && c.targetInput === 'parameter_name'
        );
        
        if (parserConnection) {
          const parserNode = activeFlow.nodes.find(n => n.id === parserConnection.source);
          if (parserNode?.type === 'mx3-parser') {
            // Find MX3 File Loader connected to parser
            const loaderConnection = activeFlow.connections.find(
              c => c.target === parserNode.id && c.targetInput === 'file_content'
            );
            
            if (loaderConnection) {
              const loaderNode = activeFlow.nodes.find(n => n.id === loaderConnection.source);
              if (loaderNode?.type === 'mx3-file-loader' && loaderNode.data.config?.file_content) {
                baseTemplate = loaderNode.data.config.file_content;
                selectedParameters = parserNode.data.outputs || [];
                break;
              }
            }
          }
        }
      }
    }

    if (!baseTemplate) {
      toast.error("Błąd: Brak podstawowego template MX3");
      return { success: false, files: [] };
    }

    // 5. Generate all parameter combinations
    const combinations = generateParameterCombinations(parameterValues);
    
    if (combinations.length === 0) {
      toast.error("Błąd: Brak kombinacji parametrów do wygenerowania");
      return { success: false, files: [] };
    }

    // 6. Generate MX3 files for each combination
    const generatedFiles: Array<{name: string, content: string}> = [];
    
    combinations.forEach((combination, index) => {
      const fileName = `simulation_${String(index + 1).padStart(4, '0')}.mx3`;
      const content = substituteParametersInTemplate(baseTemplate, combination, selectedParameters);
      
      generatedFiles.push({
        name: fileName,
        content: content
      });
    });

    return { success: true, files: generatedFiles };
  };

  // Generate linearly spaced values
  const generateLinspaceValues = (min: number, max: number, steps: number): number[] => {
    if (steps <= 1) return [min];
    
    const values: number[] = [];
    const stepSize = (max - min) / (steps - 1);
    
    for (let i = 0; i < steps; i++) {
      values.push(min + i * stepSize);
    }
    
    return values;
  };

  // Generate all combinations of parameters (Cartesian product)
  const generateParameterCombinations = (parameterValues: Record<string, number[]>): Record<string, number>[] => {
    const paramNames = Object.keys(parameterValues);
    if (paramNames.length === 0) return [];

    const combinations: Record<string, number>[] = [];
    
    function generateCombos(index: number, currentCombo: Record<string, number>) {
      if (index === paramNames.length) {
        combinations.push({...currentCombo});
        return;
      }
      
      const paramName = paramNames[index];
      const values = parameterValues[paramName];
      
      for (const value of values) {
        currentCombo[paramName] = value;
        generateCombos(index + 1, currentCombo);
      }
    }
    
    generateCombos(0, {});
    return combinations;
  };

  // Substitute parameters in MX3 template
  const substituteParametersInTemplate = (
    template: string, 
    parameters: Record<string, number>,
    selectedParameters: string[]
  ): string => {
    let result = template;
    
    // Add header comment with parameter values
    const headerComment = `// Generated MX3 simulation script
// Parameters: ${Object.entries(parameters).map(([key, value]) => `${key}=${value}`).join(', ')}
// Generated on: ${new Date().toISOString()}

`;
    
    result = headerComment + result;
    
    // Substitute each parameter
    for (const [paramName, paramValue] of Object.entries(parameters)) {
      if (selectedParameters.includes(paramName)) {
        // Replace parameter definitions with actual values
        const patterns = [
          new RegExp(`^\\s*${paramName}\\s*:?=\\s*[0-9.-]+`, 'gm'),
          new RegExp(`^\\s*${paramName}\\s*:?=\\s*[^\\n]+`, 'gm'),
          new RegExp(`\\b${paramName}\\b(?=\\s*[^a-zA-Z0-9_])`, 'g')
        ];
        
        for (const pattern of patterns) {
          result = result.replace(pattern, (match) => {
            if (match.includes('=')) {
              return `${paramName} := ${paramValue}`;
            } else {
              return paramValue.toString();
            }
          });
        }
      }
    }
    
    return result;
  };

  // Pipeline validation function
  const validatePipeline = (downloadNodeId: string): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    if (!activeFlow) {
      errors.push("Brak aktywnego przepływu");
      return { isValid: false, errors };
    }

    const downloadNode = activeFlow.nodes.find(n => n.id === downloadNodeId);
    if (!downloadNode || downloadNode.type !== 'download-scripts') {
      errors.push("Nieprawidłowy węzeł pobierania");
      return { isValid: false, errors };
    }

    // Check if SimsGen is connected
    const simsGenConnection = activeFlow.connections.find(
      conn => conn.target === downloadNodeId && conn.targetInput === 'simulation_scripts'
    );
    
    if (!simsGenConnection) {
      errors.push("Węzeł 'Download Scripts' musi być połączony z 'Simulations Generator'");
    } else {
      const simsGenNode = activeFlow.nodes.find(n => n.id === simsGenConnection.source);
      if (!simsGenNode || simsGenNode.type !== 'sims-gen') {
        errors.push("Nieprawidłowe połączenie z węzłem SimsGen");
      } else {
        // Check if SimsGen has parameter inputs
        const paramConnections = activeFlow.connections.filter(
          conn => conn.target === simsGenNode.id
        );
        
        if (paramConnections.length === 0) {
          errors.push("Węzeł 'Simulations Generator' musi mieć podłączone parametry z 'LinSpace Generator'");
        }

        // Check if we have a complete chain: FileLoader -> Parser -> LinSpace -> SimsGen
        let hasCompleteChain = false;
        
        for (const conn of paramConnections) {
          const sourceNode = activeFlow.nodes.find(n => n.id === conn.source);
          if (sourceNode?.type === 'linspace') {
            // Check if LinSpace has parameter name from Parser
            const parserConnection = activeFlow.connections.find(
              c => c.target === sourceNode.id
            );
            
            if (parserConnection) {
              const parserNode = activeFlow.nodes.find(n => n.id === parserConnection.source);
              if (parserNode?.type === 'mx3-parser') {
                // Check if Parser has file from FileLoader
                const loaderConnection = activeFlow.connections.find(
                  c => c.target === parserNode.id
                );
                
                if (loaderConnection) {
                  const loaderNode = activeFlow.nodes.find(n => n.id === loaderConnection.source);
                  if (loaderNode?.type === 'mx3-file-loader' && loaderNode.data.uploadedFile) {
                    hasCompleteChain = true;
                    break;
                  }
                }
              }
            }
          }
        }

        if (!hasCompleteChain) {
          errors.push("Brak kompletnego łańcucha: MX3 File Loader → MX3 Parser → LinSpace Generator → Simulations Generator → Download Scripts");
        }
      }
    }

    return { isValid: errors.length === 0, errors };
  };

  // Enhanced download with validation
  const downloadScriptsWithValidation = (nodeId: string) => {
    const validation = validatePipeline(nodeId);
    
    if (!validation.isValid) {
      toast.error("Błędy w pipeline:");
      validation.errors.forEach(error => {
        toast.error(error);
      });
      return;
    }

    downloadScripts(nodeId);
  };

  const downloadScripts = (nodeId: string) => {
    if (!activeFlow) return;
    
    toast.info("Wykonywanie pipeline i generowanie skryptów...");
    
    try {
      // Execute the full pipeline
      const result = executeFullPipeline(nodeId);
      
      if (!result.success || result.files.length === 0) {
        toast.error("Nie udało się wygenerować skryptów");
        return;
      }
      
      // Create ZIP file with all generated scripts
      const JSZip = require('jszip'); // Note: You'll need to install jszip
      const zip = new JSZip();
      
      // Add all generated files to ZIP
      result.files.forEach(file => {
        zip.file(file.name, file.content);
      });
      
      // Add metadata file
      const metadata = {
        generated_at: new Date().toISOString(),
        total_files: result.files.length,
        flow_name: activeFlow.name,
        flow_id: activeFlow.id,
        parameters_info: "Check individual files for parameter values"
      };
      
      zip.file('metadata.json', JSON.stringify(metadata, null, 2));
      
      // Generate and download ZIP
      zip.generateAsync({ type: 'blob' }).then((content: Blob) => {
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mx3_simulations_${activeFlow.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        toast.success(`Wygenerowano i pobrano ${result.files.length} skryptów symulacji`);
      });
      
    } catch (error) {
      console.error('Error generating scripts:', error);
      toast.error("Błąd podczas generowania skryptów");
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
                <DropdownMenuItem onClick={() => addNode('mx3-file-loader', { x: 100, y: 200 })}>
                  <Upload className="h-4 w-4 mr-2" />
                  MX3 File Loader
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addNode('mx3-parser', { x: 300, y: 200 })}>
                  <FileText className="h-4 w-4 mr-2" />
                  MX3 Parser
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addNode('linspace', { x: 500, y: 200 })}>
                  <ArrowRight className="h-4 w-4 mr-2" />
                  LinSpace Generator
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addNode('sims-gen', { x: 700, y: 200 })}>
                  <Cpu className="h-4 w-4 mr-2" />
                  Simulations Generator
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addNode('download-scripts', { x: 900, y: 200 })}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Scripts
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addNode('output', { x: 1100, y: 200 })}>
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
                      node.type === 'mx3-file-loader' ? 'bg-orange-500' :
                      node.type === 'mx3-parser' ? 'bg-blue-500' :
                      node.type === 'linspace' ? 'bg-green-500' :
                      node.type === 'sims-gen' ? 'bg-purple-500' :
                      node.type === 'download-scripts' ? 'bg-cyan-500' :
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
                      
                      {/* MX3 File Loader - Upload interface */}
                      {node.type === 'mx3-file-loader' && (
                        <div className="flex flex-col items-center justify-center h-full">
                          {!node.data.uploadedFile ? (
                            <div className="text-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const input = document.createElement('input');
                                  input.type = 'file';
                                  input.accept = '.mx3';
                                  input.onchange = (evt) => {
                                    const file = (evt.target as HTMLInputElement).files?.[0];
                                    if (file) {
                                      handleFileUpload(node.id, file);
                                    }
                                  };
                                  input.click();
                                }}
                                className="text-xs px-2 py-1 bg-orange-500 text-white rounded hover:bg-orange-600"
                              >
                                Upload MX3
                              </button>
                            </div>
                          ) : (
                            <div className="text-center">
                              <div className="text-xs text-green-600 mb-1">✓ {node.data.uploadedFile.name}</div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const input = document.createElement('input');
                                  input.type = 'file';
                                  input.accept = '.mx3';
                                  input.onchange = (evt) => {
                                    const file = (evt.target as HTMLInputElement).files?.[0];
                                    if (file) {
                                      handleFileUpload(node.id, file);
                                    }
                                  };
                                  input.click();
                                }}
                                className="text-xs px-2 py-1 bg-orange-500 text-white rounded hover:bg-orange-600"
                              >
                                Change File
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* MX3 Parser - Parameter selection */}
                      {node.type === 'mx3-parser' && (
                        <div className="flex flex-col h-full">
                          <div className="text-xs text-center mb-2">
                            {node.data.parsedParameters?.length ? 
                              `${node.data.selectedParameters?.length || 0}/${node.data.parsedParameters.length} params` :
                              'No file connected'
                            }
                          </div>
                          {node.data.parsedParameters && node.data.parsedParameters.length > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openConfigModal(node.id);
                              }}
                              className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                            >
                              Configure
                            </button>
                          )}
                        </div>
                      )}

                      {/* LinSpace - Range configuration */}
                      {node.type === 'linspace' && (
                        <div className="flex flex-col h-full">
                          <div className="text-xs text-center mb-2">
                            <div>Min: {node.data.config?.min || 0}</div>
                            <div>Max: {node.data.config?.max || 1}</div>
                            <div>Steps: {node.data.config?.steps || 10}</div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openLinspaceModal(node.id);
                            }}
                            className="text-xs bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600 transition-colors"
                          >
                            Konfiguruj
                          </button>
                        </div>
                      )}

                      {/* SimsGen - Input configuration */}
                      {node.type === 'sims-gen' && (
                        <div className="flex flex-col h-full">
                          <div className="text-xs text-center mb-2">
                            Inputs: {node.data.inputCount || 1}
                          </div>
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateSimsGenInputs(node.id, Math.max(1, (node.data.inputCount || 1) - 1));
                              }}
                              className="text-xs px-1 py-0.5 bg-red-500 text-white rounded hover:bg-red-600"
                            >
                              -
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateSimsGenInputs(node.id, (node.data.inputCount || 1) + 1);
                              }}
                              className="text-xs px-1 py-0.5 bg-green-500 text-white rounded hover:bg-green-600"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Download Scripts - Download button */}
                      {node.type === 'download-scripts' && (
                        <div className="flex flex-col h-full justify-center items-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadScriptsWithValidation(node.id);
                            }}
                            className="text-xs bg-cyan-500 text-white px-3 py-2 rounded hover:bg-cyan-600 transition-colors flex items-center gap-1"
                          >
                            <Download className="h-3 w-3" />
                            Pobierz
                          </button>
                          <div className="text-xs text-gray-500 mt-1 text-center">
                            Pobierz wszystkie wygenerowane skrypty
                          </div>
                        </div>
                      )}

                      {/* Default content for other node types */}
                      {!['mx3-file-loader', 'mx3-parser', 'linspace', 'sims-gen', 'download-scripts'].includes(node.type) && (
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

      {/* LinSpace Template configuration modal */}
      <Dialog open={linspaceModalOpen} onOpenChange={setLinspaceModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Konfiguracja dla LinSpace Template</DialogTitle>
            <DialogDescription>
              Ustawienia dla węzła LinSpace
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {currentLinspaceNodeId && activeFlow && (() => {
              const node = activeFlow.nodes.find(n => n.id === currentLinspaceNodeId);
              
              return (
                <div>
                  <Label className="text-sm font-medium">Zakres</Label>
                  <div className="flex flex-col mt-2">
                    <div className="flex items-center">
                      <Label className="text-sm">Min:</Label>
                      <Input
                        type="number"
                        value={linspaceConfig.min}
                        onChange={(e) => setLinspaceConfig({ ...linspaceConfig, min: parseFloat(e.target.value) })}
                        className="ml-2"
                      />
                    </div>
                    <div className="flex items-center mt-2">
                      <Label className="text-sm">Max:</Label>
                      <Input
                        type="number"
                        value={linspaceConfig.max}
                        onChange={(e) => setLinspaceConfig({ ...linspaceConfig, max: parseFloat(e.target.value) })}
                        className="ml-2"
                      />
                    </div>
                    <div className="flex items-center mt-2">
                      <Label className="text-sm">Kroki:</Label>
                      <Input
                        type="number"
                        value={linspaceConfig.steps}
                        onChange={(e) => setLinspaceConfig({ ...linspaceConfig, steps: parseInt(e.target.value) })}
                        className="ml-2"
                      />
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinspaceModalOpen(false)}>
              Anuluj
            </Button>
            <Button onClick={() => {
              saveLinspaceConfig();
            }}>
              Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
