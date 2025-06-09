import { useState, useEffect } from "react";

interface LiveTimerProps {
  initialTime: string;
}

export function LiveTimer({ initialTime }: LiveTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [seconds, setSeconds] = useState<number>(0);
  
  // Parse initial time string into total seconds
  useEffect(() => {
    try {
      let totalSeconds = 0;
      
      // Handle multiple time formats
      // Format 1: "DD-HH:MM:SS" (e.g. "6-23:54:34")
      // Format 2: "HH:MM:SS" (e.g. "23:54:34")
      // Format 3: Large hours "HHH:MM:SS" (e.g. "123:45:56")
      
      if (!initialTime || initialTime === "N/A") {
        setTimeRemaining("00:00:00");
        setSeconds(0);
        return;
      }
      
      // Debug log
      console.log("LiveTimer parsing initialTime:", initialTime);
      
      // Check for negative time patterns (e.g., "-1:2:43")
      if (initialTime.startsWith('-') && !initialTime.includes('-', 1)) {
        console.warn("LiveTimer: Negative time detected, setting to 00:00:00");
        setTimeRemaining("00:00:00");
        setSeconds(0);
        return;
      }
      
      // Format the time to display immediately (without waiting for the interval)
      let formattedTime = initialTime;
      
      if (initialTime.includes('-')) {
        // Format 1: "DD-HH:MM:SS"
        const [dayPart, timePart] = initialTime.split('-');
        const days = parseInt(dayPart, 10);
        const timeParts = timePart.split(':').map(p => parseInt(p, 10));
        
        if (timeParts.length === 3) {
          totalSeconds = 
            days * 24 * 3600 +          // days to seconds
            timeParts[0] * 3600 +       // hours
            timeParts[1] * 60 +         // minutes
            timeParts[2];               // seconds
          
          formattedTime = `${days}d ${timeParts[0].toString().padStart(2, '0')}:${
            timeParts[1].toString().padStart(2, '0')}:${
            timeParts[2].toString().padStart(2, '0')}`;
        }
      } else {
        // Format 2 or 3: "HH:MM:SS" or "HHH:MM:SS"
        const timeParts = initialTime.split(':').map(p => parseInt(p, 10));
        
        if (timeParts.length === 3) {
          const hours = timeParts[0];
          const minutes = timeParts[1];
          const secs = timeParts[2];
          
          // Check for invalid/negative values
          if (isNaN(hours) || isNaN(minutes) || isNaN(secs) || 
              hours < 0 || minutes < 0 || secs < 0) {
            console.warn("LiveTimer: Invalid time values detected:", { hours, minutes, secs });
            setTimeRemaining("00:00:00");
            setSeconds(0);
            return;
          }
          
          totalSeconds = hours * 3600 + minutes * 60 + secs;
          
          // If hours exceed 24, convert to days format for better readability
          if (hours >= 24) {
            const days = Math.floor(hours / 24);
            const remainingHours = hours % 24;
            formattedTime = `${days}d ${remainingHours.toString().padStart(2, '0')}:${
              minutes.toString().padStart(2, '0')}:${
              secs.toString().padStart(2, '0')}`;
          } else {
            formattedTime = `${hours.toString().padStart(2, '0')}:${
              minutes.toString().padStart(2, '0')}:${
              secs.toString().padStart(2, '0')}`;
          }
        }
      }
      
      // Additional safety check
      if (totalSeconds < 0) {
        console.warn("LiveTimer: Negative totalSeconds detected:", totalSeconds);
        setTimeRemaining("00:00:00");
        setSeconds(0);
        return;
      }
      
      console.log("LiveTimer parsed:", { totalSeconds, formattedTime });
      setSeconds(totalSeconds);
      setTimeRemaining(formattedTime);
    } catch (error) {
      console.error("Error parsing time", initialTime, error);
      setTimeRemaining("00:00:00"); // Safe fallback
      setSeconds(0);
    }
  }, [initialTime]);
  
  // Update timer every second
  useEffect(() => {
    if (seconds <= 0) {
      setTimeRemaining("00:00:00");
      return;
    }
    
    const interval = setInterval(() => {
      setSeconds(prevSeconds => {
        const newSeconds = prevSeconds - 1;
        
        if (newSeconds <= 0) {
          clearInterval(interval);
          setTimeRemaining("00:00:00");
          return 0;
        }
        
        // Format the time to include days if necessary
        const days = Math.floor(newSeconds / (24 * 3600));
        const hours = Math.floor((newSeconds % (24 * 3600)) / 3600);
        const minutes = Math.floor((newSeconds % 3600) / 60);
        const secs = newSeconds % 60;
        
        // Ensure no negative values
        if (days < 0 || hours < 0 || minutes < 0 || secs < 0) {
          clearInterval(interval);
          setTimeRemaining("00:00:00");
          return 0;
        }
        
        let formattedTime = '';
        if (days > 0) {
          formattedTime = `${days}d ${hours.toString().padStart(2, '0')}:${
            minutes.toString().padStart(2, '0')}:${
            secs.toString().padStart(2, '0')}`;
        } else {
          formattedTime = `${hours.toString().padStart(2, '0')}:${
            minutes.toString().padStart(2, '0')}:${
            secs.toString().padStart(2, '0')}`;
        }
        
        setTimeRemaining(formattedTime);
        return newSeconds;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [seconds]);
  
  // Determine color based on remaining time (with dark mode support)
  const getTimeColor = () => {
    if (seconds < 300) return "text-red-500 dark:text-red-400"; // Less than 5 minutes
    if (seconds < 1800) return "text-amber-500 dark:text-amber-400"; // Less than 30 minutes
    return "text-green-500 dark:text-green-400";
  };
  
  return (
    <span className={`font-mono font-bold tabular-nums leading-none ${getTimeColor()}`}>{timeRemaining}</span>
  );
}
