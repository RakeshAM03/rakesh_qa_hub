"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { CiHeader } from "./ci-header";
import { JiraSettings } from "./jira-settings";
import { ListsEditor } from "./lists-editor";
import { useLists } from "./use-lists";

export function CiSettings() {
  const { lists, error, reload } = useLists();
  return (
    <>
      <CiHeader title="Customer Issue RCA — Settings" subtitle="Classification lists and the Jira connection. Adding items is open; editing, reordering and deleting need the admin passcode." />
      <Tabs defaultValue="lists">
        <TabsList>
          <TabsTrigger value="lists">Lists</TabsTrigger>
          <TabsTrigger value="jira">Jira</TabsTrigger>
        </TabsList>
        <TabsContent value="lists" className="mt-4">
          {error ? <p className="text-sm text-red-700">Couldn&apos;t load the lists. Refresh to try again.</p> : lists ? <ListsEditor lists={lists} reload={reload} /> : <Skeleton className="h-64 w-full" />}
        </TabsContent>
        <TabsContent value="jira" className="mt-4">
          {lists ? <JiraSettings lists={lists} /> : <Skeleton className="h-64 w-full" />}
        </TabsContent>
      </Tabs>
    </>
  );
}
