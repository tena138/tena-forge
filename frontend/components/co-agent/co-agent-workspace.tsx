"use client";

import { BellRing, MessageSquareText } from "lucide-react";

import { CoAgentChatPanel } from "@/components/co-agent/co-agent-chat-panel";
import { RoutineQueue } from "@/components/co-agent/routine-queue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function CoAgentWorkspace() {
  return (
    <Tabs defaultValue="chat" className="space-y-5">
      <TabsList className="bg-white p-1 ring-1 ring-zinc-200">
        <TabsTrigger value="chat" className="inline-flex items-center gap-2 data-[state=active]:bg-black data-[state=active]:text-white">
          <MessageSquareText className="h-4 w-4" />
          채팅
        </TabsTrigger>
        <TabsTrigger value="routines" className="inline-flex items-center gap-2 data-[state=active]:bg-black data-[state=active]:text-white">
          <BellRing className="h-4 w-4" />
          루틴
        </TabsTrigger>
      </TabsList>
      <TabsContent value="chat" className="mt-0 focus-visible:outline-none">
        <CoAgentChatPanel />
      </TabsContent>
      <TabsContent value="routines" className="mt-0 focus-visible:outline-none">
        <RoutineQueue />
      </TabsContent>
    </Tabs>
  );
}
