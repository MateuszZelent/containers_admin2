"use client";

import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function TestToastPage() {
  const testBasicToast = () => {
    toast.success('Test success toast');
  };

  const testCustomToast = () => {
    toast('Custom toast', {
      description: 'This is a description',
      action: {
        label: 'Action',
        onClick: () => console.log('Action clicked'),
      },
    });
  };

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">Toast Test Page</h1>
      
      <div className="space-y-2">
        <Button onClick={testBasicToast}>
          Test Basic Toast
        </Button>
        
        <Button onClick={testCustomToast}>
          Test Custom Toast
        </Button>
        
        <Button onClick={() => toast.error('Error toast')}>
          Test Error Toast
        </Button>
        
        <Button onClick={() => toast.loading('Loading toast')}>
          Test Loading Toast
        </Button>
      </div>
    </div>
  );
}
