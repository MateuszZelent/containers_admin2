import React from "react";
import { motion } from "framer-motion";
import { Loader2, Clock, Cog } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ContainerCreationOverlayProps {
  status: string;
  jobName: string;
}

const getStatusInfo = (status: string) => {
  switch (status) {
    case "PENDING":
      return {
        stage: "1/2",
        title: "Tworzenie kontenera",
        subtitle: "Oczekiwanie na alokację zasobów...",
        description: "Kontener oczekuje na dostępne zasoby w klastrze",
        icon: <Clock className="h-8 w-8 text-amber-500" />,
        bgColor: "bg-amber-50/90 dark:bg-amber-950/90",
        borderColor: "border-amber-200 dark:border-amber-800",
        textColor: "text-amber-800 dark:text-amber-200",
        progressColor: "bg-amber-400",
        estimatedTime: "do 3 minut"
      };
    case "CONFIGURING":
      return {
        stage: "2/2",
        title: "Konfiguracja kontenera",
        subtitle: "Przygotowanie środowiska...",
        description: "Kontener jest konfigurowany i będzie gotowy za chwilę",
        icon: <Cog className="h-8 w-8 text-blue-500 animate-spin" />,
        bgColor: "bg-blue-50/90 dark:bg-blue-950/90",
        borderColor: "border-blue-200 dark:border-blue-800",
        textColor: "text-blue-800 dark:text-blue-200",
        progressColor: "bg-blue-400",
        estimatedTime: "do 2 minut"
      };
    default:
      return null;
  }
};

export const ContainerCreationOverlay: React.FC<ContainerCreationOverlayProps> = ({
  status,
  jobName
}) => {
  const statusInfo = getStatusInfo(status);

  if (!statusInfo) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-10 rounded-lg overflow-hidden"
    >
      {/* Backdrop blur */}
      <div className="absolute inset-0 backdrop-blur-sm bg-white/20 dark:bg-black/20" />
      
      {/* Overlay content */}
      <div className={`absolute inset-0 ${statusInfo.bgColor} ${statusInfo.borderColor} border-2 rounded-lg flex flex-col items-center justify-center p-6 space-y-4`}>
        
        {/* Status badge */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 300 }}
        >
          <Badge variant="secondary" className="mb-2">
            Etap {statusInfo.stage}
          </Badge>
        </motion.div>

        {/* Icon with animation */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="relative"
        >
          {statusInfo.icon}
          
          {/* Pulsing ring effect */}
          <motion.div
            animate={{ 
              scale: [1, 1.3, 1],
              opacity: [0.3, 0, 0.3]
            }}
            transition={{ 
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className={`absolute inset-0 rounded-full ${statusInfo.progressColor} opacity-20`}
          />
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center space-y-2"
        >
          <h3 className={`text-lg font-semibold ${statusInfo.textColor}`}>
            {statusInfo.title}
          </h3>
          <p className={`text-sm ${statusInfo.textColor} opacity-80`}>
            {statusInfo.subtitle}
          </p>
        </motion.div>

        {/* Container name */}
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center"
        >
          <p className={`text-xs ${statusInfo.textColor} opacity-70 mb-1`}>
            Kontener:
          </p>
          <p className={`font-mono text-sm ${statusInfo.textColor} font-medium`}>
            {jobName}
          </p>
        </motion.div>

        {/* Progress bar */}
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: "100%", opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="w-full"
        >
          <div className="h-2 bg-white/30 dark:bg-black/30 rounded-full overflow-hidden">
            <motion.div
              animate={{ 
                x: ["-100%", "100%"]
              }}
              transition={{ 
                duration: 1.5,
                repeat: Infinity,
                ease: "linear"
              }}
              className={`h-full w-1/3 ${statusInfo.progressColor} rounded-full`}
            />
          </div>
        </motion.div>

        {/* Description and time estimate */}
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center space-y-1"
        >
          <p className={`text-xs ${statusInfo.textColor} opacity-70`}>
            {statusInfo.description}
          </p>
          <p className={`text-xs ${statusInfo.textColor} opacity-60 flex items-center justify-center gap-1`}>
            <Clock className="h-3 w-3" />
            Czas oczekiwania: {statusInfo.estimatedTime}
          </p>
        </motion.div>

        {/* Loading dots */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="flex space-x-1"
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{
                y: [0, -8, 0],
                opacity: [0.4, 1, 0.4]
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: i * 0.2,
                ease: "easeInOut"
              }}
              className={`w-2 h-2 ${statusInfo.progressColor} rounded-full`}
            />
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
};
