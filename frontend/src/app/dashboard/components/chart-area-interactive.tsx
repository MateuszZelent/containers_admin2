import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts"

const data = [
  {
    average: 400,
    today: 240,
  },
  {
    average: 300,
    today: 139,
  },
  {
    average: 200,
    today: 980,
  },
  {
    average: 278,
    today: 390,
  },
  {
    average: 189,
    today: 480,
  },
  {
    average: 239,
    today: 380,
  },
  {
    average: 349,
    today: 430,
  },
]

export function ChartAreaInteractive() {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={data}>
        <Tooltip />
        <Line
          type="monotone"
          dataKey="today"
          strokeWidth={2}
          activeDot={{
            r: 8,
          }}
          style={{
            stroke: "hsl(var(--primary))",
          }}
        />
        <Line
          type="monotone"
          dataKey="average"
          strokeWidth={2}
          activeDot={{
            r: 8,
          }}
          style={{
            stroke: "hsl(var(--muted-foreground))",
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}