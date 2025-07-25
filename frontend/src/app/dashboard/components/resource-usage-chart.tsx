"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { clusterApi } from "@/lib/api-client";
import { ResourceUsage } from "@/lib/types";

export function ResourceUsageChart() {
  const [data, setData] = useState<ResourceUsage[]>([]);

  useEffect(() => {
    clusterApi.getUsageHistory().then((res) => {
      setData(res.data);
    });
  }, []);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Wykorzystanie zasobów</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorContainers" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(value) => new Date(value).toLocaleTimeString()}
            />
            <YAxis />
            <Tooltip labelFormatter={(v) => new Date(v).toLocaleString()} />
            <Area
              type="monotone"
              dataKey="active_containers"
              stroke="hsl(var(--primary))"
              fillOpacity={1}
              fill="url(#colorContainers)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
