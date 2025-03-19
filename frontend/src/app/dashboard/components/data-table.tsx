import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface Task {
  id: string
  title: string
  status: string
  label: string
  priority: string
}

interface DataTableProps {
  data: Task[]
}

export function DataTable({ data }: DataTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Task</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Label</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((task) => (
          <TableRow key={task.id}>
            <TableCell className="font-medium">{task.title}</TableCell>
            <TableCell>{task.status}</TableCell>
            <TableCell>{task.priority}</TableCell>
            <TableCell>{task.label}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}