"use client";

import { useEffect } from "react";
import { redirect } from "next/navigation";
import { authApi } from "@/lib/api-client";

export default function Home() {
  useEffect(() => {
    // Sprawdź, czy użytkownik jest zalogowany
    if (authApi.isAuthenticated()) {
      redirect("/dashboard");
    } else {
      redirect("/login");
    }
  }, []);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="text-center">
        <div className="mb-4">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
        </div>
        <p>Przekierowywanie...</p>
      </div>
    </div>
  );
}
