import React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Code2, Loader2 } from "lucide-react";
import { Job } from "../../../../lib/types";
import { LiveTimer } from "./live-timer";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TunnelData {
  id: number;
  local_port: number;
  remote_port: number;
  remote_host: string;
  status: string;
  created_at: string;
}

interface ActiveJobData {
  job_id: string;
  name: string;
  state: string;
  node: string;
  node_count: number;
  time_left: string;
  time_used?: string;
  memory_requested?: string;
  memory?: string;
  start_time?: string;
  submit_time?: string;
}

interface JobCardProps {
  job: Job;
  activeJobData?: ActiveJobData;
  tunnels: TunnelData[];
  isProcessing: boolean;
  canUseCodeServer: boolean;
  onDelete: () => void;
  onOpenCodeServer: () => void;
  formatDate: (date: string) => string;
}

export const JobCard = React.memo(({
  job,
  activeJobData,
  tunnels,
  isProcessing,
  canUseCodeServer,
  onDelete,
  onOpenCodeServer,
  formatDate
}: JobCardProps) => {
  return (
    <Card key={job.id}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {job.job_name}
        </CardTitle>
        <Badge variant={job.status === "RUNNING" ? "default" : "secondary"}>
          {job.status}
        </Badge>
      </CardHeader>
      <CardContent>
        {/* Card content with job details */}
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="grid grid-cols-2 gap-1">
            <p><span className="font-medium">ID:</span> {job.id}</p>
            <p><span className="font-medium">SLURM ID:</span> {job.job_id}</p>
            <p><span className="font-medium">Partycja:</span> {job.partition}</p>
            <p><span className="font-medium">Szablon:</span> {job.template_name}</p>
          </div>
          
          {/* Resource allocation */}
          <div className="mt-2 p-2 bg-muted/50 rounded-md">
            <h4 className="font-medium mb-1">Zasoby:</h4>
            <div className="grid grid-cols-2 gap-1">
              <p><span className="font-medium">CPU:</span> {job.num_cpus}</p>
              <p><span className="font-medium">Pamięć:</span> {job.memory_gb}GB</p>
              <p><span className="font-medium">GPU:</span> {job.num_gpus}</p>
              {job.node && <p><span className="font-medium">Węzeł:</span> {job.node}</p>}
            </div>
          </div>
          
          {/* Timing information - only show for running jobs */}
          {job.status === "RUNNING" && activeJobData && (
            <div className="mt-2 p-2 bg-muted/50 rounded-md">
              <h4 className="font-medium mb-1">Czas:</h4>
              <div className="space-y-1">
                {activeJobData.time_left && (
                  <p>
                    <span className="font-medium">Pozostało:</span>{" "}
                    <LiveTimer initialTime={activeJobData.time_left} />
                  </p>
                )}
                
                {activeJobData.time_used && (
                  <p>
                    <span className="font-medium">Czas użyty:</span>{" "}
                    <span className="font-mono">{activeJobData.time_used}</span>
                  </p>
                )}
                
                {activeJobData.start_time && (
                  <p>
                    <span className="font-medium">Start:</span>{" "}
                    {formatDate(activeJobData.start_time)}
                  </p>
                )}
                
                {activeJobData.submit_time && (
                  <p>
                    <span className="font-medium">Zgłoszenie:</span>{" "}
                    {formatDate(activeJobData.submit_time)}
                  </p>
                )}
              </div>
            </div>
          )}
          
          {job.port && <p><span className="font-medium">Port aplikacji:</span> {job.port}</p>}
          
          {/* Enhanced tunnel information */}
          {tunnels.length > 0 && (
            <div className="mt-2 p-2 bg-muted rounded-md">
              <p className="font-medium mb-1">Tunel SSH:</p>
              {tunnels.map((tunnel) => (
                <div key={tunnel.id} className="space-y-1">
                  <p className="flex items-center">
                    <span className={`h-2 w-2 rounded-full mr-2 ${
                      tunnel.status === 'ACTIVE' ? 'bg-green-500' : 
                      tunnel.status === 'DEAD' ? 'bg-red-500' : 'bg-gray-500'
                    }`}/>
                    <span>{tunnel.status === 'ACTIVE' ? 'Aktywny' : 
                           tunnel.status === 'DEAD' ? 'Nieaktywny' : 'Łączenie...'}</span>
                  </p>
                  <div className="text-xs border-l-2 border-muted-foreground/20 pl-2 mt-1 space-y-1">
                    <p className="font-medium">Przekierowanie portów:</p>
                    <p title="Port dostępny w przeglądarce i z zewnątrz kontenera">
                      Port zewnętrzny: <span className="font-mono bg-background px-1 rounded">{tunnel.local_port}</span>
                    </p>
                    <p title="Port wewnętrzny tunelu SSH w kontenerze">
                      Port wewnętrzny: <span className="font-mono bg-background px-1 rounded">{tunnel.remote_port}</span>
                    </p>
                    <p>
                      Host: <span className="font-mono">{tunnel.remote_host}</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      <span className="font-medium">Schemat:</span> 0.0.0.0:{tunnel.local_port} → 127.0.0.1:wewnętrzny → {tunnel.remote_host}:{tunnel.remote_port}
                    </p>
                  </div>
                  <p className="text-xs">Utworzony: {new Date(tunnel.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Code Server button */}
        <div className="mt-4 flex justify-end space-x-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onOpenCodeServer}
                    disabled={!canUseCodeServer || isProcessing}
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Code2 className="h-4 w-4 mr-2" />
                    )}
                    Code Server
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {!canUseCodeServer ? (
                  <p>Statusssss: &quot;{canUseCodeServer}&quot; / &quot;{isProcessing}&quot; <span className="font-semibold">{job.status}</span>. Musi być &quot;RUNNING&quot; aby uruchomić Code Server</p>
                ) : (
                  <p>Otwórz interfejs Code Server w nowej karcie</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <Button 
            variant="destructive" 
            size="sm"
            onClick={onDelete}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : null}
            Usuń
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});

JobCard.displayName = "JobCard";
